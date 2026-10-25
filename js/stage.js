// =====================================================================
// stage.js — 전투 공간: 바닥, 상자형 장애물, 충돌 판정, 화면 좌표 변환
//
// 좌표 (3가지)
//   x : 좌우 (오른쪽 +)
//   z : 깊이. 0 = 화면 안쪽(멀리), DEPTH = 화면 바깥쪽(가까이)
//   h : 높이. 바닥 0, 위로 +
// 화면에는 "안쪽일수록 위에" 그려집니다: 화면y = 바닥선(z) - h
//
// boxes : 바닥에 놓인 상자. 옆으로 못 지나가고, 위에 올라설 수 있음
//   { x, z, w(가로), d(깊이), h(높이) }  ← x, z는 왼쪽 안쪽 모서리
// 층마다 이 목록만 바꾸면 다른 전투장이 됩니다.
// =====================================================================
G.Stage = (function () {
  const CFG = G.CFG;
  const NEAR_Y = CFG.GROUND_Y;      // 가장 가까운 바닥선의 화면 높이
  const DEPTH = CFG.DEPTH;          // 깊이 범위
  const STEP_UP = 6;                // 이 높이 이하 턱은 그냥 걸어서 올라감

  const stage = {
    boxes: [
      { x: 360, z: 34, w: 80,  d: 34, h: 42 },   // 낮은 바위
      { x: 470, z: 0,  w: 130, d: 30, h: 140 },  // 높은 기둥 (더블 점프 또는 바위 밟고)
      { x: 720, z: 46, w: 70,  d: 30, h: 60 },   // 상자
    ],
  };

  // 깊이 z에서 바닥(h=0)의 화면 y
  function floorY(z) { return NEAR_Y - (DEPTH - z); }
  function screenY(z, h) { return floorY(z) - h; }

  // 몸(가로 hw, 깊이 hd)이 상자 바닥 면적과 겹치는가
  function footOverlap(b, x, z, hw, hd) {
    return x + hw > b.x && x - hw < b.x + b.w && z + hd > b.z && z - hd < b.z + b.d;
  }

  // (x, z)에 서 있을 때 발밑 높이 (가장 높은 상자 윗면, 없으면 0)
  // maxH보다 높은 상자는 무시 (몸보다 위에 있는 건 발판이 아님)
  function support(x, z, hw, hd, maxH) {
    let top = 0;
    for (const b of stage.boxes) {
      if (b.h <= maxH + STEP_UP && b.h > top && footOverlap(b, x, z, hw, hd)) top = b.h;
    }
    return top;
  }

  // 캐릭터 이동 + 충돌. body = { x, z, h, vx, vz, vh, halfWidth, halfDepth }
  // 착지해 있으면 true
  function move(c, dt) {
    const hw = c.halfWidth, hd = c.halfDepth;

    // 가로
    let nx = c.x + c.vx * dt;
    for (const b of stage.boxes) {
      if (c.h < b.h - STEP_UP && footOverlap(b, nx, c.z, hw, hd)) {
        nx = c.x < b.x + b.w / 2 ? b.x - hw : b.x + b.w + hw;
        c.vx = 0;
      }
    }
    c.x = Math.max(hw, Math.min(CFG.ARENA_W - hw, nx));

    // 깊이
    let nz = c.z + c.vz * dt;
    for (const b of stage.boxes) {
      if (c.h < b.h - STEP_UP && footOverlap(b, c.x, nz, hw, hd)) {
        nz = c.z < b.z + b.d / 2 ? b.z - hd : b.z + b.d + hd;
        c.vz = 0;
      }
    }
    c.z = Math.max(hd, Math.min(DEPTH, nz));

    // 높이
    const floor = support(c.x, c.z, hw, hd, c.h);
    c.h += c.vh * dt;
    if (c.h <= floor && c.vh <= 0) { c.h = floor; c.vh = 0; return true; }
    if (c.h < floor) c.h = floor;   // 낮은 턱은 걸어서 올라감
    return false;
  }

  // ---------- 그리기 (임시 도형, 2단계에서 일러스트로 교체) ----------
  // 바닥 띠 (월드 좌표, 카메라 적용된 상태에서 호출)
  function drawFloor(ctx) {
    const W = CFG.ARENA_W, far = floorY(0);
    // 바닥 윗면 (깊이가 있는 띠)
    const g = ctx.createLinearGradient(0, far, 0, NEAR_Y);
    g.addColorStop(0, '#231e2c');
    g.addColorStop(1, '#342c40');
    ctx.fillStyle = g;
    ctx.fillRect(-200, far, W + 400, NEAR_Y - far);
    // 돌바닥 줄눈
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    for (let z = 0; z <= DEPTH; z += 28) {
      ctx.beginPath(); ctx.moveTo(-200, floorY(z)); ctx.lineTo(W + 200, floorY(z)); ctx.stroke();
    }
    for (let x = 0; x < W; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, far); ctx.lineTo(x - 12, NEAR_Y); ctx.stroke();
    }
    // 앞쪽 단면
    ctx.fillStyle = '#1b1622';
    ctx.fillRect(-200, NEAR_Y, W + 400, CFG.VIEW_H - NEAR_Y);
    ctx.fillStyle = '#4a4058';
    ctx.fillRect(-200, NEAR_Y, W + 400, 2);
    // 안쪽 벽 아랫부분
    ctx.fillStyle = '#4a4058';
    ctx.fillRect(-200, far - 2, W + 400, 2);
    // 양쪽 끝 벽
    ctx.fillStyle = '#0f0c15';
    ctx.fillRect(-200, 0, 200, CFG.VIEW_H);
    ctx.fillRect(W, 0, 200, CFG.VIEW_H);
  }

  function drawBox(ctx, b) {
    const topY = floorY(b.z) - b.h, frontTop = floorY(b.z + b.d) - b.h, frontBottom = floorY(b.z + b.d);
    ctx.fillStyle = '#4f4560';                       // 윗면
    ctx.fillRect(b.x, topY, b.w, frontTop - topY);
    ctx.fillStyle = '#6a5d7e';
    ctx.fillRect(b.x, frontTop - 2, b.w, 2);         // 모서리 하이라이트
    ctx.fillStyle = '#352d42';                       // 앞면
    ctx.fillRect(b.x, frontTop, b.w, frontBottom - frontTop);
    ctx.strokeStyle = '#1d1825';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x + 0.75, topY + 0.75, b.w - 1.5, frontBottom - topY - 1.5);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w * 0.55, frontTop); ctx.lineTo(b.x + b.w * 0.45, frontBottom);
    ctx.stroke();
  }

  // 깊이 정렬용 목록: 상자는 안쪽 모서리(z) 기준
  function drawables() {
    return stage.boxes.map(b => ({ key: b.z, draw: ctx => drawBox(ctx, b) }));
  }

  return { data: stage, DEPTH, floorY, screenY, support, move, drawFloor, drawables };
})();
