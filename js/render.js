// =====================================================================
// render.js — 리그를 화면에 그리기
//
// ★ 그래픽 교체 지점 ★
// 스킨의 각 파츠는 도형(shape)으로 그려집니다.
// 파츠에 img(이미지 파일 경로)가 있고 그 파일이 실제로 있으면 이미지로 그리고,
// 파일이 없거나 불러오기에 실패하면 자동으로 도형으로 그립니다.
//   img     : 'assets/bosses/pan/torso.png'
//   anchor  : 'top'    = 이미지 맨 위 가운데가 관절 (늘어진 팔·다리)
//             'bottom' = 이미지 맨 아래 가운데가 관절 (위로 선 몸통·머리)
//   lenMul  : 이미지 세로 길이 = 뼈 길이 × lenMul (손이 붙은 아래팔은 1보다 크게)
//   mirror  : true면 좌우 반전 (오른팔 이미지를 왼팔에 재사용할 때)
//   widthMul: 가로로만 늘리는 배율 (그림이 너무 가늘 때)
//   offset  : [x, y] 미세 조정 (게임 단위)
// =====================================================================
G.Render = (function () {
  // ---------- 이미지 불러오기 (한 번만 불러서 재사용) ----------
  const images = {};
  const missing = new Set();
  function getImg(src) {
    let rec = images[src];
    if (!rec) {
      const im = new Image();
      rec = images[src] = { im, ok: false };
      im.onload = () => { rec.ok = im.naturalWidth > 0; };
      im.onerror = () => { missing.add(src); console.warn('이미지 없음 (도형으로 대신 그림):', src); };
      im.src = src + '?v=' + (G.VERSION || 0);   // 업데이트 번호를 붙여서 예전 그림(캐시)을 쓰지 않게
    }
    return rec.ok ? rec.im : null;
  }

  // wLen: 가로 폭 기준 길이 (뼈가 원근 때문에 짧아져도 굵기는 유지)
  function drawImagePart(ctx, len, part, im, wLen) {
    const k = (len * (part.lenMul || 1)) / im.naturalHeight;
    const kw = ((wLen || len) * (part.lenMul || 1)) / im.naturalHeight;
    const w = im.naturalWidth * kw * (part.widthMul || 1), h = im.naturalHeight * k;
    const [ox, oy] = part.offset || [0, 0];
    ctx.save();
    if (part.anchor === 'bottom') {
      ctx.rotate(Math.PI);                 // 위로 선 뼈: 이미지를 바로 세움
      if (part.mirror) ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2 + ox, -h + oy, w, h);
    } else {
      if (part.mirror) ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2 + ox, oy, w, h);
    }
    ctx.restore();
  }

  function drawPart(ctx, len, part, wLen) {
    const im = part.img && getImg(part.img);
    if (im) drawImagePart(ctx, len, part, im, wLen);
    else SHAPES[part.shape](ctx, len, part);
  }

  // 배경 이미지: 그림 속 지평선(horizon, 위에서부터 비율)을 전투장 안쪽 끝(horizonY)에 맞추고,
  // 가로는 전투장 너비에 맞춤 (화면이 더 넓으면 양옆은 edge 색으로 채우고 부드럽게 이어 붙임)
  function background(ctx, src, viewW, viewH, camX, arenaW, horizon, horizonY, edge) {
    const im = src && getImg(src);
    if (!im) return false;
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const k = Math.max(arenaW * 0.98 / iw, horizonY / (horizon * ih));
    const w = iw * k, h = ih * k;
    // 그림 위쪽(달)이 잘리지 않게: 지평선을 맞추면 위가 잘릴 경우, 그림을 내려서 위를 화면 맨 위에 맞춤
    // (그림의 땅 부분은 전투장 바닥에 가려짐)
    const x = arenaW / 2 - camX * 0.85 - w / 2, y = Math.max(horizonY - horizon * h, 0);
    ctx.fillStyle = edge || '#000';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.drawImage(im, x, y, w, h);
    // 그림 양옆 가장자리를 바깥 색으로 흐리게
    for (const side of [0, 1]) {
      const gx = side ? x + w - 60 : x;
      const g = ctx.createLinearGradient(gx, 0, gx + 60, 0);
      g.addColorStop(side ? 0 : 1, 'rgba(0,0,0,0)');
      g.addColorStop(side ? 1 : 0, edge || '#000');
      ctx.fillStyle = g;
      ctx.fillRect(gx, y, 61, h);
    }
    return true;
  }

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
    // ----- 보스(석상 골렘) 정면 도형 -----
    // 이 좌표계에서 +y = 위쪽(목 방향), 좌우 대칭
    golemTorso(ctx, len, s) {
      const b = s.w1 / 2, t = s.w2 / 2;
      ctx.beginPath();
      ctx.moveTo(-b, -10);
      ctx.lineTo(b, -10);
      ctx.lineTo(t * 0.92, len - 28);
      ctx.quadraticCurveTo(t * 1.05, len + 4, t * 0.55, len + 6);   // 둥근 어깨
      ctx.lineTo(-t * 0.55, len + 6);
      ctx.quadraticCurveTo(-t * 1.05, len + 4, -t * 0.92, len - 28);
      ctx.closePath();
      fillStroke(ctx, s, 3);
      // 가슴 한가운데 빛나는 핵
      const cy = len * 0.62, pulse = s.pulse || 1;
      const g = ctx.createRadialGradient(0, cy, 2, 0, cy, 44);
      g.addColorStop(0, `rgba(255, 220, 140, ${0.95 * pulse})`);
      g.addColorStop(0.35, `rgba(255, 160, 60, ${0.6 * pulse})`);
      g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, cy, 44, 0, Math.PI * 2); ctx.fill();
      // 핵에서 뻗어 나가는 빛나는 균열
      ctx.strokeStyle = s.glow;
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
      ctx.lineWidth = 2.5;
      [[[0, cy], [-26, cy + 30], [-48, cy + 38], [-70, len - 6]],
       [[0, cy], [22, cy - 26], [40, cy - 30], [52, 10]],
       [[0, cy], [8, cy + 34], [-6, len]]].forEach(path => {
        ctx.beginPath();
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    },
    golemHead(ctx, len, s) {
      const w = s.r, h = len;
      ctx.beginPath();
      ctx.moveTo(-w * 0.8, 0);
      ctx.lineTo(w * 0.8, 0);
      ctx.lineTo(w, h * 0.55);
      ctx.lineTo(w * 0.7, h);
      ctx.lineTo(-w * 0.7, h);
      ctx.lineTo(-w, h * 0.55);
      ctx.closePath();
      fillStroke(ctx, s, 3);
      // 이마 그늘
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(-w * 0.9, h * 0.42, w * 1.8, h * 0.14);
      // 빛나는 두 눈
      const pulse = s.pulse || 1;
      ctx.save();
      ctx.shadowColor = s.glow;
      ctx.shadowBlur = 18 * pulse;
      ctx.fillStyle = `rgba(255, 210, 120, ${0.7 + 0.3 * pulse})`;
      ctx.fillRect(-w * 0.62, h * 0.34, w * 0.42, 7);
      ctx.fillRect(w * 0.2, h * 0.34, w * 0.42, 7);
      ctx.restore();
      // 머리 균열
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w * 0.3, h); ctx.lineTo(w * 0.1, h * 0.7); ctx.lineTo(w * 0.35, h * 0.58); ctx.stroke();
    },
    // 아래팔 + 손바닥과 손가락 (거인형 보스의 손). 좌표계 +y = 손 쪽
    beastArm(ctx, len, s) {
      capsule(ctx, len, s.w1, s.w2 * 0.8);
      fillStroke(ctx, s, 3);
      const pw = s.w2;
      // 손가락 4개 + 엄지
      for (let i = 0; i < 4; i++) {
        const a = -0.42 + i * 0.28;
        ctx.save(); ctx.translate(Math.sin(-a) * pw * 0.3, len + pw * 0.3); ctx.rotate(a);
        capsule(ctx, pw * 0.62, pw * 0.2, pw * 0.16);
        fillStroke(ctx, { color: s.finger || s.color }, 2.5);
        ctx.restore();
      }
      ctx.save(); ctx.translate(pw * 0.42, len + pw * 0.05); ctx.rotate(-1.0);
      capsule(ctx, pw * 0.45, pw * 0.22, pw * 0.17);
      fillStroke(ctx, { color: s.finger || s.color }, 2.5);
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, len + pw * 0.18, pw * 0.55, pw * 0.42, 0, 0, Math.PI * 2);
      fillStroke(ctx, s, 3);
    },
    // ----- 짐승형 신 (1층 판) 정면 도형 -----
    // 좌표계: +y = 위쪽(목 방향), 좌우 대칭
    beastTorso(ctx, len, s) {
      const b = s.w1 / 2, t = s.w2 / 2;
      ctx.beginPath();
      ctx.moveTo(-b, -10);
      ctx.quadraticCurveTo(0, -18, b, -10);
      ctx.quadraticCurveTo(t * 0.95, len * 0.45, t * 0.9, len - 22);   // 넓은 가슴
      ctx.quadraticCurveTo(t * 1.02, len + 6, t * 0.45, len + 8);       // 어깨
      ctx.lineTo(-t * 0.45, len + 8);
      ctx.quadraticCurveTo(-t * 1.02, len + 6, -t * 0.9, len - 22);
      ctx.quadraticCurveTo(-t * 0.95, len * 0.45, -b, -10);
      ctx.closePath();
      fillStroke(ctx, s, 3);
      // 가슴 근육 그늘
      ctx.fillStyle = s.shade;
      ctx.beginPath(); ctx.ellipse(-t * 0.35, len * 0.68, t * 0.32, len * 0.12, 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(t * 0.35, len * 0.68, t * 0.32, len * 0.12, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-3, len * 0.15, 6, len * 0.42);
      // 아랫배 털
      ctx.fillStyle = s.fur;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * b * 0.24 - 10, -6); ctx.lineTo(i * b * 0.24, 18 + (i % 2) * 8); ctx.lineTo(i * b * 0.24 + 10, -6);
        ctx.fill();
      }
      // 어깨에서 허리로 두른 잎사귀 띠
      ctx.fillStyle = s.leaf;
      for (let k = 0; k <= 10; k++) {
        const u = k / 10, x = t * 0.75 - u * (t * 0.75 + b * 0.8), y = len - 6 - u * (len - 30);
        ctx.save(); ctx.translate(x, y); ctx.rotate(0.7 + (k % 2) * 0.5);
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },
    hornedHead(ctx, len, s) {
      const w = s.r, h = len;
      // 뿔: 머리 위 양옆에서 바깥으로 말려 나감
      ctx.strokeStyle = '#0d0b12';
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.lineCap = 'round';
        const horn = (width, color) => {
          ctx.strokeStyle = color; ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(side * w * 0.45, h * 0.85);
          ctx.bezierCurveTo(side * w * 0.9, h * 1.45, side * w * 2.1, h * 1.25, side * w * 1.85, h * 0.7);
          ctx.quadraticCurveTo(side * w * 1.65, h * 0.38, side * w * 1.3, h * 0.6);
          ctx.stroke();
        };
        horn(22, '#0d0b12');
        horn(16, s.horn);
        ctx.restore();
      }
      // 귀 (옆으로 뾰족하게)
      ctx.fillStyle = s.color;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * w * 0.8, h * 0.62);
        ctx.lineTo(side * w * 1.55, h * 0.5);
        ctx.lineTo(side * w * 0.85, h * 0.45);
        ctx.closePath();
        fillStroke(ctx, s, 2.5);
      }
      // 얼굴 (아래로 갈수록 좁은 염소형)
      ctx.beginPath();
      ctx.moveTo(-w * 0.85, h * 0.9);
      ctx.quadraticCurveTo(0, h * 1.08, w * 0.85, h * 0.9);
      ctx.lineTo(w * 0.62, h * 0.3);
      ctx.quadraticCurveTo(0, h * 0.02, -w * 0.62, h * 0.3);
      ctx.closePath();
      fillStroke(ctx, s, 3);
      // 수염
      ctx.fillStyle = s.beard;
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, h * 0.24);
      ctx.quadraticCurveTo(-w * 0.2, -h * 0.25, 0, -h * 0.38);
      ctx.quadraticCurveTo(w * 0.2, -h * 0.25, w * 0.45, h * 0.24);
      ctx.closePath();
      fillStroke(ctx, { color: s.beard }, 2.5);
      // 이마 그늘 + 빛나는 눈
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(0, h * 0.6, w * 0.7, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      const pulse = s.pulse || 1;
      ctx.save();
      ctx.shadowColor = s.eye; ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = s.eye;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * w * 0.33, h * 0.56, w * 0.17, h * 0.045, side * -0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // 코
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, h * 0.32, w * 0.16, h * 0.04, 0, 0, Math.PI * 2); ctx.fill();
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

  function fillStroke(ctx, s, width) {
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.lineWidth = width || s.lineW || 1.6;
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
      inBone(ctx, j, len => drawPart(ctx, len, part, j.wLen));
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

  return { drawRig, shadow, drawJoints, background, getImg, missing };
})();
