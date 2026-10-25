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

  const player = G.Player.create(160);
  G.Combat.addDummy(300);   // 훈련용 허수아비 (1-3단계에서 몬스터로 교체)
  G.Combat.addDummy(905);

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
  }

  // ---------- 임시 배경 (2단계에서 일러스트 배경으로 교체) ----------
  function drawBackground() {
    const H = CFG.VIEW_H, GY = CFG.GROUND_Y;
    // 하늘 (탑 내부의 어두운 공간)
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120f1c');
    sky.addColorStop(0.7, '#1f1a2b');
    sky.addColorStop(1, '#16121e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, H);

    // 먼 기둥 (천천히 움직임 = 패럴랙스)
    layer(0.3, 220, (x) => {
      ctx.fillStyle = '#1b1726';
      ctx.fillRect(x, 20, 46, GY - 20);
      ctx.fillRect(x - 8, 20, 62, 10);
    });
    // 가까운 아치
    layer(0.6, 340, (x) => {
      ctx.fillStyle = '#231e31';
      ctx.fillRect(x, 60, 30, GY - 60);
      ctx.fillRect(x + 150, 60, 30, GY - 60);
      ctx.beginPath();
      ctx.moveTo(x + 30, 110);
      ctx.quadraticCurveTo(x + 105, 30, x + 150, 110);
      ctx.lineTo(x + 150, 92);
      ctx.quadraticCurveTo(x + 105, 12, x + 30, 92);
      ctx.fill();
    });
    // 빛줄기
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#d9c38a';
    layer(0.6, 340, (x) => {
      ctx.beginPath();
      ctx.moveTo(x + 80, 0); ctx.lineTo(x + 120, 0);
      ctx.lineTo(x + 190, GY); ctx.lineTo(x + 110, GY);
      ctx.fill();
    });
    ctx.restore();
  }

  // speed: 카메라 대비 움직이는 비율, gap: 반복 간격
  function layer(speed, gap, drawAt) {
    const off = -(camX * speed) % gap;
    for (let x = off - gap; x < viewW + gap; x += gap) drawAt(x);
  }

  // 바닥과 벽 (월드 좌표로 그림)
  function drawArena() {
    const GY = CFG.GROUND_Y, H = CFG.VIEW_H, W = CFG.ARENA_W;
    ctx.fillStyle = '#2a2433';
    ctx.fillRect(-200, GY, W + 400, H - GY);
    ctx.fillStyle = '#4a4058';
    ctx.fillRect(-200, GY, W + 400, 3);
    ctx.strokeStyle = '#211c29';
    ctx.lineWidth = 1.5;
    for (let x = 0; x < W; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, GY + 3); ctx.lineTo(x - 10, H); ctx.stroke();
    }
    // 양쪽 벽
    ctx.fillStyle = '#0f0c15';
    ctx.fillRect(-200, 0, 200, GY);
    ctx.fillRect(W, 0, 200, GY);
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
      `x ${p.x.toFixed(0)}  vx ${p.vx.toFixed(0)}  vy ${p.vy.toFixed(0)}`,
      `ground ${p.onGround}  stick ${G.Input.axis.x.toFixed(1)},${G.Input.axis.y.toFixed(1)}`,
      `dash cd ${p.dashCd.toFixed(2)}  무적 ${p.iframe > 0 ? 'ON' : '-'}`,
      `허수아비 누적 피해 ${G.Combat.targets.map(t => t.total).join(' / ')}`,
    ];
    lines.forEach((t, i) => ctx.fillText(t, 12 * s, (40 + i * 14) * s));
    ctx.restore();
  }

  // ---------- 게임 루프 ----------
  let last = performance.now(), acc = 0;
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
    }
    G.FX.update(dt);
    updateCamera(dt);

    // 그리기
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawBackground();
    ctx.setTransform(scale, 0, 0, scale, -camX * scale, 0);
    drawArena();
    G.Stage.draw(ctx);
    G.Combat.drawTargets(ctx);
    G.Player.draw(ctx, player);
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
