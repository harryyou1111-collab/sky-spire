// =====================================================================
// flyer.js — 날아다니는 보스 (공중에 떠서 움직이는 보스). 보스 데이터는 bosses.js (kind: 'flyer')
//
// 그림: AI 영상을 장면별로 쪼갠 시트 (오른쪽을 보는 옆모습. 왼쪽으로 갈 땐 좌우로 뒤집음)
//   모든 장면은 같은 기준점(떠 있을 때 발끝)에 맞춰 둠 → 화면 위치 = (x, 바닥선(z) - alt)
//   clips: fly(날갯짓 반복) / dive(날개 접기 → 급강하 자세 → 할퀴기 → 다시 떠오름) / land(내려앉기 → 지침 → 날아오름)
//   land 장면은 그림 속 땅이 기준점보다 ground 픽셀 아래 → 땅에 앉아 있을 땐 alt = ground × scale
//
// 하피 여왕 패턴
//   급강하: 날개를 접고 노려봄(예고: 바닥에 붉은 원이 플레이어를 따라감) → 원으로 내리꽂힘
//           → 땅에 박혀 잠깐 지침 (공격 기회). 바위 기둥 위로 떨어지면 기둥이 부서지고 오래 지침
//           2단계: 바위에 안 부딪히면 바로 튀어 올라 한 번 더 급강하
//   깃털 비: 높이 떠서 날개를 치켜듦(예고: 바닥 여러 곳에 붉은 원) → 날개를 내리치며 깃털을 쏟아부음
//   할퀴기: 가까이 있으면 낮게 내려와(예고: 앞쪽 붉은 반원) 발톱으로 할큄 → 잠깐 빈틈
//   떠 있을 때(쉬는 중)는 점프해서 때릴 수 있음. 기술을 쓰는 중에는 공격이 막힘
// =====================================================================
G.Flyer = (function () {
  const S = () => G.Stage;
  const R = (a, b) => a + Math.random() * (b - a);
  let def = null;
  const st = {
    hp: 1, maxHp: 1, mode: 'fight', timer: 0, time: 0, flash: 0, fade: 1,
    x: 0, z: 0, alt: 0, face: -1, act: null, clip: 'fly', frame: 0, at: 0,
    cur: { key: 'idle', frame: 0 }, prev: null, introGlow: 0,
    marks: [], feathers: [], target: null, last: null, stars: 0, wind: 0,
  };
  const groundAlt = () => def.clips.land.ground * def.scale;   // 땅에 앉은 장면의 기준점 높이

  function load(key) {
    def = G.BossDefs[key];
    for (const c of Object.values(def.clips)) c.sheets.forEach(src => G.Render.getImg(src));
    reset();
  }
  function reset() {
    Object.assign(st, {
      hp: def.hp, maxHp: def.hp, mode: 'fight', timer: 1.4, time: 0, flash: 0, fade: 1,
      x: def.start.x, z: def.start.z, alt: def.hover, face: def.start.face || -1, act: null, clip: 'fly', frame: 0, at: 0,
      marks: [], feathers: [], last: null, stars: 0,
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
  function seg(clip, name, u) {
    const [a, b] = def.clips[clip].seg[name];
    st.clip = clip; st.frame = Math.round(a + (b - a) * Math.max(0, Math.min(1, u)));
  }
  // 구간을 앞뒤로 왕복 (지친 자세처럼 거의 멈춘 장면을 끊김 없이)
  function pingpong(clip, name, t, fps) {
    const [a, b] = def.clips[clip].seg[name], n = b - a + 1, k = Math.floor(t * fps) % (n * 2 - 2);
    st.clip = clip; st.frame = a + (k < n ? k : 2 * n - 2 - k);
  }
  function flap(rate) {
    const C = def.clips.fly;
    st.clip = 'fly'; st.frame = Math.floor(st.time * (rate || C.fps)) % C.count;
  }
  const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;

  // ---------- 매 프레임 ----------
  function update(dt, player) {
    st.time += dt; st.at += dt;
    st.flash = Math.max(0, st.flash - dt);
    st.stars = Math.max(0, st.stars - dt);
    if (st.mode === 'intro') { flap(); st.alt = def.hover + Math.sin(st.time * 2.4) * 8; }
    else if (st.mode === 'dying') {
      st.timer -= dt;
      const t = 2.6 - st.timer;
      if (t < 0.6) { seg('land', 'land', t / 0.6); st.alt = lerp(st.alt, groundAlt(), Math.min(1, dt * 8)); }
      else { pingpong('land', 'dazed', t, 6); st.alt = groundAlt(); }
      st.fade = Math.max(0, Math.min(1, st.timer / 1.2));
      if (Math.random() < 0.3) G.BFX.feathers(st.x + R(-60, 60), st.z, st.alt + 60, 1, R(-1, 1), 0.5);
      if (st.timer <= 0) { st.mode = 'dead'; G.Game.win(); }
    } else if (st.mode === 'fight') {
      if (st.act) act(dt, player);
      else hover(dt, player);
    }
    // 맞는 범위: 떠 있으면 몸통(다리 아래는 빼고), 앉아 있으면 바닥부터
    const low = st.act && st.act.kind === 'dive' && (st.act.phase === 'stun' || st.act.phase === 'up');
    Object.assign(st.target, {
      x: st.x, z: st.z, h: low ? 0 : Math.max(0, st.alt + def.hit.legs),
      w: low ? def.hit.wLand : def.hit.w, active: st.mode === 'fight',
    });
    updateFeathers(dt, player);
    G.BFX.update(dt);
    // 바람에 날리는 깃털 (배경)
    if (def.theme.feathers && Math.random() < dt * 1.6) {
      G.BFX.feathers(-60, R(0, S().DEPTH), R(80, 300), 1, 1, R(1.2, 2.2), true);
    }
  }

  // 쉬는 중: 플레이어 옆 위쪽에 떠서 날갯짓 (점프하면 닿는 높이)
  function hover(dt, player) {
    flap();
    const W = G.CFG.ARENA_W, side = Math.sign(st.x - player.x) || 1;
    const tx = Math.max(90, Math.min(W - 90, player.x + side * def.keep));
    const tz = Math.max(def.zMin, Math.min(S().DEPTH, player.z));
    st.x += Math.max(-1, Math.min(1, (tx - st.x) / 60)) * def.speed * dt;
    st.z += Math.max(-1, Math.min(1, (tz - st.z) / 30)) * def.speed * 0.5 * dt;
    st.alt = lerp(st.alt, def.hover + Math.sin(st.time * 2.4) * 8, Math.min(1, dt * 3));
    if (Math.abs(player.x - st.x) > 20) st.face = Math.sign(player.x - st.x);
    if (raging() && Math.random() < dt * 8) G.BFX.dust(st.x + R(-40, 40), st.z, 1, 0.3, '220, 80, 50');
    st.timer -= dt;
    if (st.timer <= 0 && !player.dead) choose(player);
  }

  function choose(player) {
    const near = Math.abs(player.x - st.x) < def.patterns.rake.near && Math.abs(player.z - st.z) < 60 && player.h < 60;
    let kind;
    if (near && st.last !== 'rake') kind = 'rake';
    else kind = st.last === 'feathers' || Math.random() < 0.6 ? 'dive' : 'feathers';
    st.last = kind; st.at = 0;
    if (kind === 'rake') startRake(player);
    else if (kind === 'feathers') startFeathers(player);
    else startDive(player, 0);
  }
  function end(rest) { st.act = null; st.timer = rest; st.at = 0; }

  // ---------- 급강하 ----------
  function startDive(player, bounces) {
    const p = params('dive');
    st.act = { kind: 'dive', phase: 'aim', t: 0, p, bounces, hit: false,
               mx: player.x, mz: player.z, alt0: st.alt, short: bounces > 0 };
  }
  function trackMark(A, player) {
    const W = G.CFG.ARENA_W;
    A.mx = Math.max(60, Math.min(W - 60, player.x)); A.mz = Math.max(4, Math.min(S().DEPTH - 2, player.z));
  }
  function diveAct(dt, player, A, p) {
    if (A.phase === 'aim') {
      const T = A.short ? p.bounceTelegraph : p.telegraph, u = A.t / T;
      if (u < p.track && !player.dead) trackMark(A, player);
      seg('dive', 'fold', Math.min(1, u * 1.3));                       // 날개를 접으며 노려봄
      st.alt = lerp(A.alt0, def.hover + p.rise, ease(u));
      st.x += (st.x < A.mx ? -1 : 1) * 30 * dt;                          // 살짝 물러서며 높이 오름
      if (Math.abs(A.mx - st.x) > 10) st.face = Math.sign(A.mx - st.x);
      if (u >= 1) {
        A.phase = 'swoop'; A.t = 0; A.x0 = st.x; A.z0 = st.z; A.a0 = st.alt;
        G.Sound.play('swing3', { rate: 0.55, vol: 0.9 });
        if (!A.short) G.Sound.play(def.roar || 'roar', { vol: 0.5 });
      }
    } else if (A.phase === 'swoop') {
      const u = Math.min(1, A.t / p.swoop), e = u * u;                   // 점점 빨라지며 내리꽂힘
      st.x = lerp(A.x0, A.mx, e); st.z = lerp(A.z0, A.mz, e); st.alt = lerp(A.a0, 0, e);
      pingpong('dive', 'pose', A.t, 14);
      if (u >= 1) impact(A, p, player);
    } else if (A.phase === 'bounce') {                                  // 2단계: 바로 다시 떠오름
      const u = A.t / 0.4;
      seg('dive', 'fold', 1 - u * 0.5);
      st.alt = lerp(0, def.hover * 0.8, ease(u));
      if (u >= 1) { startDive(player, A.bounces + 1); st.act.alt0 = st.alt; }
    } else if (A.phase === 'stun') {                                    // 땅에 박혀 지침 (공격 기회)
      st.alt = groundAlt();
      if (A.t < 0.2) seg('land', 'land', 0.75 + A.t / 0.2 * 0.25);
      else pingpong('land', 'dazed', A.t, 6);
      if (A.t >= A.stun) { A.phase = 'up'; A.t = 0; G.Sound.play('swing3', { rate: 0.6, vol: 0.6 }); }
    } else if (A.phase === 'up') {                                      // 날아오름
      seg('land', 'takeoff', A.t / p.takeoff);
      st.alt = groundAlt();
      if (A.t >= p.takeoff) end(p.rest);
    }
  }
  function impact(A, p, player) {
    G.Sound.play('smash'); G.FX.shake(12, 0.35); G.FX.hitstop(0.05);
    G.BFX.flash(A.mx, A.mz, 10, 110, '255, 245, 220', 0.2);
    G.BFX.dust(A.mx, A.mz, 12, 1.4, def.theme.dust);
    G.BFX.feathers(A.mx, A.mz, 30, 8, null, 1);
    // 플레이어: 원 안에 있으면 맞음 (기둥 위에 있어도 위에서 덮치니까 맞음)
    const r = p.radius;
    const ex = (player.x - A.mx) / r, ez = (player.z - A.mz) / (r * 0.5);
    if (!player.dead && ex * ex + ez * ez < 1) G.Combat.hurtPlayer(player, p.dmg, A.mx, A.mz - 1, { stun: p.stunPlayer });
    // 바위 기둥 위로 떨어짐 → 부서지고 오래 지침
    let rock = null;
    for (const q of S().data.pillars) {
      if (!q.breakable) continue;
      const qx = (A.mx - q.x) / (q.rx + 24), qz = (A.mz - q.z) / (q.rz + 16);
      if (qx * qx + qz * qz < 1) { rock = q; break; }
    }
    if (rock) {
      G.BFX.debris(rock.x, rock.z, 26, 1.3); G.BFX.dust(rock.x, rock.z, 10, 1.6, def.theme.dust);
      S().breakPillar(rock);
      G.FX.text(rock.x, S().screenY(rock.z, (rock.h || 100) + 30), '쾅!', '#d8e8ff');
      G.FX.shake(16, 0.4);
    } else G.BFX.debris(A.mx, A.mz, 10, 0.8);
    if (!rock && A.bounces < (p.bounce || 0)) { A.phase = 'bounce'; A.t = 0; return; }
    A.phase = 'stun'; A.t = 0; A.stun = rock ? p.stunRock : p.stun; st.stars = A.stun + 0.3;
  }

  // ---------- 깃털 비 ----------
  function startFeathers(player) {
    const p = params('feathers'), W = G.CFG.ARENA_W, D = S().DEPTH;
    const marks = [{ x: player.x, z: player.z }];
    for (let i = 1, tries = 0; i < p.count && tries < 200; tries++) {
      const m = { x: Math.max(40, Math.min(W - 40, player.x + R(-p.spread, p.spread))), z: R(6, D - 4) };
      if (marks.every(o => Math.hypot(o.x - m.x, (o.z - m.z) * 2) > p.radius * 1.5)) { marks.push(m); i++; }
    }
    st.act = { kind: 'feathers', phase: 'rise', t: 0, p, marks, alt0: st.alt, thrown: false };
  }
  function feathersAct(dt, player, A, p) {
    if (Math.abs(player.x - st.x) > 20) st.face = Math.sign(player.x - st.x);
    if (A.phase === 'rise') {
      flap(def.clips.fly.fps * 1.5);
      st.alt = lerp(A.alt0, def.hover + p.rise, ease(A.t / 0.35));
      if (A.t >= 0.35) { A.phase = 'wind'; A.t = 0; G.Sound.play(def.roar || 'roar', { vol: 0.45, rate: 1.15 }); }
    } else if (A.phase === 'wind') {                                    // 날개를 치켜들고 멈춤 (예고)
      seg('fly', 'up', 0.5 + 0.5 * Math.sin(A.t * 10));
      if (A.t >= p.telegraph) { A.phase = 'throw'; A.t = 0; G.Sound.play('swing3', { rate: 0.7 }); }
    } else if (A.phase === 'throw') {                                   // 날개를 내리침 → 깃털 발사
      const u = A.t / 0.3;
      seg('fly', 'down', u);
      if (!A.thrown && u >= 0.35) {
        A.thrown = true;
        A.marks.forEach((m, i) => st.feathers.push({ x0: st.x + st.face * 40, z0: st.z, h0: st.alt + 120, x: m.x, z: m.z,
                                                     t: -i * p.stagger, T: p.flight, r: p.radius, dmg: p.dmg, done: false }));
      }
      if (u >= 1) { A.phase = 'after'; A.t = 0; }
    } else {
      flap();
      if (A.t >= 0.3 + A.marks.length * p.stagger) end(p.rest);
    }
  }
  // 날아가는 깃털: 쏜 곳에서 원까지 날아가 꽂힘 → 원 안에 있으면 맞음
  function updateFeathers(dt, player) {
    for (const f of st.feathers) {
      f.t += dt;
      if (!f.done && f.t >= f.T) {
        f.done = true;
        G.BFX.dust(f.x, f.z, 3, 0.6, def.theme.dust);
        G.Sound.play('hit', { rate: 1.6, vol: 0.35 });
        const ex = (player.x - f.x) / f.r, ez = (player.z - f.z) / (f.r * 0.5);
        if (!player.dead && player.h < 90 && ex * ex + ez * ez < 1) G.Combat.hurtPlayer(player, f.dmg, f.x, f.z - 1);
      }
    }
    st.feathers = st.feathers.filter(f => f.t < f.T + 1.2);
  }

  // ---------- 할퀴기 ----------
  function startRake(player) {
    const p = params('rake');
    st.face = Math.sign(player.x - st.x) || st.face;
    st.act = { kind: 'rake', t: 0, p, hit: false, x0: st.x, z0: st.z, a0: st.alt,
               tx: player.x - st.face * p.stand, tz: Math.max(def.zMin, player.z) };
  }
  function rakeAct(dt, player, A, p) {
    const W = p.windup, K = p.strike, H = p.hold, U = p.rise;
    if (A.t < W) {                                                     // 낮게 내려오며 날개를 폄 (예고)
      const u = ease(A.t / W);
      st.x = lerp(A.x0, Math.max(60, Math.min(G.CFG.ARENA_W - 60, A.tx)), u); st.z = lerp(A.z0, A.tz, u); st.alt = lerp(A.a0, p.alt, u);
      seg('dive', 'strike', A.t / W * 0.3);
    } else if (A.t < W + K) {                                          // 할큄
      const u = (A.t - W) / K;
      seg('dive', 'strike', 0.3 + u * 0.7);
      st.x += st.face * 160 * dt;
      if (!A.hit && u >= 0.3) {
        A.hit = true;
        G.Sound.play('swing3', { rate: 0.85 }); G.FX.shake(5, 0.12);
        const dx = (player.x - st.x) * st.face;
        if (dx > -20 && dx < p.range && Math.abs(player.z - st.z) < 50 && player.h < st.alt + 140) G.Combat.hurtPlayer(player, p.dmg, st.x, st.z);
      }
    } else if (A.t < W + K + H) {                                      // 빈틈 (맞음)
      seg('dive', 'hold', (A.t - W - K) / H);
    } else {                                                           // 다시 떠오름
      const u = (A.t - W - K - H) / U;
      seg('dive', 'rise', u);
      st.alt = lerp(p.alt, def.hover, ease(u));
      if (u >= 1) end(p.rest);
    }
  }

  function act(dt, player) {
    const A = st.act, p = A.p;
    A.t += dt;
    if (A.kind === 'dive') diveAct(dt, player, A, p);
    else if (A.kind === 'feathers') feathersAct(dt, player, A, p);
    else if (A.kind === 'rake') rakeAct(dt, player, A, p);
  }

  // 기술을 쓰는 중에는 공격이 막힘. 쉬는 중(떠 있음)·땅에 박혀 지친 중·할퀸 뒤 빈틈에만 맞음
  function guarding() {
    const A = st.act;
    if (!A) return false;
    if (A.kind === 'dive') return !(A.phase === 'stun');
    if (A.kind === 'rake') return A.t < A.p.windup + A.p.strike;
    return true;
  }
  function hurt(dmg) {
    if (st.mode !== 'fight') return;
    if (guarding()) return false;
    const wasRage = raging();
    st.hp = Math.max(0, st.hp - dmg);
    G.BFX.feathers(st.x, st.z, st.alt + 80, 3, null, 0.8);
    if (!wasRage && raging() && st.hp > 0) {
      G.Sound.play(def.roar || 'roar', { rate: 1.1 }); G.FX.shake(16, 0.6);
      G.BFX.screenFlash('255, 60, 30', 0.35);
      G.FX.text(st.x, S().screenY(st.z, st.alt + 220), '광폭화!', '#ff5a3a');
      if (st.act && st.act.kind === 'dive' && st.act.phase === 'stun') st.act.t = st.act.stun;   // 바로 날아오름
    }
    st.flash = 0.08;
    if (!st.act) st.timer = Math.min(st.timer, def.counter || 0.3);   // 떠 있을 때 맞으면 곧바로 반격
    updateUI();
    if (st.hp <= 0) {
      st.mode = 'dying'; st.timer = 2.6; st.act = null; st.marks = [];
      G.Sound.play(def.roar || 'roar', { rate: 0.85 });
      G.FX.shake(12, 0.5);
    }
  }

  // ---------- 그리기 ----------
  function drawBack() {}
  function warnCircle(ctx, x, z, r, k, t) {
    const y = S().floorY(z), flash = k > 0.8 ? 0.5 + 0.5 * Math.sin(st.time * 50) : 0;
    ctx.fillStyle = `rgba(200, 30, 20, ${0.14 + 0.12 * k + 0.18 * flash})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255, 80, 50, ${0.25 + 0.3 * flash})`;
    ctx.beginPath(); ctx.ellipse(x, y, r * k, r * 0.5 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255, 120, 90, ${0.6 + 0.4 * flash})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // 바닥 위 예고 (급강하 원, 깃털 원, 할퀴기 반원) + 그림자
  function drawFront(ctx) {
    if (!def) return;
    const F = S().floorY, A = st.act;
    ctx.save();
    if (A && A.kind === 'dive' && (A.phase === 'aim' || A.phase === 'swoop')) {
      const T = A.short ? A.p.bounceTelegraph : A.p.telegraph;
      warnCircle(ctx, A.mx, A.mz, A.p.radius, A.phase === 'aim' ? Math.min(1, A.t / T) : 1);
    }
    if (A && A.kind === 'feathers' && (A.phase === 'wind' || A.phase === 'rise')) {
      const k = A.phase === 'wind' ? Math.min(1, A.t / A.p.telegraph) : 0;
      A.marks.forEach(m => warnCircle(ctx, m.x, m.z, A.p.radius, k));
    }
    for (const f of st.feathers) if (!f.done) warnCircle(ctx, f.x, f.z, f.r, Math.max(0, Math.min(1, f.t / f.T)));
    if (A && A.kind === 'rake' && A.t < A.p.windup) {
      const k = A.t / A.p.windup, y = F(st.z), r = A.p.range;
      ctx.fillStyle = `rgba(220, 40, 30, ${0.15 + 0.2 * k})`;
      ctx.beginPath(); ctx.ellipse(st.x, y, r, 46, 0, st.face > 0 ? -Math.PI / 2 : Math.PI / 2, st.face > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 그림자: 높이 뜰수록 작고 옅게
    const hk = Math.max(0, Math.min(1, st.alt / 260));
    G.Render.shadow(ctx, st.x, F(st.z) + 2, def.hit.w * (0.75 - 0.35 * hk), (0.38 - 0.2 * hk) * st.fade);
  }
  function drawBody(ctx) {
    const C = def.clips[st.clip], f = Math.max(0, Math.min(C.count - 1, st.frame));
    const im = G.Render.getImg(C.sheets[Math.floor(f / 16)]);
    if (!im) return;
    const M = def.cell, k = f % 16, sx = (k % 4) * M.fw, sy = Math.floor(k / 4) * M.fh, s = def.scale;
    const y = S().floorY(st.z) - st.alt;
    ctx.save();
    ctx.globalAlpha = st.fade;
    ctx.translate(st.x, y); ctx.scale(st.face < 0 ? -1 : 1, 1);
    const draw = () => ctx.drawImage(im, sx, sy, M.fw, M.fh, -M.cx * s, -M.cy * s, M.fw * s, M.fh * s);
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
  // 날아가는 깃털 그리기 (쏜 곳 → 원, 위로 살짝 휘어서) / 꽂힌 깃털은 서서히 사라짐
  function drawFeather(ctx, x, y, ang, len, al) {
    ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#e9e4da'; ctx.strokeStyle = '#3a2f26'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-len, 0); ctx.quadraticCurveTo(-len * 0.2, -len * 0.22, len * 0.55, 0); ctx.quadraticCurveTo(-len * 0.2, len * 0.22, -len, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a3a2c';
    ctx.beginPath(); ctx.moveTo(-len * 0.1, -len * 0.08); ctx.lineTo(len * 0.55, 0); ctx.lineTo(-len * 0.1, len * 0.08); ctx.fill();
    ctx.strokeStyle = '#2a211a'; ctx.beginPath(); ctx.moveTo(-len * 1.05, 0); ctx.lineTo(len * 0.6, 0); ctx.stroke();
    ctx.restore();
  }
  function featherPos(f, t) {
    const u = Math.max(0, Math.min(1, t / f.T));
    return { x: lerp(f.x0, f.x, u), y: S().floorY(lerp(f.z0, f.z, u)) - (lerp(f.h0, 0, u) + Math.sin(u * Math.PI) * 40) };
  }
  function drawProjectiles(ctx) {
    for (const f of st.feathers) {
      if (f.t < 0) continue;
      if (!f.done) {
        const a = featherPos(f, f.t), b = featherPos(f, f.t + 0.02);
        drawFeather(ctx, a.x, a.y, Math.atan2(b.y - a.y, b.x - a.x), 16, 1);
      } else {
        const al = Math.max(0, 1 - (f.t - f.T) / 1.2);
        const dir = f.x > f.x0 ? 1 : -1;
        drawFeather(ctx, f.x - dir * 6, S().floorY(f.z) - 8, dir > 0 ? 1.1 : Math.PI - 1.1, 14, al);
      }
    }
  }
  function drawables() { return def ? [{ key: st.z, draw: drawBody }] : []; }
  // 기절: 머리 위에 빙글빙글 도는 별
  function drawTop(ctx) {
    if (G.BFX) G.BFX.drawTop(ctx);
    drawProjectiles(ctx);
    if (st.stars > 0 && st.mode === 'fight') {
      const hx = st.x + st.face * 30, hy = S().screenY(st.z, groundAlt() + def.starH);
      for (let i = 0; i < 4; i++) {
        const a = st.time * 4 + i * Math.PI / 2, x = hx + Math.cos(a) * 30, y = hy + Math.sin(a) * 9;
        star(ctx, x, y, 6 + 1.5 * Math.sin(a), Math.sin(a) > 0 ? 1 : 0.55);
      }
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
  function setPose() {}
  // 개발 확인용: G.Boss.force('dive') / force('feathers') / force('rake')
  function force(kind, player) {
    player = player || G.player; st.act = null; st.at = 0;
    if (kind === 'rake') startRake(player);
    else if (kind === 'feathers') startFeathers(player);
    else startDive(player, 0);
  }

  return { state: st, load, reset, update, drawBack, drawFront, drawables, drawTop, updateUI, force, setPose, get def() { return def; } };
})();
