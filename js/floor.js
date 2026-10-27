// =====================================================================
// floor.js — 한 층의 흐름
//   path(몹 구간: 오른쪽으로 나아가는 길) → open(길 끝 보스방 문 열림) → enter(들어가는 중)
//   → boss(보스전) → clear(클리어)
//
// 길은 구역(zone)으로 나뉨. 구역에 들어서면 양옆이 가시덩굴로 막히고 그 구역의 몹이 나옴
// → 다 잡으면 덩굴이 걷히고 "GO ▶" → 다음 구역으로. 마지막 구역을 지나면 길 끝의 문이 열림
// =====================================================================
G.Floor = (function () {
  const S = () => G.Stage, CFG = G.CFG;
  const GATE = { x: 0, z: 8, w: 76, h: 130 };          // 보스방 문 (x는 층마다 floors.js의 gateX)
  const st = { n: 1, def: null, phase: 'path', zone: 0, locked: false, gateK: 0, fade: 0, banner: null, t: 0, wall: 0 };

  const counter = document.getElementById('mob-count');
  const bossBar = document.getElementById('boss-bar');

  // ---------- 시작 ----------
  function start(n, player) {
    st.n = n; st.def = G.Floors[n];
    G.Mobs.setPower(st.def.power);
    G.Boss.load(st.def.boss);
    G.MobSprite.preload([...new Set(st.def.path.zones.flatMap(z => z.mobs.map(g => g.type)))]);   // 몹 그림 미리 불러 두기
    startPath(player);
  }
  function startPath(player) {
    const P = st.def.path;
    G.Mobs.clear();
    G.Stage.setLayout(P.end, P.pillars);
    GATE.x = P.gateX;
    Object.assign(st, { phase: 'path', zone: 0, locked: false, gateK: 0, fade: 0, t: 0, wall: 0, go: 0 });
    st.banner = { text: `${st.n}F`, sub: '적을 쓰러뜨리며 앞으로 나아가라', t: 0, life: 2.0 };
    if (player) { player.x = 120; player.z = 90; player.vx = player.vz = 0; }
    if (G.Boss.state.target) G.Boss.state.target.active = false;
    showUI();
  }
  function startBoss(player) {
    G.Mobs.clear();
    G.Stage.setLayout(900, st.def.bossPillars);     // 보스방: 한 화면짜리 전투장
    st.phase = 'boss'; st.t = 0; st.locked = false;
    G.Boss.reset();
    G.Boss.state.timer = 2.2;               // 이름이 뜨는 동안은 공격하지 않음
    if (player) { player.x = 220; player.z = 95; player.vx = player.vz = 0; }
    const d = G.Boss.def;
    st.banner = { text: d.name, sub: `${st.n}F · ${d.title}`, t: 0, life: 2.2, big: true };
    showUI();
  }
  // 다시 도전: 보스전에서 죽었으면 보스전부터, 길에서 죽었으면 길 처음부터
  function retry(player) {
    if (st.phase === 'boss' || st.phase === 'clear') startBoss(player); else startPath(player);
  }

  function showUI() {
    const boss = isBoss();
    bossBar.style.display = boss ? '' : 'none';
    counter.style.display = boss ? 'none' : '';
    updateCounter();
  }
  // 남은 적 = 살아 있는 몹 + 아직 안 나온 구역의 몹
  function remaining() {
    const zones = st.def.path.zones;
    let n = G.Mobs.alive();
    for (let i = st.zone + (st.locked ? 1 : 0); i < zones.length; i++) for (const g of zones[i].mobs) n += g.n;
    return n;
  }
  function updateCounter() {
    if (st.phase === 'path') counter.textContent = `${st.n}F · 남은 적 ${remaining()}`;
    else if (st.phase === 'open' || st.phase === 'enter') counter.textContent = `${st.n}F · 길 끝의 문이 열렸다`;
  }

  // ---------- 매 프레임 ----------
  function update(dt, player) {
    st.t += dt;
    if (st.banner) { st.banner.t += dt; if (st.banner.t > st.banner.life) st.banner = null; }
    const P = st.def.path;

    if (st.phase === 'path') {
      G.Mobs.update(dt, player);
      const Z = P.zones[st.zone];
      if (!st.locked) {
        // 구역에 들어서면 잠금 (첫 구역은 시작하자마자)
        const ready = st.zone === 0 ? st.t > 0.8 : player.x > Z.x0 + 220;
        if (Z && ready && !player.dead) lock(Z, player);
      } else if (G.Mobs.alive() === 0) {
        // 구역 정리 → 덩굴이 걷히고 다음으로
        st.locked = false; st.zone++;
        G.Stage.setBounds(0, P.end);
        G.FX.shake(4, 0.25);
        if (st.zone >= P.zones.length) {
          st.phase = 'open'; st.t = 0;
          G.BFX.dust(GATE.x, GATE.z, 10, 1.2, '90, 80, 60');
        } else st.go = 2.5;
      }
      updateCounter();
    } else if (st.phase === 'open') {
      G.Mobs.update(dt, player);
      st.gateK = Math.min(1, st.gateK + dt / 0.8);
      st.go = 2.5;
      // 문 앞에 서면 들어감
      if (Math.abs(player.x - GATE.x) < GATE.w * 0.5 && player.z < GATE.z + 24 && !player.dead) { st.phase = 'enter'; st.fade = 0; }
      updateCounter();
    } else if (st.phase === 'enter') {
      st.fade += dt / 0.45;
      if (st.fade >= 1) { startBoss(player); st.fade = 1; st.fadeOut = true; }
    } else if (st.phase === 'boss') {
      G.Boss.update(dt, player);
    }
    if (st.phase !== 'boss') G.BFX.update(dt);      // 보스전 밖에서도 먼지·잎 이펙트 진행
    if (st.fadeOut) { st.fade -= dt / 0.45; if (st.fade <= 0) { st.fade = 0; st.fadeOut = false; } }
    st.wall = st.locked ? Math.min(1, st.wall + dt / 0.35) : Math.max(0, st.wall - dt / 0.35);
    st.go = Math.max(0, (st.go || 0) - dt);
  }

  // 구역 잠금: 양옆을 막고 몹을 부름 (앞쪽에서 많이, 뒤쪽에서 조금)
  function lock(Z, player) {
    st.locked = true; st.lockZ = Z; st.go = 0;
    G.Stage.setBounds(Z.x0, Z.x1);
    if (player.x < Z.x0 + 30) player.x = Z.x0 + 30;
    G.FX.shake(3, 0.2);
    let k = 0;
    for (const g of Z.mobs) for (let j = 0; j < g.n; j++) {
      const ahead = (k++ % 3) !== 2;
      const x = ahead ? Z.x1 - 60 - Math.random() * 140 : Z.x0 + 40 + Math.random() * 80;
      const z = 15 + Math.random() * (CFG.DEPTH - 30);
      G.Mobs.spawn(g.type, x, z);
    }
  }

  // ---------- 그리기 ----------
  // 구역 경계의 가시덩굴 벽 (잠겼을 때 솟아오름)
  function drawWalls(ctx) {
    if (st.wall <= 0 || !st.lockZ) return;
    const F = S().floorY;
    for (const x of [st.lockZ.x0, st.lockZ.x1]) {
      if (x <= 0) continue;
      for (let z = 4; z <= CFG.DEPTH; z += 7) for (let j = 0; j < 2; j++) {
        const seed = Math.floor(x * 7 + z * 13 + j * 31) + 1;
        G.BFX.vine(ctx, x + Math.sin(z * 1.7 + j * 2) * 14, F(z), (55 + (seed % 40)) * st.wall, Math.sin(seed) * 14, seed, Math.sin(st.t * 3 + z + j) * 0.3, 5);
      }
    }
  }

  // 보스방 문: 돌기둥 두 개 + 위에 가로돌. 닫혀 있으면 가시덩굴이 막고, 열리면 덩굴이 걷히고 빛이 새어 나옴
  function drawGate(ctx) {
    if (isBoss()) return;
    drawWalls(ctx);
    const F = S().floorY, x = GATE.x, y = F(GATE.z), w = GATE.w, h = GATE.h, k = st.gateK;
    ctx.save();
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, `rgba(20, 30, 22, 1)`); g.addColorStop(1, `rgba(${Math.round(20 + 200 * k)}, ${Math.round(30 + 200 * k)}, ${Math.round(22 + 140 * k)}, 1)`);
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - h, w, h);
    if (k > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const r = ctx.createRadialGradient(x, y - h * 0.4, 5, x, y - h * 0.4, w * 1.4);
      r.addColorStop(0, `rgba(200, 255, 170, ${0.35 * k * (0.8 + 0.2 * Math.sin(st.t * 4))})`); r.addColorStop(1, 'rgba(200, 255, 170, 0)');
      ctx.fillStyle = r; ctx.fillRect(x - w * 1.5, y - h * 1.4, w * 3, h * 1.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = '#4a4c46'; ctx.strokeStyle = '#121310'; ctx.lineWidth = 2;
    for (const s of [-1, 1]) { ctx.fillRect(x + s * (w / 2 + 8) - 9, y - h - 6, 18, h + 6); ctx.strokeRect(x + s * (w / 2 + 8) - 9, y - h - 6, 18, h + 6); }
    ctx.fillRect(x - w / 2 - 22, y - h - 22, w + 44, 18); ctx.strokeRect(x - w / 2 - 22, y - h - 22, w + 44, 18);
    ctx.fillStyle = '#5c6b44'; ctx.fillRect(x - w / 2 - 22, y - h - 22, w + 44, 5);   // 이끼
    if (k < 1) {
      ctx.save(); ctx.beginPath(); ctx.rect(x - w / 2, y - h * (1 - k), w, h * (1 - k)); ctx.clip();
      ctx.strokeStyle = '#2f4f22'; ctx.lineWidth = 5;
      for (let i = 0; i < 7; i++) {
        const ox = x - w / 2 + (i + 0.5) * w / 7;
        ctx.beginPath(); ctx.moveTo(ox, y); ctx.bezierCurveTo(ox - 14, y - h * 0.35, ox + 14, y - h * 0.65, ox - 4, y - h); ctx.stroke();
      }
      ctx.strokeStyle = '#1d3215'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - w / 2, y - h * (0.15 + i * 0.15)); ctx.lineTo(x + w / 2, y - h * (0.22 + i * 0.15)); ctx.stroke(); }
      ctx.restore();
    }
    if (k >= 1) {
      ctx.strokeStyle = `rgba(232, 212, 154, ${0.5 + 0.4 * Math.sin(st.t * 5)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y + 8, w * 0.45, 9, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // 화면 위 글씨(층·보스 이름), "GO ▶", 문으로 들어갈 때 어두워지는 효과 (화면 좌표로 그림)
  function drawOverlay(ctx, viewW, viewH) {
    if (st.banner) {
      const b = st.banner, a = Math.min(1, b.t / 0.3, (b.life - b.t) / 0.4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      const cy = viewH * 0.36;
      if (b.big) {
        const gr = ctx.createLinearGradient(0, cy - 40, 0, cy + 30);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, cy - 40, viewW, 70);
      }
      ctx.fillStyle = '#f2d9a6'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.font = `800 ${b.big ? 44 : 34}px sans-serif`;
      ctx.fillText(b.text, viewW / 2, cy + 4 - (1 - Math.min(1, b.t / 0.3)) * 8);
      ctx.font = '600 14px sans-serif'; ctx.fillStyle = '#c9c0a8';
      ctx.fillText(b.sub, viewW / 2, cy + 26);
      ctx.restore();
    }
    // 길이 열렸을 때: 오른쪽에 깜빡이는 GO ▶
    if (st.go > 0 && !st.locked && (st.phase === 'path' || st.phase === 'open')) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(st.t * 8);
      ctx.fillStyle = '#f2d9a6'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.font = '800 26px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('GO ▶', viewW - 30, viewH * 0.3);
      ctx.restore();
    }
    if (st.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, st.fade)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function isBoss() { return st.phase === 'boss' || st.phase === 'clear'; }
  function cleared() { st.phase = 'clear'; }

  return { state: st, start, retry, update, drawGate, drawOverlay, isBoss, cleared, GATE };
})();
