// =====================================================================
// stage.js — 전투 공간: 바닥, 발판, 장애물, 충돌 판정
//   platforms : 통과 발판. 아래에서 뛰어 올라갈 수 있고, 아래+점프로 내려옴
//   solids    : 막히는 장애물. 옆으로 못 지나가고 위에 올라설 수 있음
// 층마다 이 목록만 바꾸면 다른 전투장이 됩니다. (좌표: x, y = 왼쪽 위)
// =====================================================================
G.Stage = (function () {
  const GY = G.CFG.GROUND_Y;

  const stage = {
    platforms: [
      { x: 110, y: 165, w: 150 },
      { x: 530, y: 188, w: 150 },
      { x: 745, y: 122, w: 135 },
    ],
    solids: [
      { x: 370, y: GY - 42, w: 84, h: 42 },
    ],
  };

  // 캐릭터를 vx, vy로 움직이고 부딪히면 멈춤. 착지하면 onGround = true
  // body = { x, y(발), vx, vy, halfWidth, height, dropTimer }
  function move(b, dt) {
    const hw = b.halfWidth, h = b.height, W = G.CFG.ARENA_W;

    // --- 가로 이동 ---
    b.x += b.vx * dt;
    for (const s of stage.solids) {
      const vOverlap = b.y > s.y + 0.5 && b.y - h < s.y + s.h;
      if (!vOverlap) continue;
      if (b.x + hw > s.x && b.x - hw < s.x + s.w) {
        if (b.x < s.x + s.w / 2) b.x = s.x - hw; else b.x = s.x + s.w + hw;
        b.vx = 0;
      }
    }
    if (b.x < hw) { b.x = hw; b.vx = 0; }
    if (b.x > W - hw) { b.x = W - hw; b.vx = 0; }

    // --- 세로 이동 ---
    const prevY = b.y;
    b.y += b.vy * dt;
    let landed = false;

    if (b.vy >= 0) {
      let top = GY;
      const tops = stage.solids.map(s => ({ x: s.x, y: s.y, w: s.w }));
      if (!(b.dropTimer > 0)) tops.push(...stage.platforms);
      for (const p of tops) {
        const xOverlap = b.x + hw > p.x && b.x - hw < p.x + p.w;
        if (xOverlap && prevY <= p.y + 0.01 && b.y >= p.y && p.y < top) top = p.y;
      }
      if (b.y >= top) { b.y = top; b.vy = 0; landed = true; }
    } else {
      // 머리 부딪힘 (장애물 아래쪽)
      for (const s of stage.solids) {
        const xOverlap = b.x + hw > s.x && b.x - hw < s.x + s.w;
        const bottom = s.y + s.h;
        if (xOverlap && prevY - h >= bottom && b.y - h < bottom) { b.y = bottom + h; b.vy = 0; }
      }
    }
    return landed;
  }

  // 지금 서 있는 곳이 통과 발판인가 (아래로 내려오기 가능 여부)
  function onPlatform(b) {
    return stage.platforms.some(p => Math.abs(b.y - p.y) < 0.5 && b.x + b.halfWidth > p.x && b.x - b.halfWidth < p.x + p.w);
  }

  // x 위치에서 y보다 아래쪽에 있는 가장 가까운 바닥 높이 (그림자 위치용)
  function surfaceBelow(x, y) {
    let top = GY;
    for (const p of [...stage.platforms, ...stage.solids]) {
      if (x > p.x && x < p.x + p.w && p.y >= y - 0.5 && p.y < top) top = p.y;
    }
    return top;
  }

  // ---------- 그리기 (임시 도형, 2단계에서 일러스트로 교체) ----------
  function draw(ctx) {
    for (const p of stage.platforms) {
      ctx.fillStyle = '#3a3246';
      ctx.fillRect(p.x, p.y, p.w, 10);
      ctx.fillStyle = '#5c5070';
      ctx.fillRect(p.x, p.y, p.w, 3);
      // 받침대
      ctx.fillStyle = '#251f2e';
      ctx.fillRect(p.x + 10, p.y + 10, 8, 14);
      ctx.fillRect(p.x + p.w - 18, p.y + 10, 8, 14);
    }
    for (const s of stage.solids) {
      ctx.fillStyle = '#3d3449';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#5c5070';
      ctx.fillRect(s.x, s.y, s.w, 3);
      ctx.strokeStyle = '#231d2b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x + 0.75, s.y + 0.75, s.w - 1.5, s.h - 1.5);
      ctx.beginPath();
      ctx.moveTo(s.x + s.w * 0.45, s.y + 3); ctx.lineTo(s.x + s.w * 0.4, s.y + s.h);
      ctx.stroke();
    }
  }

  return { data: stage, move, onPlatform, surfaceBelow, draw };
})();
