// =====================================================================
// main.js — 화면 크기, 게임 루프, 카메라, 배경, 디버그 표시
// =====================================================================
(function () {
  const CFG = G.CFG;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let scale = 1;      // 게임 단위 1 = 화면 픽셀 몇 개인가
  let viewW = 640;    // 화면에 보이는 가로 길이 (게임 단위)
  let camX = 0;
  let camY = 0;      // 높은 곳에 올라가면 화면이 위로 따라감 (0 또는 음수)

  const player = G.Player.create(300, 95);
  G.Combat.addDummy(560, 100);  // 공격 확인용 허수아비 (1-3단계에서 보스 타격으로 교체)
  G.Boss.place();
  G.Boss.updateUI();

  // ---------- 화면 크기 맞추기 ----------
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1); // 3배 기기는 2배로 제한 (성능)
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = canvas.height / CFG.VIEW_H;
    viewW = canvas.width / scale;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 카메라 ----------
  function updateCamera(dt, snap) {
    let target = player.x - viewW / 2 + player.facing * CFG.camera.lookAhead;
    if (viewW >= CFG.ARENA_W) target = (CFG.ARENA_W - viewW) / 2;
    else target = Math.max(0, Math.min(CFG.ARENA_W - viewW, target));
    camX = snap ? target : camX + (target - camX) * Math.min(1, CFG.camera.follow * dt);
    const targetY = Math.min(0, player.sy - 135);   // 머리가 화면 밖으로 나가려 하면 따라감
    camY = snap ? targetY : camY + (targetY - camY) * Math.min(1, CFG.camera.follow * 0.6 * dt);
  }

  // ---------- 임시 배경 (2단계에서 일러스트 배경으로 교체) ----------
  // 보스가 주인공이므로 배경은 단순하게: 탑 꼭대기의 어두운 하늘 + 보스 뒤 큰 달빛
  function drawBackground() {
    const H = CFG.VIEW_H;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d0a16');
    sky.addColorStop(0.55, '#231a2e');
    sky.addColorStop(1, '#120e18');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, H);
    // 보스 뒤 달 (보스 위치와 맞춰서, 카메라보다 천천히 움직임)
    const mx = CFG.ARENA_W / 2 - camX * 0.85, my = 150;
    const g = ctx.createRadialGradient(mx, my, 20, mx, my, 260);
    g.addColorStop(0, 'rgba(255, 214, 160, 0.30)');
    g.addColorStop(0.4, 'rgba(200, 130, 120, 0.12)');
    g.addColorStop(1, 'rgba(120, 80, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, H);
    ctx.fillStyle = 'rgba(255, 228, 190, 0.18)';
    ctx.beginPath(); ctx.arc(mx, my, 120, 0, Math.PI * 2); ctx.fill();
    // 멀리 보이는 부서진 탑 외벽 (양옆)
    layer(0.4, 520, (x) => {
      ctx.fillStyle = '#16111f';
      ctx.fillRect(x, 120, 34, H);
      ctx.fillRect(x + 60, 200, 22, H);
    });
  }

  // speed: 카메라 대비 움직이는 비율, gap: 반복 간격
  function layer(speed, gap, drawAt) {
    const off = -(camX * speed) % gap;
    for (let x = off - gap; x < viewW + gap; x += gap) drawAt(x);
  }

  // ---------- 디버그 ----------
  const dbgBtn = document.getElementById('btn-debug');
  dbgBtn.classList.toggle('on', CFG.debug);
  dbgBtn.addEventListener('click', () => {
    CFG.debug = !CFG.debug;
    dbgBtn.classList.toggle('on', CFG.debug);
  });
  let fps = 60;

  function drawDebug() {
    const p = player;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const s = Math.max(1, canvas.height / 360);
    ctx.font = `${Math.round(11 * s)}px monospace`;
    ctx.fillStyle = fps >= 55 ? '#7fffb0' : '#ff8a5a';
    const lines = [
      `FPS ${fps.toFixed(0)}`,
      `state ${p.state}${p.atk ? ' / ' + p.atk.phase : ''}`,
      `x ${p.x.toFixed(0)}  깊이 ${p.z.toFixed(0)}  높이 ${p.h.toFixed(0)}  점프 ${p.jumps}`,
      `ground ${p.onGround}  stick ${G.Input.axis.x.toFixed(1)},${G.Input.axis.y.toFixed(1)}`,
      `dash cd ${p.dashCd.toFixed(2)}  무적 ${p.iframe > 0 ? 'ON' : '-'}`,
      `허수아비 누적 피해 ${G.Combat.targets.map(t => t.total).join(' / ')}`,
    ];
    lines.forEach((t, i) => ctx.fillText(t, 12 * s, (40 + i * 14) * s));
    ctx.restore();
  }

  // ---------- 게임 루프 ----------
  let last = performance.now(), acc = 0;
  player.sy = G.Stage.screenY(player.z, player.h);
  updateCamera(0, true);

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // 탭 전환 후 돌아왔을 때 순간이동 방지
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;

    // 타격 정지 중에는 캐릭터가 멈춤 (입력은 기억해 둠)
    const fx = G.FX.state;
    if (fx.hitstop > 0) {
      fx.hitstop = Math.max(0, fx.hitstop - dt);
    } else {
      // 물리: 고정 간격으로 여러 번 계산
      acc += dt;
      while (acc >= CFG.STEP) {
        G.Player.step(player, CFG.STEP);
        G.Input.endStep();
        acc -= CFG.STEP;
        if (fx.hitstop > 0) { acc = 0; break; }  // 이번 계산에서 맞혔으면 바로 멈춤
      }
      G.Player.animate(player, dt);
      G.Combat.update(dt);
      G.Boss.update(dt);
    }
    G.FX.update(dt);
    updateCamera(dt);

    // 그리기
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawBackground();
    ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
    G.Boss.drawBack(ctx);      // 낭떠러지 뒤 보스 상반신
    G.Stage.drawFloor(ctx);
    G.Boss.drawFront(ctx);     // 바닥을 짚은 보스 손
    // 안쪽(z 작음)부터 그려서 앞에 있는 것이 위에 보이게
    const list = [...G.Stage.drawables(player), ...G.Combat.drawables(), G.Player.drawable(player)];
    list.sort((a, b) => a.key - b.key);
    for (const d of list) d.draw(ctx);
    G.FX.drawFront(ctx);
    if (CFG.debug) G.Combat.drawDebug(ctx, player);
    if (CFG.debug) drawDebug();

    requestAnimationFrame(frame);
  }

  // ---------- 시작 화면: 첫 터치로 전체화면 + 가로 고정 ----------
  const start = document.getElementById('start');
  start.addEventListener('pointerdown', () => {
    start.classList.add('hidden');
    const el = document.documentElement;
    try {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        const pr = req.call(el);
        if (pr && pr.then) {
          pr.then(() => {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(() => {});
            }
          }).catch(() => {});
        }
      }
    } catch (e) { /* 전체화면을 지원하지 않는 브라우저는 그냥 진행 */ }
  });

  G.Input.init();
  requestAnimationFrame(frame);

  // 개발 확인용: 콘솔에서 G.player 로 상태 확인 가능
  G.player = player;
})();
