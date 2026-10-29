// =====================================================================
// floor.js — 한 층의 흐름
//   path(몹 구간: 오른쪽으로 나아가는 길) → open(길 끝 보스방 문 열림) → enter(들어가는 중)
//   → intro(보스 등장 연출, intro.js) → boss(보스전) → clear(클리어)
//
// 길은 구역(zone)으로 나뉨. 구역에 들어서면 양옆이 가시덩굴로 막히고 그 구역의 몹이 나옴
// → 다 잡으면 덩굴이 걷히고 "GO ▶" → 다음 구역으로. 마지막 구역을 지나면 길 끝의 문이 열림
// =====================================================================
G.Floor = (function () {
  const S = () => G.Stage, CFG = G.CFG;
  const GATE = { x: 0, z: 8, w: 76, h: 130 };          // 보스방 문 (x는 층마다 floors.js의 gateX)
  // 보스방 문 그림 (모든 층 공통 '탑의 돌문'): 닫힌 문, 열린 문(빛). 열릴 때 돌판이 땅속으로 가라앉음
  //   height: 게임 단위 높이, foot: 땅에 닿는 곳(그림 위에서부터 비율), slab: 돌판 자리 [x0, y0, x1, y1] (비율)
  const GATE_IMG = { closed: 'assets/props/gate_closed.webp', open: 'assets/props/gate_open.webp',
                     w: 379, h: 558, height: 205, foot: 0.975, slab: [0.313, 0.155, 0.698, 0.905] };
  const st = { n: 1, def: null, phase: 'path', zone: 0, locked: false, gateK: 0, fade: 0, banner: null, t: 0, wall: 0 };

  const counter = document.getElementById('mob-count');
  const bossBar = document.getElementById('boss-bar');

  // ---------- 시작 ----------
  function start(n, player) {
    st.n = n; st.def = G.Floors[n];
    G.Mobs.setPower(st.def.power);
    G.Boss.load(st.def.boss);
    // 몹 구간이 없는 층(path 없음)은 바로 보스전
    if (!st.def.path) { startBoss(player); return; }
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
    G.Sound.bgm('path');
    if (player) { player.x = 120; player.z = 90; player.vx = player.vz = 0; }
    if (G.Boss.state.target) G.Boss.state.target.active = false;
    showUI();
  }
  // short: 다시 도전할 때는 짧은 등장 연출 (이름 카드만)
  // 보스에 시네마틱 영상(cine)이 있고 아직 안 봤으면: 영상 → 이름 카드 → 전투
  function startBoss(player, short) {
    G.Mobs.clear();
    G.Stage.setLayout(900, st.def.bossPillars);     // 보스방: 한 화면짜리 전투장
    st.phase = 'intro'; st.t = 0; st.locked = false; st.banner = null;
    G.Boss.reset();
    if (player) { player.x = 220; player.z = 95; player.vx = player.vz = 0; player.facing = 1; }
    const D = G.Boss.def, seen = G.Save.data.seenCine || (G.Save.data.seenCine = {});
    // 보스전 전 이야기: 대화 장면(talk) 또는 영상(cine). 처음 한 번만
    const story = D.talk ? (cb => G.Talk.play(D.talk, cb)) : D.cine ? (cb => G.Cine.play(D.cine, cb)) : null;
    if (!short && story && !seen[st.def.boss] && G.Game && G.Game.mode === 'play') {   // 로비 뒤 화면을 준비할 때는 안 나옴
      st.phase = 'cine';
      G.Sound.bgm(D.talk ? 'boss' : null);                       // 대화 중엔 보스 음악의 조용한 전주가 깔림 (영상은 영상 소리)
      G.Boss.state.mode = 'intro';                                // 끝날 때까지 보스는 공격하지 않음
      story(() => {
        seen[st.def.boss] = true; G.Save.save();
        st.phase = 'intro';
        G.BossIntro.start(true);                                  // 영상에서 깨어나는 장면을 봤으니 이름 카드만
        G.Sound.bgm('boss');
      });
      showUI();
      return;
    }
    G.BossIntro.start(!!short);
    G.Sound.bgm('boss');
    showUI();
  }
  // 다시 도전: 보스전에서 죽었으면 보스전부터(짧은 연출), 길에서 죽었으면 길 처음부터
  function retry(player) {
    if (isBoss()) startBoss(player, true); else startPath(player);
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
          G.Sound.play('gate');
          G.BFX.dust(GATE.x, GATE.z, 10, 1.2, '90, 80, 60');
        } else { st.go = 2.5; G.Sound.play('thorns', { rate: 0.8 }); }
      }
      updateCounter();
    } else if (st.phase === 'open') {
      G.Mobs.update(dt, player);
      if (st.gateK < 1 && Math.random() < dt * 20) G.FX.shake(2, 0.06);      // 돌판이 가라앉으며 땅이 울림
      if (st.gateK < 1 && Math.random() < dt * 12) G.BFX.dust(GATE.x + (Math.random() - 0.5) * 70, GATE.z + 4, 1, 0.6, '150, 150, 150');
      st.gateK = Math.min(1, st.gateK + dt / 1.6);
      st.go = 2.5;
      // 문 앞에 서면 들어감
      if (Math.abs(player.x - GATE.x) < GATE.w * 0.5 && player.z < GATE.z + 24 && !player.dead) { st.phase = 'enter'; st.fade = 0; st.fadeColor = '235, 245, 255'; G.Sound.play('banner'); }
      updateCounter();
    } else if (st.phase === 'enter') {
      st.fade += dt / 0.45;
      if (st.fade >= 1) { startBoss(player); st.fade = 1; st.fadeOut = true; }
    } else if (st.phase === 'intro') {
      G.Boss.update(dt, player);
      if (G.BossIntro.update(dt, player)) st.phase = 'boss';
    } else if (st.phase === 'boss') {
      G.Boss.update(dt, player);
    }
    if (!isBoss()) G.BFX.update(dt);      // 보스전 밖에서도 먼지·잎 이펙트 진행
    if (st.fadeOut) { st.fade -= dt / 0.45; if (st.fade <= 0) { st.fade = 0; st.fadeOut = false; st.fadeColor = null; } }
    st.wall = st.locked ? Math.min(1, st.wall + dt / 0.35) : Math.max(0, st.wall - dt / 0.35);
    st.go = Math.max(0, (st.go || 0) - dt);
  }

  // 구역 잠금: 양옆을 막고 몹을 부름 (앞쪽에서 많이, 뒤쪽에서 조금)
  function lock(Z, player) {
    st.locked = true; st.lockZ = Z; st.go = 0;
    G.Stage.setBounds(Z.x0, Z.x1);
    G.Sound.play('vines', { vol: 0.7 });
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
    // 층마다 다른 벽 그림 (bosses.js의 theme.wall: { src, w, h, height }) — 깊이를 따라 줄지어 솟아오름
    const WL = G.Boss.def && G.Boss.def.theme && G.Boss.def.theme.wall;
    const wim = WL && G.Render.getImg(WL.src);
    if (wim) {
      const hh = WL.height * st.wall, ww = WL.w / WL.h * WL.height;
      for (const x of [st.lockZ.x0, st.lockZ.x1]) {
        if (x <= 0) continue;
        for (let z = 0; z <= CFG.DEPTH + 1; z += 16) {
          const y = F(z), j = Math.sin(x * 0.7 + z * 1.3) * 4;
          ctx.drawImage(wim, 0, 0, WL.w, WL.h * st.wall, x - ww / 2 + j, y - hh, ww, hh);
        }
      }
      return;
    }
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
    if (drawStoneGate(ctx)) return;
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

  // 탑의 돌문 (그림): 몹을 다 잡으면 돌판이 땅속으로 가라앉고 문틀 안에서 빛이 쏟아짐
  function drawStoneGate(ctx) {
    const G1 = G.Render.getImg(GATE_IMG.closed), G2 = G.Render.getImg(GATE_IMG.open);
    if (!G1 || !G2) return false;
    const I = GATE_IMG, F = S().floorY, k = st.gateK, ease = 1 - Math.pow(1 - k, 2);
    const s = I.height / I.h, w = I.w * s, h = I.h * s, x0 = GATE.x - w / 2, y0 = F(GATE.z) - I.foot * h;
    const [a, b, c, d] = I.slab, sx = a * I.w, sy = b * I.h, sw = (c - a) * I.w, sh = (d - b) * I.h;
    ctx.save();
    // 뒤로 퍼지는 빛 (열릴수록 밝게)
    if (k > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const cx = GATE.x, cy = y0 + (b + d) / 2 * h, R = w * 1.3;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, R);
      g.addColorStop(0, `rgba(170, 215, 255, ${0.4 * ease * (0.85 + 0.15 * Math.sin(st.t * 4))})`); g.addColorStop(1, 'rgba(170, 215, 255, 0)');
      ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 열린 문(빛) 위에 닫힌 문틀을 겹쳐 서서히 바꿈 (위쪽 룬이 켜짐)
    ctx.drawImage(G2, x0, y0, w, h);
    if (k < 1) {
      ctx.globalAlpha = 1 - ease;
      ctx.drawImage(G1, x0, y0, w, h);
      ctx.globalAlpha = 1;
      // 돌판: 문틀 안에서 땅속으로 가라앉음 (문틀 밖으로는 안 보이게 자름)
      ctx.save();
      ctx.beginPath(); ctx.rect(x0 + a * w, y0 + b * h, (c - a) * w, (d - b) * h); ctx.clip();
      ctx.drawImage(G1, sx, sy, sw, sh, x0 + a * w, y0 + b * h + ease * (d - b) * h, (c - a) * w, (d - b) * h);
      ctx.restore();
    }
    // 열린 뒤: 문 앞 바닥의 빛 고리 (여기로 들어가라는 표시)
    if (k >= 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(170, 215, 255, ${0.45 + 0.35 * Math.sin(st.t * 5)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(GATE.x, F(GATE.z) + 10, w * 0.32, 10, 0, 0, Math.PI * 2); ctx.stroke();
      if (Math.random() < 0.3) G.BFX.motes(GATE.x + (Math.random() - 0.5) * w * 0.3, GATE.z, 10, 1, null, '190, 225, 255');
    }
    ctx.restore();
    return true;
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
    G.BossIntro.draw(ctx, viewW, viewH);
    if (st.fade > 0) {
      ctx.fillStyle = `rgba(${st.fadeColor || '0,0,0'},${Math.min(1, st.fade)})`;   // 문으로 들어갈 땐 하얀 빛으로
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function isBoss() { return st.phase === 'cine' || st.phase === 'intro' || st.phase === 'boss' || st.phase === 'clear'; }
  // 연출 중: 조작 막음 (main.js)
  function cutscene() { return st.phase === 'cine' || st.phase === 'intro' || st.phase === 'enter'; }
  function cleared() { st.phase = 'clear'; }

  return { state: st, start, retry, update, drawGate, drawOverlay, isBoss, cleared, cutscene, GATE };
})();
