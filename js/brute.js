// =====================================================================
// brute.js — 걸어 다니며 무기를 휘두르는 결투형 보스. 보스 데이터는 bosses.js (kind: 'brute')
//
// 그림: AI 영상을 장면별로 쪼갠 시트 (오른쪽을 보는 옆모습. 왼쪽으로 갈 땐 좌우로 뒤집음)
//   clips: walk(걷기 반복) / sweep(휩쓸기) / smash(내려찍기 → 박힘 → 뽑기) / roar(포효)
//   장면마다 크기가 달라서 clip마다 fw·fh(한 장면 크기), cx·bottom(발굽 가운데 = 기준점)
//
// 미노타우로스 패턴
//   다가오기: 플레이어 쪽으로 천천히 걸어옴. 걷는 중에는 맞지만, 여러 번 맞으면 곧바로 휩쓸기로 반격
//   휩쓸기: 도끼를 뒤로 젖힘(예고: 몸 둘레 바닥에 붉은 고리) → 바닥을 쓸며 한 바퀴 → 점프로 넘기
//   내려찍기: 도끼를 치켜듦(예고: 앞쪽 바닥에 붉은 원) → 내리찍음 → 도끼가 박혀 빼는 동안 공격 기회
//     2단계: 내리찍은 자리에서 바닥을 타고 충격파가 양옆으로 퍼짐 → 점프로 넘기
//   광폭화: 휩쓸기 → 휩쓸기 → 내려찍기 연속
//   돌벽 조각(breakable 기둥): 휩쓸기·충격파를 막아 줌 (대신 부서짐). 내려찍기에 맞아도 부서짐
// =====================================================================
G.Brute = (function () {
  const S = () => G.Stage;
  const R = (a, b) => a + Math.random() * (b - a);
  let def = null;
  const st = {
    hp: 1, maxHp: 1, mode: 'fight', timer: 0, time: 0, flash: 0, fade: 1,
    x: 0, z: 0, face: -1, act: null, clip: 'walk', frame: 0, at: 0,
    cur: { key: 'idle', frame: 0 }, prev: null, introGlow: 0,
    marks: [], waves: [], target: null, last: null, stars: 0, hits: 0, combo: [],
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
      marks: [], waves: [], last: null, stars: 0, hits: 0, combo: [], raged: false,
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
  const phase2 = () => def.phase2 && st.hp / st.maxHp <= def.phase2.at;

  // ---------- 동작 영상 ----------
  function seg(clip, name, u) {
    const [a, b] = def.clips[clip].seg[name];
    st.clip = clip; st.frame = Math.round(a + (b - a) * Math.max(0, Math.min(1, u)));
  }
  function pingpong(clip, name, t, fps) {
    const [a, b] = def.clips[clip].seg[name], n = b - a + 1, k = Math.floor(t * fps) % Math.max(1, n * 2 - 2);
    st.clip = clip; st.frame = a + (k < n ? k : 2 * n - 2 - k);
  }
  function walkAnim(t) {
    const C = def.clips.walk;
    st.clip = 'walk'; st.frame = Math.floor(t * C.fps) % C.count;
  }
  const idle = () => pingpong('roar', 'idle', st.time, 5);

  // ---------- 매 프레임 ----------
  function update(dt, player) {
    if (st.mode !== st.pm) { st.pm = st.mode; if (st.mode === 'intro') st.at = 0; }   // 등장 연출 시작 시점부터 시간 셈
    st.time += dt; st.at += dt;
    st.flash = Math.max(0, st.flash - dt);
    st.stars = Math.max(0, st.stars - dt);
    if (st.mode === 'intro') {
      // 등장: 잠깐 노려보다가 포효
      const t = st.at;
      if (t < 1.4) idle();
      else if (t < 1.9) seg('roar', 'lower', (t - 1.4) / 0.5);
      else if (t < 3.3) pingpong('roar', 'roar', t - 1.9, 9);
      else if (t < 4.2) seg('roar', 'back', (t - 3.3) / 0.9);
      else idle();
    } else if (st.mode === 'dying') {
      st.timer -= dt;
      pingpong('smash', 'stuck', 2.6 - st.timer, 4);
      st.fade = Math.max(0, Math.min(1, st.timer / 1.2));
      if (Math.random() < 0.25) G.BFX.dust(st.x + R(-80, 80), st.z, 1, 0.6, def.theme.dust);
      if (st.timer <= 0) { st.mode = 'dead'; G.Game.win(); }
    } else if (st.mode === 'fight') {
      if (st.act) act(dt, player);
      else approach(dt, player);
    }
    Object.assign(st.target, { x: st.x, z: st.z, h: 0, active: st.mode === 'fight' });
    updateWaves(dt, player);
    G.BFX.update(dt);
    st.marks = st.marks.filter(m => (m.k += dt) < m.life);
  }

  // 다가오기: 플레이어 쪽으로 걸어오다 사정거리에 들면 공격
  function approach(dt, player) {
    const dx = player.x - st.x, dz = player.z - st.z, dist = Math.abs(dx);
    if (Math.abs(dx) > 30) st.face = Math.sign(dx);
    st.timer -= dt;
    const want = dist > def.reach || Math.abs(dz) > 26;
    if (want && !player.dead) {
      const sp = def.walkSpeed * (raging() ? 1.35 : 1);
      if (dist > def.reach) st.x += Math.sign(dx) * sp * dt;
      st.z += Math.max(-1, Math.min(1, dz / 20)) * sp * 0.6 * dt;
      st.x = Math.max(60, Math.min(G.CFG.ARENA_W - 60, st.x));
      walkAnim(st.at);
      if (Math.floor(st.at * def.clips.walk.fps / (def.clips.walk.count / 2)) !== Math.floor((st.at - dt) * def.clips.walk.fps / (def.clips.walk.count / 2))) {
        G.FX.shake(2.5, 0.08); G.BFX.dust(st.x, st.z, 2, 0.5, def.theme.dust);   // 쿵쿵 걸음
      }
    } else idle();
    if (raging() && Math.random() < dt * 8) G.BFX.dust(st.x + R(-40, 40), st.z, 1, 0.4, '220, 70, 40');
    // 너무 오래 못 다가가면(멀리서 도망 다니면) 그 자리에서 내려찍기로 충격파를 보냄
    if (st.timer <= 0 && !player.dead && (!want || st.timer < -def.chase)) choose(player);
  }

  function choose(player) {
    if (raging() && !st.combo.length && st.last !== 'combo') { st.combo = ['sweep', 'sweep', 'smash']; st.last = 'combo'; }
    let kind = st.combo.shift();
    if (!kind) {
      const dx = Math.abs(player.x - st.x);
      // 가까우면 휩쓸기/내려찍기 번갈아, 멀면 내려찍기(2단계부터 충격파가 닿음)
      kind = dx < def.patterns.sweep.range * 0.8 ? (st.last === 'sweep' ? 'smash' : (Math.random() < 0.55 ? 'sweep' : 'smash')) : 'smash';
      st.last = kind;
    }
    start(kind, player);
  }
  function start(kind, player, quick) {
    const p = params(kind);
    st.face = Math.sign(player.x - st.x) || st.face;
    st.at = 0; st.hits = 0;
    st.act = { kind, t: 0, p, hit: false, quick: !!quick || st.combo.length > 0 || (raging() && kind !== 'smash') };
    if (kind === 'smash') { st.act.tx = st.x + st.face * p.reach; st.act.tz = st.z; }
  }
  function end(rest) {
    st.act = null; st.at = 0;
    st.timer = st.combo.length ? 0.05 : rest;
  }

  function act(dt, player) {
    const A = st.act, p = A.p;
    A.t += dt;
    if (A.kind === 'sweep') sweepAct(dt, player, A, p);
    else if (A.kind === 'smash') smashAct(dt, player, A, p);
    else if (A.kind === 'roar') roarAct(dt, player, A);
  }

  // ---------- 휩쓸기 ----------
  // 들어 올림 → 뒤로 젖히고 버팀(예고) → 한 바퀴 → 원래 자세. 판정은 도끼가 낮게 지나갈 때 한 번
  function sweepAct(dt, player, A, p) {
    const T1 = p.raise, T2 = T1 + (A.quick ? p.holdQuick : p.hold), T3 = T2 + p.swing, T4 = T3 + p.recover;
    if (A.t < T1) seg('sweep', 'raise', A.t / T1);
    else if (A.t < T2) pingpong('sweep', 'hold', A.t - T1, 6);
    else if (A.t < T3) {
      const u = (A.t - T2) / p.swing;
      seg('sweep', 'swing', u);
      if (!A.whoosh) { A.whoosh = true; G.Sound.play('swing3', { rate: 0.55 }); }
      if (!A.hit && u >= p.hitAt) {
        A.hit = true;
        G.FX.shake(7, 0.2);
        for (let i = 0; i < 8; i++) G.BFX.dust(st.x + st.face * R(-p.back, p.range), st.z + R(-20, 20), 1, 0.9, def.theme.dust);
        const dx = (player.x - st.x) * st.face, inside = dx > -p.back && dx < p.range && Math.abs(player.z - st.z) < p.depth;
        if (inside) {
          const wall = blocker(player.x, player.z);
          if (wall) breakWall(wall);
          else if (!player.dead && player.h < p.jumpOver) G.Combat.hurtPlayer(player, p.dmg, st.x, st.z);
        }
        // 범위 안의 돌벽 조각은 부서짐
        for (const q of S().data.pillars.slice()) {
          if (!q.breakable) continue;
          const qx = (q.x - st.x) * st.face;
          if (qx > -p.back && qx < p.range && Math.abs(q.z - st.z) < p.depth + q.rz) breakWall(q);
        }
      }
    } else if (A.t < T4) seg('sweep', 'recover', (A.t - T3) / p.recover);
    else end(p.rest);
  }

  // ---------- 내려찍기 ----------
  function smashAct(dt, player, A, p) {
    const T1 = p.raise, T2 = T1 + (A.quick ? p.holdQuick : p.hold), T3 = T2 + p.strike, T4 = T3 + p.stuck, T5 = T4 + p.pull;
    if (A.t < T2) {
      // 예고 중에는 플레이어 쪽으로 조금씩 다가가고 깊이를 맞춤 (도끼가 떨어질 자리 = 몸 앞 reach)
      if (A.t < T1 + (T2 - T1) * 0.6 && !player.dead) {
        const gap = (player.x - st.x) * st.face - p.reach;
        if (gap > 0) st.x += st.face * Math.min(gap, def.walkSpeed * 0.8 * dt);
        st.z += Math.max(-1, Math.min(1, (player.z - st.z) / 20)) * def.walkSpeed * 0.5 * dt;
        st.x = Math.max(60, Math.min(G.CFG.ARENA_W - 60, st.x));
      }
      A.tx = st.x + st.face * p.reach; A.tz = st.z;
      if (A.t < T1) seg('smash', 'raise', A.t / T1);
      else pingpong('smash', 'hold', A.t - T1, 5);
    } else if (A.t < T3) {
      seg('smash', 'strike', (A.t - T2) / p.strike);
      if (!A.hit && A.t >= T2 + p.strike * 0.7) { A.hit = true; impact(A, p, player); }
    } else if (A.t < T4) {
      // 박힌 도끼를 빼려고 낑낑댐 (공격 기회)
      const u = (A.t - T3) / p.stuck;
      seg('smash', 'stuck', u);
      if (Math.random() < dt * 6) G.BFX.dust(A.tx, A.tz, 1, 0.5, def.theme.dust);
    } else if (A.t < T5) {
      if (!A.pulled) { A.pulled = true; G.Sound.play('smash', { rate: 1.4, vol: 0.5 }); G.BFX.debris(A.tx, A.tz, 8, 0.7); }
      seg('smash', 'pull', (A.t - T4) / p.pull);
    } else end(p.rest);
  }
  function impact(A, p, player) {
    G.Sound.play('smash'); G.FX.shake(14, 0.4); G.FX.hitstop(0.06);
    G.BFX.flash(A.tx, A.tz, 10, 120, '255, 200, 140', 0.22);
    G.BFX.dust(A.tx, A.tz, 14, 1.5, def.theme.dust); G.BFX.debris(A.tx, A.tz, 18, 1.1);
    const r = p.radius, ex = (player.x - A.tx) / r, ez = (player.z - A.tz) / (r * 0.5);
    if (!player.dead && ex * ex + ez * ez < 1 && player.h < 120) G.Combat.hurtPlayer(player, p.dmg, A.tx, A.tz - 1, { stun: p.stunPlayer });
    for (const q of S().data.pillars.slice()) {
      if (!q.breakable) continue;
      const qx = (A.tx - q.x) / (q.rx + r * 0.6), qz = (A.tz - q.z) / (q.rz + r * 0.3);
      if (qx * qx + qz * qz < 1) breakWall(q);
    }
    // 2단계: 바닥을 타고 퍼지는 충격파 (양옆으로)
    if (p.wave) for (const dir of [-1, 1]) st.waves.push({ x: A.tx, dir, speed: p.waveSpeed, dmg: p.waveDmg, life: 0, hit: false });
  }
  // 충격파: 전투장 깊이 전체를 덮는 줄이 옆으로 달려감 → 점프로 넘기. 돌벽 조각에 막힘
  function updateWaves(dt, player) {
    const W = G.CFG.ARENA_W;
    for (const w of st.waves) {
      const x0 = w.x;
      w.x += w.dir * w.speed * dt; w.life += dt;
      if (Math.random() < dt * 30) G.BFX.dust(w.x, R(0, S().DEPTH), 1, 0.6, def.theme.dust);
      for (const q of S().data.pillars) {
        if (!q.breakable) continue;
        if ((x0 - q.x) * (w.x - q.x) <= 0) { w.dead = true; breakWall(q); break; }   // 돌벽에 부딪혀 멈춤
      }
      if (!w.hit && !player.dead && (x0 - player.x) * (w.x - player.x) <= 0 && player.h < 34) {
        w.hit = true; G.Combat.hurtPlayer(player, w.dmg, w.x - w.dir * 40, player.z);
      }
      if (w.x < 0 || w.x > W) w.dead = true;
    }
    st.waves = st.waves.filter(w => !w.dead);
  }

  // 플레이어와 미노타우로스 사이를 막고 있는 돌벽 조각 (가로로 사이에 있고, 깊이가 플레이어와 비슷)
  function blocker(px, pz) {
    for (const q of S().data.pillars) {
      if (!q.breakable) continue;
      if ((q.x - st.x) * (q.x - px) < 0 && Math.abs(q.z - pz) < q.rz + 18) return q;
    }
    return null;
  }
  function breakWall(q) {
    if (!S().data.pillars.includes(q)) return;
    G.Sound.play('smash', { rate: 0.8 }); G.FX.shake(10, 0.3);
    G.BFX.debris(q.x, q.z, 26, 1.3); G.BFX.dust(q.x, q.z, 12, 1.6, def.theme.dust);
    S().breakPillar(q);
    G.FX.text(q.x, S().screenY(q.z, (q.h || 80) + 30), '쾅!', '#ffd0a0');
  }

  // ---------- 포효 (광폭화 시작) ----------
  function roarAct(dt, player, A) {
    if (A.t < 0.4) seg('roar', 'lower', A.t / 0.4);
    else if (A.t < 1.6) {
      pingpong('roar', 'roar', A.t - 0.4, 9);
      if (!A.done) {
        A.done = true;
        G.Sound.play(def.roar || 'roar'); G.FX.shake(16, 0.7);
        G.BFX.screenFlash('255, 60, 30', 0.35);
        G.FX.text(st.x, S().screenY(st.z, def.hit.h + 40), '광폭화!', '#ff5a3a');
        // 가까이 있으면 포효에 밀려남
        const dx = player.x - st.x;
        if (!player.dead && Math.abs(dx) < 200 && Math.abs(player.z - st.z) < 60) { player.vx = Math.sign(dx || 1) * 420; player.vh = 260; player.onGround = false; }
      }
    } else if (A.t < 2.2) seg('roar', 'back', (A.t - 1.6) / 0.6);
    else { st.act = null; st.timer = 0.2; st.at = 0; }
  }

  // 공격 중에는 막힘(슈퍼아머). 걷거나 서 있을 때·도끼가 박혔을 때만 맞음
  function guarding() {
    const A = st.act;
    if (!A) return false;
    if (A.kind === 'smash') { const p = A.p, T3 = p.raise + (A.quick ? p.holdQuick : p.hold) + p.strike; return !(A.t >= T3 && A.t < T3 + p.stuck + p.pull * 0.5); }
    return true;
  }
  function hurt(dmg) {
    if (st.mode !== 'fight') return;
    if (guarding()) return false;
    st.hp = Math.max(0, st.hp - dmg);
    st.flash = 0.08;
    // 걷거나 서 있을 때 여러 번 맞으면 곧바로 휩쓸기로 반격
    if (!st.act) { st.hits++; if (st.hits >= def.counterHits && st.hp > 0) { const P = G.player; st.combo = []; start('sweep', P, true); } }
    // 광폭화 시작: 포효 (박혀 있던 도끼도 바로 뽑음)
    if (!st.raged && raging() && st.hp > 0) { st.raged = true; st.combo = []; st.act = { kind: 'roar', t: 0, p: {} }; }
    updateUI();
    if (st.hp <= 0) {
      st.mode = 'dying'; st.timer = 2.6; st.act = null; st.waves = [];
      G.Sound.play(def.roar || 'roar', { rate: 0.8 });
      G.FX.shake(12, 0.5);
    }
  }

  // ---------- 그리기 ----------
  function drawBack() {}
  function ring(ctx, x, z, r0, r1, front, back, face, k) {
    const y = S().floorY(z), flash = k > 0.8 ? 0.5 + 0.5 * Math.sin(st.time * 50) : 0;
    ctx.fillStyle = `rgba(220, 40, 30, ${0.14 + 0.16 * k + 0.2 * flash})`;
    ctx.beginPath(); ctx.ellipse(x + face * (front - back) / 2, y, (front + back) / 2, r1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255, 110, 80, ${0.5 + 0.4 * flash})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x + face * (front - back) / 2, y, (front + back) / 2, r1, 0, 0, Math.PI * 2); ctx.stroke();
  }
  function drawFront(ctx) {
    if (!def) return;
    const F = S().floorY, A = st.act;
    ctx.save();
    if (A && A.kind === 'sweep') {
      const p = A.p, T2 = p.raise + (A.quick ? p.holdQuick : p.hold);
      if (A.t < T2) ring(ctx, st.x, st.z, 0, p.depth, p.range, p.back, st.face, Math.min(1, A.t / T2));
    }
    if (A && A.kind === 'smash') {
      const p = A.p, T2 = p.raise + (A.quick ? p.holdQuick : p.hold);
      if (A.t < T2 + p.strike) {
        const k = Math.min(1, A.t / T2), y = F(A.tz), flash = k > 0.8 ? 0.5 + 0.5 * Math.sin(st.time * 50) : 0;
        ctx.fillStyle = `rgba(200, 30, 20, ${0.16 + 0.14 * k + 0.2 * flash})`;
        ctx.beginPath(); ctx.ellipse(A.tx, y, p.radius, p.radius * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255, 80, 50, ${0.3 + 0.3 * flash})`;
        ctx.beginPath(); ctx.ellipse(A.tx, y, p.radius * k, p.radius * 0.5 * k, 0, 0, Math.PI * 2); ctx.fill();
        // 2단계: 충격파가 갈 길을 옅은 줄로
        if (p.wave) {
          ctx.strokeStyle = `rgba(255, 90, 60, ${0.25 + 0.25 * flash})`; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(G.CFG.ARENA_W, y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
    // 충격파: 깊이 전체에 걸친 빛나는 금
    for (const w of st.waves) {
      const D = S().DEPTH;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(w.x - 30 * w.dir, 0, w.x, 0);
      g.addColorStop(0, 'rgba(255, 120, 40, 0)'); g.addColorStop(1, 'rgba(255, 170, 80, 0.8)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(w.x - 30 * w.dir, F(0)); ctx.lineTo(w.x, F(0) - 18); ctx.lineTo(w.x, F(D) - 18); ctx.lineTo(w.x - 30 * w.dir, F(D)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w.x, F(0) - 18); ctx.lineTo(w.x, F(D)); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    G.Render.shadow(ctx, st.x, F(st.z) + 2, def.hit.w * 0.75, 0.42 * st.fade);
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
  function drawTop(ctx) { if (G.BFX) G.BFX.drawTop(ctx); }

  const bar = document.getElementById('boss-bar');
  function updateUI() {
    if (!bar || !def) return;
    bar.querySelector('.name').textContent = `${def.floor}F · ${def.name} — ${def.title}`;
    bar.querySelector('.fill').style.width = (st.hp / st.maxHp * 100) + '%';
  }
  function setPose() { st.at = 0; }
  // 개발 확인용: G.Boss.force('sweep') / force('smash')
  function force(kind, player) { player = player || G.player; st.act = null; start(kind, player); }

  return { state: st, load, reset, update, drawBack, drawFront, drawables, drawTop, updateUI, force, setPose, get def() { return def; } };
})();
