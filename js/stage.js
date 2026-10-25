// =====================================================================
// stage.js — 전투 공간: 바닥, 둥근 기둥(장애물), 충돌 판정, 화면 좌표 변환
//
// 좌표 (3가지)
//   x : 좌우 (오른쪽 +)
//   z : 깊이. 0 = 화면 안쪽(멀리), DEPTH = 화면 바깥쪽(가까이)
//   h : 높이. 바닥 0, 위로 +
// 화면에는 "안쪽일수록 위에" 그려집니다: 화면y = 바닥선(z) - h
//
// pillars : 부서진 둥근 기둥. 윗면(타원)에 보이는 그대로 올라설 수 있음
//   { x, z: 중심,  rx: 가로 반지름,  rz: 깊이 반지름,  h: 높이 }
// 층마다 이 목록만 바꾸면 다른 전투장이 됩니다.
// =====================================================================
G.Stage = (function () {
  const CFG = G.CFG;
  const NEAR_Y = CFG.GROUND_Y;      // 가장 가까운 바닥선의 화면 높이
  const DEPTH = CFG.DEPTH;          // 깊이 범위
  const STEP_UP = 6;                // 이 높이 이하 턱은 그냥 걸어서 올라감
  const LAND_MARGIN = 14;           // 윗면 가장자리에 걸쳐도 올라선 것으로 봐줌 (대충 맞아도 올라가게)

  const stage = {
    pillars: [
      { x: 130, z: 70, rx: 36, rz: 18, h: 44 },    // 왼쪽 낮은 기둥
      { x: 790, z: 40, rx: 40, rz: 20, h: 90 },    // 오른쪽 높은 기둥
    ],
  };

  // 깊이 z에서 바닥(h=0)의 화면 y
  function floorY(z) { return NEAR_Y - (DEPTH - z); }
  function screenY(z, h) { return floorY(z) - h; }

  // 몸 중심(x, z)이 기둥 윗면 타원(+여유)에 들어가는가. 1보다 작으면 안쪽
  function ellipseDist(p, x, z, margin) {
    const dx = (x - p.x) / (p.rx + margin), dz = (z - p.z) / (p.rz + margin);
    return dx * dx + dz * dz;
  }

  // (x, z)에 서 있을 때 발밑 높이 (가장 높은 기둥 윗면, 없으면 0)
  // maxH보다 높은 기둥은 무시 (몸보다 위에 있는 건 발판이 아님)
  function support(x, z, maxH) {
    let top = 0;
    for (const p of stage.pillars) {
      if (p.h <= maxH + STEP_UP && p.h > top && ellipseDist(p, x, z, LAND_MARGIN) < 1) top = p.h;
    }
    return top;
  }

  // 캐릭터 이동 + 충돌. body = { x, z, h, vx, vz, vh, halfWidth, halfDepth }
  // 착지해 있으면 true
  function move(c, dt) {
    const hw = c.halfWidth;
    let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;

    // 기둥 옆면에 부딪히면 둥글게 밀어냄 (벽을 따라 미끄러지듯 지나감)
    for (const p of stage.pillars) {
      if (c.h >= p.h - STEP_UP) continue;               // 기둥보다 높이 있으면 통과
      const ex = p.rx + hw, ez = p.rz + c.halfDepth;
      const dx = (nx - p.x) / ex, dz = (nz - p.z) / ez;
      const d = Math.hypot(dx, dz);
      if (d < 1 && d > 0) { nx = p.x + dx / d * ex; nz = p.z + dz / d * ez; }
    }
    c.x = Math.max(hw, Math.min(CFG.ARENA_W - hw, nx));
    c.z = Math.max(0, Math.min(DEPTH, nz));

    // 높이
    const floor = support(c.x, c.z, c.h);
    c.h += c.vh * dt;
    if (c.h <= floor && c.vh <= 0) { c.h = floor; c.vh = 0; return true; }
    if (c.h < floor) c.h = floor;   // 낮은 턱은 걸어서 올라감
    return false;
  }

  // ---------- 그리기 (임시 도형, 2단계에서 일러스트로 교체) ----------
  // 바닥: 칸처럼 보이는 줄 없이, 흩어진 돌 무늬만 (고정된 위치)
  const marks = [];
  (function makeMarks() {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      marks.push({ x: rnd() * CFG.ARENA_W, z: rnd() * DEPTH, w: 8 + rnd() * 26, a: rnd() * 0.5 - 0.25 });
    }
  })();

  function drawFloor(ctx) {
    const W = CFG.ARENA_W, far = floorY(0);
    const g = ctx.createLinearGradient(0, far, 0, NEAR_Y);
    g.addColorStop(0, '#1e1a27');
    g.addColorStop(1, '#383046');
    ctx.fillStyle = g;
    ctx.fillRect(-200, far, W + 400, NEAR_Y - far);
    // 돌 틈 무늬
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 1.2;
    for (const m of marks) {
      const y = floorY(m.z);
      ctx.beginPath();
      ctx.moveTo(m.x, y);
      ctx.lineTo(m.x + m.w, y + m.w * m.a);
      ctx.stroke();
    }
    // 안쪽 벽과 만나는 선, 앞쪽 단면
    ctx.fillStyle = '#4a4058';
    ctx.fillRect(-200, far - 2, W + 400, 2);
    ctx.fillStyle = '#1b1622';
    ctx.fillRect(-200, NEAR_Y, W + 400, CFG.VIEW_H - NEAR_Y + 400);
    ctx.fillStyle = '#4a4058';
    ctx.fillRect(-200, NEAR_Y, W + 400, 2);
    // 양쪽 끝 벽
    ctx.fillStyle = '#0f0c15';
    ctx.fillRect(-200, -400, 200, CFG.VIEW_H + 800);
    ctx.fillRect(W, -400, 200, CFG.VIEW_H + 800);
  }

  // highlight: 플레이어가 이 기둥에 올라설 수 있는 깊이에 있으면 테두리를 밝게
  function drawPillar(ctx, p, highlight) {
    const cx = p.x, top = floorY(p.z) - p.h, bot = floorY(p.z);
    // 바닥 그림자
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(cx, bot + 2, p.rx + 6, p.rz * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    // 옆면 (원기둥)
    const side = ctx.createLinearGradient(cx - p.rx, 0, cx + p.rx, 0);
    side.addColorStop(0, '#2c2537');
    side.addColorStop(0.45, '#463c55');
    side.addColorStop(1, '#2a2334');
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.moveTo(cx - p.rx, top);
    ctx.lineTo(cx - p.rx, bot);
    ctx.ellipse(cx, bot, p.rx, p.rz, 0, Math.PI, 0, true);
    ctx.lineTo(cx + p.rx, top);
    ctx.closePath();
    ctx.fill();
    // 세로 홈 (기둥 느낌)
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1.2;
    for (const k of [-0.55, 0, 0.55]) {
      const x = cx + p.rx * k, dy = p.rz * Math.sqrt(1 - k * k);
      ctx.beginPath(); ctx.moveTo(x, top + dy); ctx.lineTo(x, bot + dy); ctx.stroke();
    }
    // 윗면 (부서진 단면)
    ctx.fillStyle = '#5a4f6c';
    ctx.beginPath(); ctx.ellipse(cx, top, p.rx, p.rz, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.ellipse(cx - p.rx * 0.2, top + p.rz * 0.1, p.rx * 0.5, p.rz * 0.45, 0.3, 0, Math.PI * 2); ctx.fill();
    // 테두리
    ctx.lineWidth = highlight ? 2.2 : 1.4;
    ctx.strokeStyle = highlight ? '#e8d49a' : '#7a6d90';
    ctx.beginPath(); ctx.ellipse(cx, top, p.rx, p.rz, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // 깊이 정렬용 목록 (기둥은 안쪽 끝 기준). player를 주면 올라설 수 있는 기둥을 밝게 표시
  function drawables(player) {
    return stage.pillars.map(p => {
      const aligned = player && Math.abs(player.z - p.z) < p.rz + LAND_MARGIN && player.h < p.h + 1 &&
                      Math.abs(player.x - p.x) < p.rx + 140;
      return { key: p.z - p.rz, draw: ctx => drawPillar(ctx, p, aligned) };
    });
  }

  return { data: stage, DEPTH, floorY, screenY, support, move, drawFloor, drawables };
})();
