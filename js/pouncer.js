// =====================================================================
// pouncer.js — 땅을 걸어 다니다 크게 덮치는 짐승형 보스. 보스 데이터는 bosses.js (kind: 'pouncer')
//
// 그림: AI 영상을 장면별로 쪼갠 시트 (오른쪽을 보는 옆모습. 왼쪽으로 갈 땐 좌우로 뒤집음)
//   clips: walk(걷기 반복) / pounce(웅크림 → 뛰어오름 → 공중 → 착지 → 일어남) / gust(날개 돌풍) / roar(울부짖기)
//   장면마다 크기가 달라서 clip마다 fw·fh(한 장면 크기), cx·bottom(발 가운데 = 기준점)
//   덮치기 영상은 제자리에서 뛰었다 착지 → 공중에 떠 있는 동안만 코드로 몸을 옮김 (발이 미끄러지지 않게)
//
// 그리폰 패턴
//   다가오기: 사자처럼 천천히 걸어옴. 걷는 중에는 맞지만, 여러 번 맞으면 곧바로 덮치기로 반격
//   덮치기: 웅크림(예고: 바닥에 붉은 원이 플레이어를 따라옴) → 뛰어올라 원에 착지 → 일어나는 동안 공격 기회
//           사암 기둥 위로 떨어지면 기둥이 부서지고 오래 비틀거림. 2단계: 한 번 더 이어서 덮침
//   날개 돌풍: 뒷발로 서서 날개를 세 번 내리침 → 바람에 밀려나고, 내리칠 때마다 모래 칼날이 바닥을 타고 날아옴(점프로 넘기)
//              사암 기둥 뒤에 숨으면 바람과 칼날을 막아 줌
//   광폭화: 울부짖은 뒤 덮치기 → 덮치기 → 돌풍 연속
// =====================================================================
G.Pouncer = (function () {
  const S = () => G.Stage;
  const R = (a, b) => a + Math.random() * (b - a);
  let def = null;
  const st = {
    hp: 1, maxHp: 1, mode: 'fight', timer: 0, time: 0, flash: 0, fade: 1,
    x: 0, z: 0, face: -1, act: null, clip: 'walk', frame: 0, at: 0,
    cur: { key: 'idle', frame: 0 }, prev: null, introGlow: 0,
    blades: [], target: null, last: null, stars: 0, hits: 0, combo: [], walk: 0,
  };

  function load(key) {
    def = G.BossDefs[key];
    for (const c of Object.values(def.clips)) c.sheets.forEach(src => G.Render.getImg(src));
    reset();
  }
  function reset() {
    Object.assign(st, {
      hp: def.hp, maxHp: def.hp, mode: 'fight', timer: 1.2, time: 0, flash: 0, fade: 1,
      x: def.start.x, z: def.start.z, face: def.start.face || -1, act: null, clip: 'walk', frame: 0, at: 0,
      blades: [], last: null, stars: 0, hits: 0, combo: [], raged: false, walk: 0,
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
    if (def.rage && k <= def.rage.at) Object.assign(p, def.rage[kind] || {});
    return p;
  }
  const raging = () => def.rage && st.hp / st.maxHp <= def.rage.at;

  // ---------- 동작 영상 ----------
  function seg(clip, name, u) {
    const [a, b] = def.clips[clip].seg[name];
    st.clip = clip; st.frame = Math.round(a + (b - a) * Math.max(0, Math.min(1, u)));
  }
  function pingpong(clip, name, t, fps) {
    const [a, b] = def.clips[clip].seg[name], n = b - a + 1, k = Math.floor(t * fps) % Math.max(1, n * 2 - 2);
    st.clip = clip; st.frame = a + (k < n ? k : 2 * n - 2 - k);
  }
  // 걷기: 걸은 거리만큼 장면을 넘김 (발이 바닥에 붙어 있게). stride: 시트 한 장면마다 나아가는 거리
  function walkAnim(moved) {
    const C = def.clips.walk, before = Math.floor(st.walk / C.stride);
    st.walk += moved;
    const k = Math.floor(st.walk / C.stride);
    st.clip = 'walk'; st.frame = k % C.count;
    if (Math.floor(k / 6) !== Math.floor(before / 6)) G.BFX.dust(st.x, st.z, 1, 0.4, def.theme.dust);
  }
  const idle = () => pingpong('roar', 'idle', st.time, 5);
  const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;

  // ---------- 매 프레임 ----------
  function update(dt, player) {
    if (st.mode !== st.pm) { st.pm = st.mode; if (st.mode === 'intro') st.at = 0; }
    st.time += dt; st.at += dt;
    st.flash = Math.max(0, st.flash - dt);
    st.stars = Math.max(0, st.stars - dt);
    if (st.mode === 'intro') {
      const t = st.at;
      if (t < 1.4) idle();
      else if (t < 1.9) seg('roar', 'lower', (t - 1.4) / 0.5);
      else if (t < 3.4) seg('roar', 'roar', (t - 1.9) / 1.5);
      else if (t < 4.3) seg('roar', 'back', (t - 3.4) / 0.9);
      else idle();
    } else if (st.mode === 'dying') {
      st.timer -= dt;
      seg('pounce', 'crouch', Math.min(1, (2.6 - st.timer) / 0.8));
      st.fade = Math.max(0, Math.min(1, st.timer / 1.2));
      if (Math.random() < 0.3) G.BFX.feathers(st.x + R(-60, 60), st.z, 60, 1, R(-1, 1), 0.5);
      if (st.timer <= 0) { st.mode = 'dead'; G.Game.win(); }
    } else if (st.mode === 'fight') {
      if (st.act) act(dt, player);
      else approach(dt, player);
    }
    Object.assign(st.target, { x: st.x, z: st.z, h: 0, active: st.mode === 'fight' });
    updateBlades(dt, player);
    G.BFX.update(dt);
    // 바람에 모래가 날림 (배경)
    if (def.theme.sand && Math.random() < dt * 6) G.BFX.dust(R(0, G.CFG.ARENA_W), R(0, S().DEPTH), 1, 0.5, def.theme.dust);
  }

  function approach(dt, player) {
    const dx = player.x - st.x, dz = player.z - st.z, dist = Math.abs(dx);
    if (Math.abs(dx) > 30) st.face = Math.sign(dx);
    st.timer -= dt;
    const want = dist > def.reach || Math.abs(dz) > 30;
    if (want && !player.dead) {
      const sp = def.walkSpeed * (raging() ? 1.3 : 1), x0 = st.x, z0 = st.z;
      if (dist > def.reach) st.x += Math.sign(dx) * sp * dt;
      st.z += Math.max(-1, Math.min(1, dz / 20)) * sp * 0.6 * dt;
      st.x = Math.max(60, Math.min(G.CFG.ARENA_W - 60, st.x));
      walkAnim(Math.hypot(st.x - x0, (st.z - z0) * 1.5));
    } else idle();
    if (raging() && Math.random() < dt * 8) G.BFX.dust(st.x + R(-40, 40), st.z, 1, 0.4, '220, 90, 40');
    // 다가오는 중에도 거리가 덮치기에 알맞으면 바로 덮침
    if (st.timer <= 0 && !player.dead && (!want || dist < def.patterns.pounce.maxDist)) choose(player);
  }

  function choose(player) {
    if (raging() && !st.combo.length && st.last !== 'combo') { st.combo = ['pounce', 'pounce', 'gust']; st.last = 'combo'; }
    let kind = st.combo.shift();
    if (!kind) {
      const dx = Math.abs(player.x - st.x);
      // 가까우면 돌풍으로 밀어내거나 덮치기, 멀면 덮치기. 같은 걸 세 번 연속은 안 함
      kind = dx < def.reach * 0.9 && st.last !== 'gust' ? (Math.random() < 0.55 ? 'gust' : 'pounce') : 'pounce';
      if (kind === 'pounce' && st.last === 'pounce2') kind = 'gust';
      st.last = kind === 'pounce' && st.last === 'pounce' ? 'pounce2' : kind;
    }
    start(kind, player);
  }
  function start(kind, player, quick) {
    const p = params(kind);
    st.face = Math.sign(player.x - st.x) || st.face;
    st.at = 0; st.hits = 0;
    st.act = { kind, t: 0, p, quick: !!quick || st.combo.length > 0, bounces: 0 };
    if (kind === 'pounce') aimPounce(st.act, player);
  }
  function end(rest) { st.act = null; st.at = 0; st.timer = st.combo.length ? 0.05 : rest; }

  function act(dt, player) {
    const A = st.act;
    A.t += dt;
    if (A.kind === 'pounce') pounceAct(dt, player, A, A.p);
    else if (A.kind === 'gust') gustAct(dt, player, A, A.p);
    else if (A.kind === 'roar') roarAct(dt, player, A);
  }

  // ---------- 덮치기 ----------
  function aimPounce(A, player) {
    const p = A.p, W = G.CFG.ARENA_W;
    let dx = player.x - st.x;
    const d = Math.max(p.minDist, Math.min(p.maxDist, Math.abs(dx)));
    dx = (Math.sign(dx) || st.face) * d;
    A.tx = Math.max(60, Math.min(W - 60, st.x + dx));
    A.tz = Math.max(4, Math.min(S().DEPTH - 2, player.z));
    if (Math.abs(A.tx - st.x) > 10) st.face = Math.sign(A.tx - st.x);
  }
  function pounceAct(dt, player, A, p) {
    const C = A.quick || A.bounces ? p.crouchQuick : p.crouch;
    if (A.phase === undefined) A.phase = 'crouch';
    if (A.phase === 'crouch') {
      if (A.t < C * p.track && !player.dead) aimPounce(A, player);
      seg('pounce', 'crouch', A.t / C);
      if (Math.random() < dt * 10) G.BFX.dust(st.x - st.face * 50, st.z, 1, 0.5, def.theme.dust);   // 뒷발로 모래를 긁음
      if (A.t >= C) { A.phase = 'air'; A.t = 0; A.x0 = st.x; A.z0 = st.z; G.Sound.play('swing3', { rate: 0.5 }); G.BFX.dust(st.x, st.z, 8, 1.2, def.theme.dust); }
    } else if (A.phase === 'air') {
      // 뛰어오름(leap) → 공중(air) → 내려앉기 직전(land 앞부분). 이 동안 몸이 원 쪽으로 날아감
      const u = Math.min(1, A.t / p.air);
      if (u < 0.45) seg('pounce', 'leap', u / 0.45);
      else if (u < 0.8) seg('pounce', 'air', (u - 0.45) / 0.35);
      else seg('pounce', 'land', (u - 0.8) / 0.2 * 0.5);
      const e = ease(u);
      st.x = lerp(A.x0, A.tx, e); st.z = lerp(A.z0, A.tz, e);
      if (u >= 1) landing(A, p, player);
    } else if (A.phase === 'stun') {                                    // 기둥에 부딪혀 비틀거림
      pingpong('pounce', 'recover', A.t, 5);
      if (A.t >= A.stun) { A.phase = 'recover'; A.t = 0; }
    } else if (A.phase === 'recover') {
      const T = p.recover;
      if (A.t < T * 0.3) seg('pounce', 'land', 0.5 + A.t / (T * 0.3) * 0.5);
      else seg('pounce', 'recover', (A.t - T * 0.3) / (T * 0.7));
      if (A.t >= T) {
        // 2단계: 기둥에 안 부딪혔으면 바로 한 번 더 덮침
        if (!A.rock && A.bounces < (p.bounce || 0) && !player.dead) {
          A.bounces++; A.phase = 'crouch'; A.t = 0; aimPounce(A, player);
        } else end(p.rest);
      }
    }
  }
  function landing(A, p, player) {
    G.Sound.play('smash'); G.FX.shake(12, 0.35); G.FX.hitstop(0.05);
    G.BFX.dust(A.tx, A.tz, 14, 1.6, def.theme.dust); G.BFX.feathers(A.tx, A.tz, 40, 5, null, 0.8);
    const r = p.radius, ex = (player.x - A.tx) / r, ez = (player.z - A.tz) / (r * 0.5);
    if (!player.dead && ex * ex + ez * ez < 1) G.Combat.hurtPlayer(player, p.dmg, A.tx, A.tz - 1, { stun: p.stunPlayer });
    A.rock = null;
    for (const q of S().data.pillars.slice()) {
      if (!q.breakable) continue;
      const qx = (A.tx - q.x) / (q.rx + r * 0.6), qz = (A.tz - q.z) / (q.rz + r * 0.3);
      if (qx * qx + qz * qz < 1) { A.rock = q; break; }
    }
    if (A.rock) {
      breakPillar(A.rock);
      A.phase = 'stun'; A.t = 0; A.stun = p.stunRock; st.stars = A.stun + 0.3;
    } else { A.phase = 'recover'; A.t = 0; }
  }
  function breakPillar(q) {
    if (!S().data.pillars.includes(q)) return;
    G.Sound.play('smash', { rate: 0.8 }); G.FX.shake(14, 0.35);
    G.BFX.debris(q.x, q.z, 26, 1.3); G.BFX.dust(q.x, q.z, 12, 1.6, def.theme.dust);
    S().breakPillar(q);
    G.FX.text(q.x, S().screenY(q.z, (q.h || 120) + 30), '쾅!', '#ffe0a0');
  }

  // ---------- 날개 돌풍 ----------
  // 뒷발로 섬(rise) → 날개를 세 번 내리침(beat): 그동안 바람에 밀려나고, 내리칠 때마다 모래 칼날 → 내려앉음(settle)
  function gustAct(dt, player, A, p) {
    const T1 = A.quick ? p.riseQuick : p.rise, T2 = T1 + p.beatTime, T3 = T2 + p.settle;
    if (A.t < T1) seg('gust', 'rise', A.t / T1);
    else if (A.t < T2) {
      const u = (A.t - T1) / p.beatTime;
      seg('gust', 'beat', u);
      // 내리치는 순간(beats: beat 구간 안 비율)마다 모래 칼날
      A.fired = A.fired || 0;
      while (A.fired < p.beats.length && u >= p.beats[A.fired]) {
        A.fired++;
        G.Sound.play('swing3', { rate: 0.6, vol: 0.9 }); G.FX.shake(5, 0.15);
        st.blades.push({ x: st.x + st.face * 70, dir: st.face, speed: p.bladeSpeed, dmg: p.dmg, hit: false });
        for (let i = 0; i < 6; i++) G.BFX.dust(st.x + st.face * R(40, 140), st.z + R(-30, 30), 1, 1.2, def.theme.dust);
      }
      // 바람: 앞쪽에 있으면 밀려남 (기둥 뒤에 있으면 막아 줌, 구르는 중엔 안 밀림)
      const dx = (player.x - st.x) * st.face;
      if (!player.dead && dx > 0 && dx < p.windRange && !shelter(player) && !player.dash) {
        player.x += st.face * p.push * dt;
        player.x = Math.max(S().data.minX + 10, Math.min(S().data.maxX - 10, player.x));
        if (Math.random() < dt * 20) G.BFX.dust(player.x - st.face * 10, player.z, 1, 0.5, def.theme.dust);
      }
    } else if (A.t < T3) seg('gust', 'settle', (A.t - T2) / p.settle);
    else end(p.rest);
  }
  // 플레이어와 그리폰 사이에 사암 기둥이 있으면 바람·칼날을 막아 줌
  function shelter(player) {
    for (const q of S().data.pillars) {
      if (!q.breakable) continue;
      if ((q.x - st.x) * (q.x - player.x) < 0 && Math.abs(q.z - player.z) < q.rz + 20) return q;
    }
    return null;
  }
  // 모래 칼날: 깊이 전체를 덮는 줄이 옆으로 날아감 → 점프로 넘기. 기둥에 막힘
  function updateBlades(dt, player) {
    const W = G.CFG.ARENA_W;
    for (const b of st.blades) {
      const x0 = b.x;
      b.x += b.dir * b.speed * dt;
      if (Math.random() < dt * 30) G.BFX.dust(b.x, R(0, S().DEPTH), 1, 0.7, def.theme.dust);
      for (const q of S().data.pillars) {
        if (!q.breakable) continue;
        if ((x0 - q.x) * (b.x - q.x) <= 0) { b.dead = true; G.BFX.dust(q.x, q.z, 6, 1, def.theme.dust); break; }
      }
      if (!b.dead && !b.hit && !player.dead && (x0 - player.x) * (b.x - player.x) <= 0 && player.h < 44) {
        b.hit = true; G.Combat.hurtPlayer(player, b.dmg, b.x - b.dir * 40, player.z);
      }
      if (b.x < 0 || b.x > W) b.dead = true;
    }
    st.blades = st.blades.filter(b => !b.dead);
  }

  // ---------- 울부짖기 (광폭화 시작) ----------
  function roarAct(dt, player, A) {
    if (A.t < 0.4) seg('roar', 'lower', A.t / 0.4);
    else if (A.t < 1.7) {
      seg('roar', 'roar', (A.t - 0.4) / 1.3);
      if (!A.done) {
        A.done = true;
        G.Sound.play(def.roar || 'roar'); G.FX.shake(16, 0.7);
        G.BFX.screenFlash('255, 90, 30', 0.35);
        G.FX.text(st.x, S().screenY(st.z, def.hit.h + 60), '광폭화!', '#ff5a3a');
        G.BFX.feathers(st.x, st.z, 80, 10, null, 1.2);
      }
    } else if (A.t < 2.3) seg('roar', 'back', (A.t - 1.7) / 0.6);
    else { st.act = null; st.timer = 0.2; st.at = 0; }
  }

  // 기술 중에는 막힘. 걷거나 서 있을 때·덮치고 일어나는 중·비틀거릴 때·돌풍 뒤 내려앉을 때만 맞음
  function guarding() {
    const A = st.act;
    if (!A) return false;
    if (A.kind === 'pounce') return !(A.phase === 'stun' || A.phase === 'recover');
    if (A.kind === 'gust') { const p = A.p, T2 = (A.quick ? p.riseQuick : p.rise) + p.beatTime; return A.t < T2; }
    return true;
  }
  function hurt(dmg) {
    if (st.mode !== 'fight') return;
    if (guarding()) return false;
    st.hp = Math.max(0, st.hp - dmg);
    st.flash = 0.08;
    G.BFX.feathers(st.x, st.z, 90, 2, null, 0.7);
    if (!st.act) { st.hits++; if (st.hits >= def.counterHits && st.hp > 0) { st.combo = []; start('pounce', G.player, true); } }
    if (!st.raged && raging() && st.hp > 0) { st.raged = true; st.combo = []; st.act = { kind: 'roar', t: 0, p: {} }; }
    updateUI();
    if (st.hp <= 0) {
      st.mode = 'dying'; st.timer = 2.6; st.act = null; st.blades = [];
      G.Sound.play(def.roar || 'roar', { rate: 0.8 });
      G.FX.shake(12, 0.5);
    }
  }

  // ---------- 그리기 ----------
  function drawBack() {}
  function drawFront(ctx) {
    if (!def) return;
    const F = S().floorY, A = st.act;
    ctx.save();
    if (A && A.kind === 'pounce' && (A.phase === 'crouch' || A.phase === 'air')) {
      const C = A.quick || A.bounces ? A.p.crouchQuick : A.p.crouch;
      const k = A.phase === 'crouch' ? Math.min(1, A.t / C) : 1, y = F(A.tz), r = A.p.radius;
      const flash = k > 0.8 ? 0.5 + 0.5 * Math.sin(st.time * 50) : 0;
      ctx.fillStyle = `rgba(200, 30, 20, ${0.16 + 0.14 * k + 0.2 * flash})`;
      ctx.beginPath(); ctx.ellipse(A.tx, y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255, 80, 50, ${0.3 + 0.3 * flash})`;
      ctx.beginPath(); ctx.ellipse(A.tx, y, r * k, r * 0.5 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (A && A.kind === 'gust') {
      // 바람이 부는 쪽(앞)을 옅게 표시
      const p = A.p, T1 = A.quick ? p.riseQuick : p.rise;
      if (A.t < T1 + p.beatTime) {
        const k = Math.min(1, A.t / T1), y0 = F(0), y1 = F(S().DEPTH);
        const g = ctx.createLinearGradient(st.x, 0, st.x + st.face * p.windRange, 0);
        g.addColorStop(0, `rgba(255, 210, 140, ${0.22 * k})`); g.addColorStop(1, 'rgba(255, 210, 140, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(st.x, st.x + st.face * p.windRange), y0, p.windRange, y1 - y0);
      }
    }
    // 모래 칼날
    for (const b of st.blades) {
      const D = S().DEPTH;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(b.x - 40 * b.dir, 0, b.x, 0);
      g.addColorStop(0, 'rgba(255, 200, 120, 0)'); g.addColorStop(1, 'rgba(255, 230, 170, 0.8)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(b.x - 40 * b.dir, F(0)); ctx.lineTo(b.x, F(0) - 30); ctx.lineTo(b.x, F(D) - 30); ctx.lineTo(b.x - 40 * b.dir, F(D)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 245, 210, 0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, F(0) - 30); ctx.lineTo(b.x, F(D)); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    G.Render.shadow(ctx, st.x, F(st.z) + 2, def.hit.w * 0.8, 0.4 * st.fade);
  }
  function drawBody(ctx) {
    const C = def.clips[st.clip], f = Math.max(0, Math.min(C.count - 1, st.frame));
    const im = G.Render.getImg(C.sheets[Math.floor(f / 16)]);
    if (!im) return;
    const k = f % 16, sx = (k % 4) * C.fw, sy = Math.floor(k / 4) * C.fh, s = def.scale;
    const y = S().floorY(st.z) + 2;
    ctx.save();
    ctx.globalAlpha = st.fade;
    ctx.translate(st.x, y); ctx.scale(st.face < 0 ? -1 : 1, 1);
    const draw = () => ctx.drawImage(im, sx, sy, C.fw, C.fh, -C.cx * s, -C.bottom * s, C.fw * s, C.fh * s);
    draw();
    if (raging() && st.mode === 'fight') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 + 0.12 * Math.sin(st.time * 12);
      ctx.filter = 'sepia(1) saturate(6) hue-rotate(-30deg)';
      draw();
      ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = st.fade;
    }
    if (st.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; draw(); }
    ctx.restore();
  }
  function drawables() { return def ? [{ key: st.z, draw: drawBody }] : []; }
  function drawTop(ctx) {
    if (G.BFX) G.BFX.drawTop(ctx);
    if (st.stars > 0 && st.mode === 'fight') {
      const hx = st.x + st.face * 60, hy = S().screenY(st.z, def.hit.h * 0.9);
      for (let i = 0; i < 4; i++) {
        const a = st.time * 4 + i * Math.PI / 2, x = hx + Math.cos(a) * 30, y = hy + Math.sin(a) * 9;
        ctx.fillStyle = `rgba(255, 228, 120, ${Math.sin(a) > 0 ? 1 : 0.55})`;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  const bar = document.getElementById('boss-bar');
  function updateUI() {
    if (!bar || !def) return;
    bar.querySelector('.name').textContent = `${def.floor}F · ${def.name} — ${def.title}`;
    bar.querySelector('.fill').style.width = (st.hp / st.maxHp * 100) + '%';
  }
  function setPose() { st.at = 0; }
  // 개발 확인용: G.Boss.force('pounce') / force('gust')
  function force(kind, player) { player = player || G.player; st.act = null; start(kind, player); }

  return { state: st, load, reset, update, drawBack, drawFront, drawables, drawTop, updateUI, force, setPose, get def() { return def; } };
})();
