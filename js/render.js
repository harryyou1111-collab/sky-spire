// =====================================================================
// render.js — 리그를 화면에 그리기
//
// ★ 그래픽 교체 지점 ★
// 지금은 "스킨"의 각 파츠가 도형(shape)입니다.
// 2단계에서 같은 스킨 항목을 이미지 정보로 바꾸면, 전투 코드를 건드리지 않고
// 그림만 교체됩니다. (이미지 그리기 기능은 2단계에서 추가 예정, 지금은 없음)
// =====================================================================
G.Render = (function () {

  // 뼈 하나를 그 뼈의 좌표계로 옮겨서 draw(ctx, len)을 실행
  function inBone(ctx, j, draw) {
    ctx.save();
    ctx.translate(j.o.x, j.o.y);
    ctx.rotate(j.a);
    draw(j.len);
    ctx.restore();
  }

  // 위쪽 폭 w1, 아래쪽 폭 w2인 둥근 막대 (팔다리)
  function capsule(ctx, len, w1, w2) {
    const r1 = w1 / 2, r2 = w2 / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r1, Math.PI, Math.PI * 2);
    ctx.lineTo(r2, len);
    ctx.arc(0, len, r2, 0, Math.PI);
    ctx.closePath();
  }

  const SHAPES = {
    capsule(ctx, len, s) {
      capsule(ctx, len, s.w1, s.w2);
      fillStroke(ctx, s);
      if (s.foot) { // 발: 앞쪽(+x)으로 튀어나온 부분
        ctx.beginPath();
        ctx.ellipse(s.foot * 0.45, len + 1, s.foot * 0.75, s.w2 * 0.45, 0, 0, Math.PI * 2);
        fillStroke(ctx, s);
      }
    },
    torso(ctx, len, s) {
      // 아래(골반) 폭 w1, 위(어깨) 폭 w2. 좌표계상 +y가 위쪽 방향
      const b = s.w1 / 2, t = s.w2 / 2;
      ctx.beginPath();
      ctx.moveTo(-b, -4);
      ctx.quadraticCurveTo(0, -8, b, -4);
      ctx.lineTo(t, len - 4);
      ctx.quadraticCurveTo(t, len + 4, 0, len + 4);
      ctx.quadraticCurveTo(-t, len + 4, -t, len - 4);
      ctx.closePath();
      fillStroke(ctx, s);
      // 허리띠
      ctx.fillStyle = s.belt;
      ctx.fillRect(-b - 0.5, 2, s.w1 + 1, 5);
    },
    head(ctx, len, s) {
      const cy = len * 0.5;
      ctx.beginPath();
      ctx.ellipse(0, cy, s.r * 0.92, s.r, 0, 0, Math.PI * 2);
      fillStroke(ctx, s);
      // 투구 눈 틈 (바라보는 방향 표시). 이 좌표계에서 -x 가 앞쪽
      ctx.fillStyle = s.visor;
      ctx.fillRect(-s.r * 0.95, cy + 1, s.r * 0.75, 3);
      // 투구 장식
      ctx.fillStyle = s.crest;
      ctx.beginPath();
      ctx.moveTo(2, cy + s.r * 0.6);
      ctx.quadraticCurveTo(s.r * 1.4, cy + s.r * 1.2, s.r * 1.6, cy + s.r * 0.2);
      ctx.quadraticCurveTo(s.r * 1.0, cy + s.r * 0.7, 3, cy + s.r * 0.2);
      ctx.fill();
    },
    sword(ctx, len, s) {
      const g = 6;              // 손잡이 길이
      ctx.fillStyle = s.grip;
      ctx.fillRect(-1.6, -3, 3.2, g + 3);
      ctx.fillStyle = s.guard;
      ctx.fillRect(-6, g - 1, 12, 3);
      ctx.beginPath();          // 칼날
      ctx.moveTo(-2.6, g + 2);
      ctx.lineTo(2.6, g + 2);
      ctx.lineTo(2.2, len - 7);
      ctx.lineTo(0, len);
      ctx.lineTo(-2.2, len - 7);
      ctx.closePath();
      ctx.fillStyle = s.blade;
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = s.edge;
      ctx.stroke();
    },
  };

  function fillStroke(ctx, s) {
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = s.outline || '#0d0b12';
    ctx.stroke();
  }

  // 캐릭터 전체 그리기
  // x, y = 발 위치(월드), facing = 1(오른쪽) / -1(왼쪽)
  function drawRig(ctx, joints, skin, order, x, y, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    for (const name of order) {
      const part = skin[name];
      const j = joints[name];
      if (!part || !j) continue;
      inBone(ctx, j, len => SHAPES[part.shape](ctx, len, part));
    }
    ctx.restore();
  }

  function shadow(ctx, x, y, w, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, w, w * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 디버그: 관절 점
  function drawJoints(ctx, joints, x, y, facing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    for (const k in joints) {
      const j = joints[k];
      ctx.fillStyle = k === 'hip' ? '#ff5a5a' : '#7fffb0';
      ctx.fillRect(j.o.x - 1.5, j.o.y - 1.5, 3, 3);
    }
    ctx.restore();
  }

  return { drawRig, shadow, drawJoints };
})();
