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

  const START = { x: 450, z: 100 };
  const player = G.Player.create(START.x, START.z);
  G.player = player;
  G.Floor.start(1, player);       // 1층부터: 몹 구간 → 보스방 (floors.js)

  // ---------- 게임 흐름: 승리 / 패배 / 재도전, 플레이어 체력 표시 ----------
  const result = document.getElementById('result');
  const hpFill = document.querySelector('#player-hp .fill');
  const potionCount = document.getElementById('potion-count');
  const potionBtn = document.querySelector('[data-act="heal"]');
  G.Game = {
    win() {
      G.Floor.cleared();
      show(`${G.Floor.state.n}층 클리어`, `${G.Boss.def.name}을(를) 쓰러뜨렸습니다 · 다음 층은 준비 중`);
      result.querySelector('button').textContent = '처음부터';
    },
    lose() { setTimeout(() => show('패배', '쓰러졌습니다'), 900); },
    updateHUD() {
      hpFill.style.width = (player.hp / CFG.player.maxHp * 100) + '%';
      potionCount.textContent = player.potions;
      potionBtn.classList.toggle('empty', player.potions <= 0);
    },
    // 다시 도전: 몹 구간에서 죽었으면 몹 구간부터, 보스전에서 죽었으면 보스전부터 (체력·포션은 가득)
    restart() {
      const cleared = G.Floor.state.phase === 'clear';
      Object.assign(player, G.Player.create(START.x, START.z));
      if (cleared) G.Floor.start(G.Floor.state.n, player); else G.Floor.retry(player);
      result.classList.add('hidden');
      result.querySelector('button').textContent = '다시 도전';
      G.Game.updateHUD();
    },
  };
  function show(title, sub) {
    result.querySelector('.title').textContent = title;
    result.querySelector('.sub').textContent = sub;
    result.classList.remove('hidden');
  }
  result.querySelector('button').addEventListener('click', () => G.Game.restart());
  G.Game.updateHUD();

  // ---------- 화면 크기 맞추기 ----------
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1); // 3배 기기는 2배로 제한 (성능)
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = canvas.height / CFG.VIEW_H;
    G.viewScale = scale;                                   // 3D 캐릭터 그림 선명도용
    if (G.Hero3D && G.Hero3D.ready) G.Hero3D.resize();
    viewW = canvas.width / scale;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 카메라 ----------
  function updateCamera(dt, snap) {
    let target = player.x - viewW / 2 + player.facing * CFG.camera.lookAhead;
    // 지금 움직일 수 있는 범위(구역 잠금 포함) 안에서만 따라감
    const b0 = G.Stage.data.minX, b1 = G.Stage.data.maxX;
    if (viewW >= b1 - b0) target = (b0 + b1 - viewW) / 2;
    else target = Math.max(b0, Math.min(b1 - viewW, target));
    // 길 전체보다 바깥(검은 빈 곳)은 보여주지 않음. 보스방처럼 화면보다 좁으면 가운데
    if (viewW < CFG.ARENA_W) target = Math.max(0, Math.min(CFG.ARENA_W - viewW, target));
    camX = snap ? target : camX + (target - camX) * Math.min(1, CFG.camera.follow * dt);
    const targetY = Math.min(0, player.sy - 135);   // 머리가 화면 밖으로 나가려 하면 따라감
    camY = snap ? targetY : camY + (targetY - camY) * Math.min(1, CFG.camera.follow * 0.6 * dt);
  }

  // ---------- 임시 배경 (2단계에서 일러스트 배경으로 교체) ----------
  // 보스가 주인공이므로 배경은 단순하게: 보스 테마 색의 하늘 + 보스 뒤 큰 달 + 실루엣
  function drawBackground() {
    const H = CFG.VIEW_H, th = G.Boss.def.theme;
    // 배경 그림이 있으면 그것만 (그림 속 지평선을 전투장 안쪽 끝에 맞춤)
    // 몹 구간(긴 길): 배경 그림을 이어 붙여 천천히 흘려보냄
    if (!G.Floor.isBoss() && G.Render.backgroundScroll(ctx, th.bg, viewW, H, camX, th.horizon || 0.62, G.Stage.floorY(0) - camY, th.sky[0], 0.3)) return;
    if (G.Render.background(ctx, th.bg, viewW, H, camX, CFG.ARENA_W, th.horizon || 0.62, G.Stage.floorY(0) - camY, th.sky[0])) return;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(0.55, th.sky[1]);
    sky.addColorStop(1, th.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, H);
    // 보스 뒤 달 (보스 위치와 맞춰서, 카메라보다 천천히 움직임)
    const mx = CFG.ARENA_W / 2 - camX * 0.85, my = 150;
    const g = ctx.createRadialGradient(mx, my, 20, mx, my, 280);
    g.addColorStop(0, `rgba(${th.moon}, 0.32)`);
    g.addColorStop(0.45, `rgba(${th.moon}, 0.10)`);
    g.addColorStop(1, `rgba(${th.moon}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, H);
    ctx.fillStyle = `rgba(${th.moon}, 0.16)`;
    ctx.beginPath(); ctx.arc(mx, my, 120, 0, Math.PI * 2); ctx.fill();
    if (th.silhouette === 'trees') {
      // 멀고 가까운 두 겹의 숲 실루엣
      layer(0.25, 150, (x) => tree(x, 250, 70, '#0d1a13'));
      layer(0.45, 230, (x) => tree(x + 60, 285, 95, '#08110c'));
    } else {
      layer(0.4, 520, (x) => {
        ctx.fillStyle = '#16111f';
        ctx.fillRect(x, 120, 34, H);
        ctx.fillRect(x + 60, 200, 22, H);
      });
    }
  }
  function tree(x, baseY, size, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x - size * 0.06, baseY - size * 0.6, size * 0.12, size * 0.6 + 200);
    for (let i = 0; i < 3; i++) {
      const y = baseY - size * (0.45 + i * 0.32), w = size * (0.5 - i * 0.12);
      ctx.beginPath(); ctx.moveTo(x - w, y + size * 0.25); ctx.lineTo(x, y - size * 0.3); ctx.lineTo(x + w, y + size * 0.25); ctx.fill();
    }
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
      G.Render.missing.size ? `없는 그림 ${G.Render.missing.size}개 (도형으로 대신)` : '그림 파일 모두 있음',
      `체력 ${p.hp}  보스 ${G.Boss.state.hp}/${G.Boss.state.maxHp}  자세 ${G.Boss.state.cur.key}${G.Boss.state.slam ? ' 찍기:' + G.Boss.state.slam.phase : ''}`,
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
      G.Floor.update(dt, player);    // 몹 구간 / 문 / 보스전 진행
    }
    G.FX.update(dt);
    updateCamera(dt);

    // 그리기
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawBackground();
    const sx = fx.shakeX, sy = fx.shakeY;   // 화면 흔들림
    ctx.setTransform(scale, 0, 0, scale, (-camX + sx) * scale, (-camY + sy) * scale);
    const bossPhase = G.Floor.isBoss();
    if (bossPhase) G.Boss.drawBack(ctx);      // 보스 뒤 기운
    G.Stage.drawFloor(ctx);
    if (bossPhase) G.Boss.drawFront(ctx);     // 예고 표시 + 보스 그림
    else { G.Floor.drawGate(ctx); G.Mobs.drawAims(ctx); }   // 보스방 문, 궁수 조준선
    // 안쪽(z 작음)부터 그려서 앞에 있는 것이 위에 보이게
    const list = [...G.Stage.drawables(player), ...G.Combat.drawables(), ...(bossPhase ? G.Boss.drawables() : G.Mobs.drawables()), G.Player.drawable(player)];
    list.sort((a, b) => a.key - b.key);
    for (const d of list) d.draw(ctx);
    G.Boss.drawTop(ctx);       // 보스 공격 이펙트 (파편, 먼지, 잎)
    G.FX.drawFront(ctx);
    if (CFG.debug) G.Combat.drawDebug(ctx, player);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    G.Floor.drawOverlay(ctx, viewW, CFG.VIEW_H);   // 층·보스 이름, 문으로 들어갈 때 어두워짐
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

})();
