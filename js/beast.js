// =====================================================================
// beast.js — 움직이는 보스 (전투장을 뛰어다니는 짐승형 보스). 보스 데이터는 bosses.js (kind: 'beast')
//
// 판·문지기처럼 뒤에 고정된 보스는 boss.js, 이 파일은 바닥 위를 움직이는 보스
//   그림: AI 영상을 장면별로 쪼갠 시트 (오른쪽을 보는 옆모습. 왼쪽으로 갈 땐 좌우로 뒤집음)
//   clips: idle(숨쉬기 반복) / run(달리기 한 바퀴 반복) / stun(기절 → 회복) / tusk(엄니 올려치기)
//
// 멧돼지 패턴
//   돌진: 고개를 낮추고(예고: 바닥에 붉은 줄, 앞부분 동안 플레이어를 따라감) → 줄을 따라 끝까지 달림
//         → 벽에 부딪히면 잠깐 기절, 바위·그루터기에 부딪히면 부수고 오래 기절 (공격 기회)
//         2단계: 벽에 부딪혀도 기절하지 않고 한 번 되돌아 돌진
//   엄니 올려치기: 가까이 붙어 있으면 고개를 낮췄다가(예고: 앞쪽 붉은 반원) 퍼 올림
//
// G.Boss(아래)가 보스 종류에 따라 boss.js와 이 파일 중 하나로 연결해 줌 → 다른 파일은 G.Boss만 씀
// =====================================================================
G.Beast = (function () {
  const S = () => G.Stage;
  let def = null;
  const st = {
    hp: 1, maxHp: 1, mode: 'fight', timer: 0, time: 0, flash: 0, fade: 1,
    x: 0, z: 0, face: -1, act: null, clip: 'idle', frame: 0, at: 0,
    cur: { key: 'idle', frame: 0 }, prev: null, introGlow: 0,
    marks: [], target: null, last: null, stars: 0,
  };

  function load(key) {
    def = G.BossDefs[key];
    for (const c of Object.values(def.clips)) c.sheets.forEach(src => G.Render.getImg(src));
    reset();
  }
  function reset() {
    Object.assign(st, {
      hp: def.hp, maxHp: def.hp, mode: 'fight', timer: 1.4, time: 0, flash: 0, fade: 1,
      x: def.start.x, z: def.start.z, face: def.start.face || -1, act: null, clip: 'idle', frame: 0, at: 0,
      marks: [], last: null, stars: 0,
    });
    if (G.BFX) G.BFX.clear();
    if (st.target) G.Combat.removeTarget(st.target);
    st.target = G.Combat.addTarget({
      x: st.x, z: st.z, h: 0, w: def.hit.w, height: def.hit.h, active: true,
      onHit: dmg => hurt(dmg),
    });
    updateUI();
  }
  function params(kind) {
    const p = Object.assign({}, def.patterns[kind]), k = st.hp / st.maxHp;
    if (def.phase2 && k <= def.phase2.at) Object.assign(p, def.phase2[kind] || {});
    if (def.rage && k <= def.rage.at) Object.assign(p, def.rage[kind] || {});   // 광폭화
    return p;
  }
  const raging = () => def.rage && st.hp / st.maxHp <= def.rage.at;

  // ---------- 동작 영상 ----------
  // 구간 [a, b]를 u(0~1)만큼 진행한 장면
  function seg(clip, name, u) {
    const [a, b] = def.clips[clip].seg[name];
    st.clip = clip; st.frame = Math.round(a + (b - a) * Math.max(0, Math.min(1, u)));
  }
  function loop(clip, fps) {
    const C = def.clips[clip];
    st.clip = clip; st.frame = Math.floor(st.at * fps) % C.count;
  }
  // 숨쉬기: 앞으로 갔다가 거꾸로 돌아오며 반복 (끊김 없게)
  function breathe() {
    const n = def.clips.idle.count, k = Math.floor(st.time * 6) % (n * 2 - 2);
    st.clip = 'idle'; st.frame = k < n ? k : 2 * n - 2 - k;
  }

  // ---------- 매 프레임 ----------
  function update(dt, player) {
    st.time += dt; st.at += dt;
    st.flash = Math.max(0, st.flash - dt);
    st.stars = Math.max(0, st.stars - dt);
    if (st.mode === 'intro') breathe();
    else if (st.mode === 'dying') {
      st.timer -= dt;
      seg('stun', 'dazed', 1 - st.timer / 2.4);
      st.fade = Math.max(0, Math.min(1, st.timer / 1.2));
      if (Math.random() < 0.25) G.BFX.dust(st.x + (Math.random() - 0.5) * 200, st.z, 1, 0.6, def.theme.dust);
      if (st.timer <= 0) { st.mode = 'dead'; G.Game.win(); }
    } else if (st.mode === 'fight') {
      if (st.act) act(dt, player);
      else {
        breathe();
        if (Math.abs(player.x - st.x) > 30) st.face = Math.sign(player.x - st.x);   // 플레이어 쪽을 봄
        st.timer -= dt;
        if (raging() && Math.random() < dt * 10) G.BFX.dust(st.x + st.face * 110, st.z, 1, 0.4, '200, 70, 40');   // 콧김 대신 붉은 기운
        if (st.timer <= 0 && !player.dead) choose(player);
      }
    }
    Object.assign(st.target, { x: st.x, z: st.z, h: 0, active: st.mode === 'fight' });
    G.BFX.update(dt);
    st.marks = st.marks.filter(m => (m.k += dt) < m.life);
  }

  function choose(player) {
    const near = Math.abs(player.x - st.x) < params('tusk').range && Math.abs(player.z - st.z) < 50 && Math.sign(player.x - st.x) === st.face;
    const kind = near && st.last !== 'tusk' ? 'tusk' : 'charge';
    st.last = kind; st.at = 0;
    if (kind === 'tusk') st.act = { kind, t: 0, p: params('tusk'), hit: false };
    else startCharge(player, 0);
  }

  // ---------- 돌진 ----------
  // 줄: 멧돼지에서 플레이어 쪽으로, 전투장 끝까지
  function aim(A, player) {
    let dx = player.x - st.x, dz = player.z - st.z;
    if (Math.abs(dx) < 80) dx = 80 * (Math.sign(dx) || st.face);       // 거의 위아래면 옆으로 틀어서 (몸이 옆으로 긴 짐승)
    const d = Math.hypot(dx, dz); dx /= d; dz /= d;
    const W = G.CFG.ARENA_W, D = G.CFG.DEPTH, m = 40;
    let L = 2000;
    if (dx > 0) L = Math.min(L, (W - m - st.x) / dx); else if (dx < 0) L = Math.min(L, (m - st.x) / dx);
    if (dz > 0) L = Math.min(L, (D - 4 - st.z) / dz); else if (dz < 0) L = Math.min(L, (4 - st.z) / dz);
    A.dx = dx; A.dz = dz; A.len = Math.max(0, L);
    st.face = Math.sign(dx) || st.face;
  }
  function startCharge(player, bounces) {
    const p = params('charge');
    const A = { kind: 'charge', phase: 'aim', t: 0, p, bounces, hit: false, dist: 0 };
    aim(A, player);
    st.act = A;
  }
  function act(dt, player) {
    const A = st.act, p = A.p;
    A.t += dt;
    if (A.kind === 'charge') {
      if (A.phase === 'aim') {
        const T = A.short ? p.bounceTelegraph : p.telegraph, u = A.t / T;
        if (u < p.track && !player.dead) aim(A, player);
        seg('tusk', 'lower', Math.min(1, u * 1.6));                      // 고개를 낮추고 노려봄
        if (Math.random() < dt * 8) G.BFX.dust(st.x - st.face * 60, st.z, 1, 0.5, def.theme.dust);   // 뒷발로 땅을 긁음
        if (u >= 1) { A.phase = 'run'; A.t = 0; A.x0 = st.x; A.z0 = st.z; G.Sound.play(def.roar || 'roar', { vol: 0.8 }); }
      } else if (A.phase === 'run') {
        const step = p.speed * dt;
        A.dist += step;
        st.x += A.dx * step; st.z += A.dz * step;
        loop('run', 46);
        if (Math.random() < dt * 30) G.BFX.dust(st.x - A.dx * 90, st.z, 1, 0.8, def.theme.dust);
        if (Math.floor(A.dist / 140) !== Math.floor((A.dist - step) / 140)) G.FX.shake(3, 0.08);   // 발굽 소리처럼 쿵쿵
        // 플레이어와 부딪힘 (한 번만)
        if (!A.hit && !player.dead && Math.abs(player.x - st.x) < def.hit.w / 2 + 6 && Math.abs(player.z - st.z) < 30 && player.h < def.hit.h * 0.8) {
          if (G.Combat.hurtPlayer(player, p.dmg, st.x - A.dx * 50, st.z, { stun: p.stunPlayer })) A.hit = true;   // 돌진에 맞으면 기절
        }
        // 바위·그루터기에 부딪힘 → 부수고 오래 기절
        const fx = st.x + A.dx * def.hit.w * 0.45, fz = st.z + A.dz * 10;
        for (const q of S().data.pillars) {
          if (!q.breakable) continue;
          const ex = (fx - q.x) / (q.rx + 10), ez = (fz - q.z) / (q.rz + 14);
          if (ex * ex + ez * ez < 1) { crash(q, p.stunRock); return; }
        }
        // 줄 끝(벽)에 닿음
        if (A.dist >= A.len) {
          if (A.bounces < (p.bounce || 0)) {                             // 2단계: 되돌아 한 번 더
            G.FX.shake(8, 0.25); G.Sound.play('smash', { vol: 0.7 });
            G.BFX.dust(st.x + A.dx * 80, st.z, 8, 1.2, def.theme.dust);
            startCharge(player, A.bounces + 1); st.act.short = true;
          } else crash(null, p.stunWall);
        }
      } else if (A.phase === 'stun') {
        const T = A.stun;
        if (A.t < 0.25) seg('stun', 'hit', A.t / 0.25);
        else if (A.t < T) seg('stun', 'dazed', (A.t - 0.25) / (T - 0.25));
        else seg('stun', 'recover', (A.t - T) / 0.7);
        if (A.t >= T + 0.7) { st.act = null; st.timer = p.rest; st.at = 0; }
      }
    } else if (A.kind === 'tusk') {
      // 고개를 낮춤(예고) → 퍼 올림 → 원래 자세
      if (A.t < p.windup) seg('tusk', 'lower', A.t / p.windup);
      else if (A.t < p.windup + p.strike) {
        const u = (A.t - p.windup) / p.strike;
        seg('tusk', 'strike', u);
        if (!A.hit && u >= 0.45) {
          A.hit = true;
          G.Sound.play('swing3', { rate: 0.7 }); G.FX.shake(6, 0.15);
          const dx = (player.x - st.x) * st.face;
          if (dx > 20 && dx < p.range + 30 && Math.abs(player.z - st.z) < 50 && player.h < 160) G.Combat.hurtPlayer(player, p.dmg, st.x, st.z);
        }
      } else {
        seg('tusk', 'recover', (A.t - p.windup - p.strike) / p.recover);
        if (A.t >= p.windup + p.strike + p.recover) { st.act = null; st.timer = p.rest; st.at = 0; }
      }
    }
  }
  // 부딪힘: 바위(q)면 부서짐. 기절 시작
  function crash(q, stun) {
    const A = st.act;
    G.Sound.play('smash'); G.FX.shake(q ? 14 : 10, 0.35); G.FX.hitstop(0.06);
    const hx = st.x + A.dx * def.hit.w * 0.45;
    G.BFX.flash(hx, st.z, 60, 120, '255, 230, 190', 0.2);
    G.BFX.dust(hx, st.z, 12, 1.4, def.theme.dust);
    if (q) {
      G.BFX.debris(q.x, q.z, 26, 1.3); G.BFX.dust(q.x, q.z, 10, 1.6, def.theme.dust);
      S().breakPillar(q);
      G.FX.text(q.x, S().screenY(q.z, q.h + 40), '쾅!', '#ffd9a0');
    } else G.BFX.debris(hx, st.z, 10, 0.8);
    A.phase = 'stun'; A.t = 0; A.stun = stun; st.stars = stun + 0.3;
  }

  // 기술을 쓰는 중(돌진 준비·돌진·엄니)에는 공격이 막힘. 쉬는 중·기절 중에만 맞음
  const guarding = () => st.act && !(st.act.kind === 'charge' && st.act.phase === 'stun');
  function hurt(dmg) {
    if (st.mode !== 'fight') return;
    if (guarding()) return false;
    const wasRage = raging();
    st.hp = Math.max(0, st.hp - dmg);
    // 광폭화 시작: 체력이 거의 다 닳으면 미쳐 날뜀 (울부짖음 + 붉은 번쩍임, 기절 중이면 바로 깨어남)
    if (!wasRage && raging() && st.hp > 0) {
      G.Sound.play(def.roar || 'roar', { rate: 0.9 }); G.FX.shake(16, 0.6);
      G.BFX.screenFlash('255, 60, 30', 0.35);
      G.FX.text(st.x, S().screenY(st.z, def.hit.h + 30), '광폭화!', '#ff5a3a');
      if (st.act && st.act.phase === 'stun') { st.act = null; st.timer = 0.3; }
    }
    st.flash = 0.08;
    updateUI();
    if (st.hp <= 0) {
      st.mode = 'dying'; st.timer = 2.4; st.act = null; st.marks = [];
      G.Sound.play(def.roar || 'roar', { rate: 0.8 });
      G.FX.shake(12, 0.5);
    }
  }

  // ---------- 그리기 ----------
  function drawBack() {}
  // 바닥 위 예고 (돌진 줄, 엄니 반원)
  function drawFront(ctx) {
    if (!def) return;
    const F = S().floorY, A = st.act;
    if (A && A.kind === 'charge' && A.phase === 'aim') {
      const T = A.short ? A.p.bounceTelegraph : A.p.telegraph, k = Math.min(1, A.t / T);
      const flash = k > 0.8 ? 0.5 + 0.5 * Math.sin(st.time * 50) : 0;
      const w = A.p.width, nx = -A.dz * w / 2, nz = A.dx * w / 2;
      const x1 = st.x + A.dx * A.len, z1 = st.z + A.dz * A.len;
      const poly = (len) => { const ex = st.x + A.dx * A.len * len, ez = st.z + A.dz * A.len * len;
        return [[st.x + nx, F(st.z + nz)], [ex + nx, F(ez + nz)], [ex - nx, F(ez - nz)], [st.x - nx, F(st.z - nz)]]; };
      const fill = (pts) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); };
      ctx.save();
      ctx.fillStyle = `rgba(200, 30, 20, ${0.16 + 0.14 * k + 0.2 * flash})`; fill(poly(1));
      ctx.fillStyle = `rgba(255, 80, 50, ${0.3 + 0.3 * flash})`; fill(poly(k));
      ctx.strokeStyle = `rgba(255, 110, 80, ${0.55 + 0.4 * flash})`; ctx.lineWidth = 1.5;
      const P = poly(1); ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.moveTo(P[3][0], P[3][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.stroke();
      ctx.restore();
    }
    if (A && A.kind === 'tusk' && A.t < A.p.windup) {
      const k = A.t / A.p.windup, y = F(st.z), r = A.p.range;
      ctx.save();
      ctx.fillStyle = `rgba(220, 40, 30, ${0.15 + 0.2 * k})`;
      ctx.beginPath(); ctx.ellipse(st.x, y, r, 46, 0, st.face > 0 ? -Math.PI / 2 : Math.PI / 2, st.face > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 그림자
    G.Render.shadow(ctx, st.x, F(st.z) + 2, def.hit.w * 0.5, 0.4 * st.fade);
  }
  function drawBody(ctx) {
    const C = def.clips[st.clip], f = Math.min(C.count - 1, st.frame);
    const im = G.Render.getImg(C.sheets[Math.floor(f / 16)]);
    if (!im) return;
    const k = f % 16, sx = (k % 4) * C.fw, sy = Math.floor(k / 4) * C.fh, s = def.scale;
    const y = S().floorY(st.z) + 2;
    ctx.save();
    ctx.globalAlpha = st.fade;
    ctx.translate(st.x, y); ctx.scale(st.face < 0 ? -1 : 1, 1);
    if (def.rim) { ctx.shadowColor = def.rim; ctx.shadowBlur = 10; }    // 바닥과 구분되게 몸 테두리에 빛
    ctx.drawImage(im, sx, sy, C.fw, C.fh, -C.cx * s, -C.bottom * s, C.fw * s, C.fh * s);
    ctx.shadowBlur = 0;
    // 광폭화: 몸이 붉게 달아올라 일렁임
    if (raging() && st.mode === 'fight') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 + 0.12 * Math.sin(st.time * 12);
      ctx.filter = 'sepia(1) saturate(6) hue-rotate(-30deg)';
      ctx.drawImage(im, sx, sy, C.fw, C.fh, -C.cx * s, -C.bottom * s, C.fw * s, C.fh * s);
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = st.fade;
    }
    if (st.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(im, sx, sy, C.fw, C.fh, -C.cx * s, -C.bottom * s, C.fw * s, C.fh * s); }
    ctx.restore();
  }
  function drawables() { return def ? [{ key: st.z, draw: drawBody }] : []; }
  // 기절: 머리 위에 빙글빙글 도는 별
  function drawTop(ctx) {
    if (G.BFX) G.BFX.drawTop(ctx);
    if (st.stars > 0 && st.mode === 'fight') {
      const hx = st.x + st.face * def.hit.w * 0.32, hy = S().screenY(st.z, def.hit.h * 0.95);
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const a = st.time * 4 + i * Math.PI / 2, x = hx + Math.cos(a) * 30, y = hy + Math.sin(a) * 9;
        star(ctx, x, y, 6 + 1.5 * Math.sin(a), Math.sin(a) > 0 ? 1 : 0.55);
      }
      ctx.restore();
    }
  }
  function star(ctx, x, y, r, al) {
    ctx.fillStyle = `rgba(255, 228, 120, ${al})`; ctx.strokeStyle = `rgba(90, 60, 10, ${al})`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  const bar = document.getElementById('boss-bar');
  function updateUI() {
    if (!bar || !def) return;
    bar.querySelector('.name').textContent = `${def.floor}F · ${def.name} — ${def.title}`;
    bar.querySelector('.fill').style.width = (st.hp / st.maxHp * 100) + '%';
  }
  // 등장 연출(intro.js)용: 자세 바꾸기는 숨쉬기로 대신
  function setPose() {}
  // 개발 확인용: G.Boss.force('charge') / force('tusk')
  function force(kind, player) {
    player = player || G.player; st.act = null; st.at = 0;
    if (kind === 'tusk') st.act = { kind, t: 0, p: params('tusk'), hit: false };
    else startCharge(player, 0);
  }

  return { state: st, load, reset, update, drawBack, drawFront, drawables, drawTop, updateUI, force, setPose, get def() { return def; } };
})();

// ---------------------------------------------------------------------
// G.Boss: 지금 층 보스 종류에 맞는 엔진으로 연결 (고정형 boss.js / 움직이는 beast.js)
// ---------------------------------------------------------------------
G.Boss = (function () {
  let E = G.BossFixed;
  return {
    load(key) { E = G.BossDefs[key].kind === 'beast' ? G.Beast : G.BossFixed; E.load(key); },
    reset() { E.reset(); },
    update(dt, p) { E.update(dt, p); },
    drawBack(ctx) { E.drawBack(ctx); },
    drawFront(ctx) { E.drawFront(ctx); },
    drawables() { return E.drawables(); },
    drawTop(ctx) { E.drawTop(ctx); },
    updateUI() { E.updateUI(); },
    force(k, p) { E.force(k, p); },
    setPose(...a) { E.setPose(...a); },
    get state() { return E.state; },
    get def() { return E.def; },
    get engine() { return E; },
  };
})();
