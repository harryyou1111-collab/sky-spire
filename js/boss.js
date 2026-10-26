// =====================================================================
// boss.js — 거대 보스 엔진 (자세 그림 방식). 보스 데이터는 bosses.js
//
// 보스는 동작마다 "자세 그림" 한 장을 보여주고, 그림 사이를 부드럽게 넘깁니다.
// 코드는 그림을 옮기고(좌우 이동, 앞으로 숙이기), 좌우로 뒤집고, 숨쉬게 하고,
// 효과(예고 원, 충격, 소리 고리, 덩굴)를 더합니다.
//
// 자세 그림 위치 규칙 (bosses.js의 poses):
//   cx     : 그림 속 몸 중심(얼굴)의 가로 위치 (픽셀)
//   bottom : 그림 속 땅에 닿는 선 (손이 땅을 짚는 높이, 픽셀)
//   scale  : 자세마다 크기 보정 (그림마다 캐릭터 크기가 조금씩 다를 때)
//   hand   : (slam) 땅을 내리친 손의 위치 (픽셀)
//   glow   : (flute) 기운이 모이는 위치 (픽셀)
//
// 내려찍기: 플레이어 쪽 팔을 치켜듦(raise) → 몸을 옮기고 앞으로 숙이며 내리침(slam)
//           → 손이 박혀 있는 동안 때릴 수 있음 → 원래 자세(idle)로 돌아감
// 왼쪽을 칠 때는 그림을 좌우로 뒤집어 씀
// =====================================================================
G.Boss = (function () {
  const S = () => G.Stage;
  let def = null;

  const boss = {
    hp: 1, maxHp: 1,
    mode: 'fight',             // fight / dying / dead
    timer: 0,                  // 다음 공격까지 남은 시간
    time: 0, flash: 0, sink: 0,
    shift: 0, shiftT: 0,       // 좌우 이동 (현재, 목표)
    lunge: 0, lungeT: 0,       // 앞으로 숙인 정도 = 바닥 깊이 방향 이동 (현재, 목표)
    follow: 4,                 // 이동을 따라가는 빠르기
    cur: { key: 'idle', mirror: false }, prev: null, fade: 1, fadeDur: 0.2,
    slam: null,                // 진행 중인 내려찍기
    queue: 0,                  // 2단계 연속 내려찍기 남은 횟수
    pattern: null,             // 진행 중인 몸 전체 패턴 (flute, vines)
    marks: [], rings: [], lanes: [],
    last: null,                // 직전 패턴 (연속 방지)
    target: null,              // 때릴 수 있는 손 (Combat 대상)
  };

  // ---------- 보스 불러오기 ----------
  function load(key) { def = G.BossDefs[key]; reset(); }

  function reset() {
    Object.assign(boss, {
      hp: def.hp, maxHp: def.hp, mode: 'fight', timer: 1.5, time: 0, flash: 0, sink: 0,
      shift: 0, shiftT: 0, lunge: 0, lungeT: 0, follow: 4,
      cur: { key: 'idle', mirror: false }, prev: null, fade: 1,
      slam: null, queue: 0, pattern: null, marks: [], rings: [], lanes: [], last: null,
    });
    if (boss.target) G.Combat.removeTarget(boss.target);
    boss.target = G.Combat.addTarget({
      x: 0, z: 0, h: 0, w: def.handHit.w, height: def.handHit.h, active: false,
      onHit: (dmg) => hurtBoss(dmg),
    });
    updateUI();
  }

  // 현재 단계(체력에 따라)의 패턴 수치
  function params(kind) {
    const p = Object.assign({}, def.patterns[kind]);
    if (def.phase2 && boss.hp / boss.maxHp <= def.phase2.at) Object.assign(p, def.phase2[kind] || {});
    return p;
  }
  const phase2 = () => def.phase2 && boss.hp / boss.maxHp <= def.phase2.at;

  // ---------- 자세 전환 ----------
  function setPose(key, mirror, dur) {
    mirror = !!mirror;
    if (boss.cur.key === key && boss.cur.mirror === mirror) return;
    boss.prev = boss.cur;
    boss.cur = { key, mirror };
    boss.fadeDur = Math.max(0.001, dur == null ? 0.2 : dur);
    boss.fade = 0;
  }

  // 자세 그림 배치: 그림의 (cx, bottom)을 바닥 위 기준점에 맞춤
  function scaleOf(key) {
    const P = def.poses[key];
    return def.poseScale * (P.scale || 1) * (1 + boss.lunge * (def.lungeGrow || 0));
  }
  function anchor() {
    return { x: def.baseX + boss.shift, y: S().floorY(def.baseZ + boss.lunge) + boss.sink };
  }
  // 그림 속 점(픽셀) → 화면 위치
  function posePoint(key, mirror, px, py) {
    const P = def.poses[key], s = scaleOf(key), a = anchor();
    return { x: a.x + (mirror ? -1 : 1) * (px - P.cx) * s, y: a.y + (py - P.bottom) * s };
  }

  // ---------- 매 프레임 ----------
  function update(dt, player) {
    boss.time += dt;
    boss.flash = Math.max(0, boss.flash - dt);
    boss.fade = Math.min(1, boss.fade + dt / boss.fadeDur);
    if (boss.fade >= 1) boss.prev = null;

    if (boss.mode === 'dying') {
      boss.sink += dt * 60;
      boss.timer -= dt;
      if (Math.random() < 0.3) G.FX.shake(4, 0.1);
      if (boss.timer <= 0) { boss.mode = 'dead'; G.Game.win(); }
    }

    if (boss.mode === 'fight') {
      if (boss.slam) updateSlam(dt, player);
      else if (boss.pattern) updatePattern(dt, player);
      else {
        // 쉬는 중: 숨쉬며 천천히 좌우로 흔들림
        boss.shiftT = Math.sin(boss.time * 0.5) * 8;
        boss.lungeT = 0;
        boss.follow = 2.5;
        setPose('idle', false, 0.3);
        if (boss.timer > 50) boss.timer = params(boss.last || 'slam').rest;
        boss.timer -= dt;
        if (boss.queue > 0 && boss.timer > 0.15) boss.timer = 0.15;
        if (boss.timer <= 0 && !player.dead) chooseAttack(player);
      }
    }

    const k = Math.min(1, dt * boss.follow);
    boss.shift += (boss.shiftT - boss.shift) * k;
    boss.lunge += (boss.lungeT - boss.lunge) * k;

    updateRings(dt, player);
    updateLanes(dt, player);
    boss.marks.forEach(m => { if (m.kind !== 'warn') m.k += dt; });
    boss.marks = boss.marks.filter(m => m.kind === 'warn' || m.k < m.life);
  }

  // 패턴 고르기: 비중(weight)대로 무작위, 직전 패턴은 제외. 연속 내려찍기가 남아 있으면 그것부터
  function chooseAttack(player) {
    let kind;
    if (boss.queue > 0) { boss.queue--; kind = 'slam'; }
    else {
      const kinds = Object.keys(def.patterns).filter(k => k !== boss.last);
      const total = kinds.reduce((n, k) => n + (def.patterns[k].weight || 1), 0);
      let r = Math.random() * total; kind = kinds[0];
      for (const k of kinds) { r -= def.patterns[k].weight || 1; if (r <= 0) { kind = k; break; } }
      if (kind === 'slam' && params('slam').double) boss.queue = 1;   // 2단계: 반대쪽으로 한 번 더
    }
    boss.last = kind;
    boss.timer = 999;   // 패턴이 끝나면 다시 설정
    if (kind === 'flute') startFlute();
    else if (kind === 'vines') startVines();
    else startSlam(player);
  }

  // ---------- 내려찍기 ----------
  // 플레이어 위치를 보고 어느 쪽 팔로, 몸을 얼마나 옮겨서, 얼마나 앞으로 숙여 칠지 계산
  function aimSlam(slam, player) {
    const P = def.poses.slam, D = G.CFG.DEPTH;
    const z = Math.max(def.baseZ, Math.min(D - 8, player.z));
    const lunge = z - def.baseZ;
    const s = def.poseScale * (P.scale || 1) * (1 + lunge * (def.lungeGrow || 0));
    const handDx = (P.hand[0] - P.cx) * s * slam.side;            // 몸 중심에서 손까지 (좌우 반전 포함)
    let shift = player.x - def.baseX - handDx;
    shift = Math.max(-def.maxShift, Math.min(def.maxShift, shift));
    slam.aim = { x: def.baseX + shift + handDx, z, shift, lunge };
  }

  function startSlam(player) {
    const p = params('slam');
    // 플레이어가 보스 중심 오른쪽이면 그림 그대로(오른팔), 왼쪽이면 뒤집어서
    let side = player.x >= def.baseX + boss.shift ? 1 : -1;
    if (boss.queue === 0 && boss.slamSide && params('slam').double) side = -boss.slamSide;   // 연속 공격은 반대쪽 손
    boss.slamSide = side;
    const slam = { t: 0, phase: 'raise', p, side, mirror: side < 0 };
    aimSlam(slam, player);
    slam.mark = { x: slam.aim.x, z: slam.aim.z, r: p.radius, kind: 'warn', k: 0 };
    boss.marks.push(slam.mark);
    boss.slam = slam;
    setPose('raise', slam.mirror, 0.18);
  }

  function updateSlam(dt, player) {
    const s = boss.slam, p = s.p;
    s.t += dt;
    if (s.phase === 'raise') {
      const u = Math.min(1, s.t / p.telegraph);
      if (u < p.track && !player.dead) aimSlam(s, player);           // 앞부분 동안 플레이어를 따라 조준
      s.mark.x = s.aim.x; s.mark.z = s.aim.z; s.mark.k = u;
      boss.shiftT = s.aim.shift * 0.75;                                 // 치켜들며 그쪽으로 몸을 옮김
      boss.lungeT = s.aim.lunge * 0.15 - 6 * u;                         // 살짝 뒤로 젖혀 힘을 모음
      boss.follow = 4;
      if (u >= 1) { s.phase = 'drop'; s.t = 0; setPose('slam', s.mirror, p.drop * 0.8); }
    } else if (s.phase === 'drop') {
      boss.shiftT = s.aim.shift; boss.lungeT = s.aim.lunge; boss.follow = 30;   // 몸을 던지듯 빠르게
      if (s.t >= p.drop) impact(player);
    } else if (s.phase === 'stuck') {
      boss.follow = 6;
      // 손 판정 위치를 그림 속 손에 맞춤
      const P = def.poses.slam, h = posePoint('slam', s.mirror, P.hand[0], P.hand[1]);
      Object.assign(boss.target, { x: h.x, z: def.baseZ + boss.lunge, h: 0 });
      if (s.t >= p.stuck) { s.phase = 'back'; s.t = 0; boss.target.active = false; setPose('idle', false, p.recover * 0.7); }
    } else if (s.phase === 'back') {
      boss.shiftT = 0; boss.lungeT = 0; boss.follow = 3;
      if (s.t >= p.recover) { boss.slam = null; boss.timer = boss.queue > 0 ? 0.1 : p.rest; }
    }
  }

  function impact(player) {
    const s = boss.slam, p = s.p;
    s.phase = 'stuck'; s.t = 0;
    boss.shift = s.aim.shift; boss.lunge = s.aim.lunge;              // 정확히 그 자리에
    const P = def.poses.slam, h = posePoint('slam', s.mirror, P.hand[0], P.hand[1]);
    const z = def.baseZ + boss.lunge;
    boss.marks = boss.marks.filter(m => m !== s.mark);
    boss.marks.push({ x: h.x, z, r: p.radius, kind: 'crack', k: 0, life: p.stuck + 0.4 });
    Object.assign(boss.target, { x: h.x, z, h: 0, active: true });
    G.FX.shake(10, 0.28);
    G.FX.ring(h.x, z, p.radius);
    G.FX.spark(h.x, S().floorY(z) - 6, 1, 1.2); G.FX.spark(h.x, S().floorY(z) - 6, -1, 1.2);
    const dx = (player.x - h.x) / (p.radius + 10), dz = (player.z - z) / (p.radius * 0.55 + 8);
    if (dx * dx + dz * dz < 1 && player.h < 60) G.Combat.hurtPlayer(player, p.dmg, h.x, z);
  }

  // ---------- 피리 충격파 ----------
  function startFlute() {
    boss.pattern = { kind: 'flute', t: 0, p: params('flute'), fired: 0 };
    boss.shiftT = 0; boss.lungeT = -4; boss.follow = 3;
    setPose('flute', false, 0.25);
  }

  // ---------- 가시덩굴 ----------
  function startVines() {
    const p = params('vines');
    const ids = [...Array(p.lanes).keys()].sort(() => Math.random() - 0.5).slice(0, p.hitLanes);
    const D = G.CFG.DEPTH, w = D / p.lanes;
    boss.lanes = ids.map(i => ({ z0: i * w, z1: (i + 1) * w, t: 0, p, state: 'warn', hit: false, seed: Math.random() * 1000 }));
    boss.pattern = { kind: 'vines', t: 0, p, pressed: false };
    boss.shiftT = 0; boss.lungeT = 4; boss.follow = 3;
    setPose('press', false, 0.25);                                     // 웅크려 힘을 모음
  }

  function updatePattern(dt, player) {
    const P = boss.pattern, p = P.p;
    P.t += dt;
    if (P.kind === 'flute') {
      if (P.t > p.telegraph) {
        const k = Math.floor((P.t - p.telegraph) / p.gap);
        while (P.fired <= k && P.fired < p.rings) {
          boss.rings.push({ r: 30, p, x: def.baseX + boss.shift });
          P.fired++;
          G.FX.shake(3, 0.12);
        }
        if (P.fired >= p.rings && P.t > p.telegraph + p.gap * p.rings + 0.2) { boss.pattern = null; boss.timer = p.rest; }
      }
    } else if (P.kind === 'vines') {
      if (!P.pressed && P.t >= p.telegraph) {
        P.pressed = true;
        setPose('press_glow', false, 0.06);                            // 초록 기운이 터짐
        boss.lungeT = 10; boss.follow = 12;
        G.FX.shake(7, 0.25);
      }
      if (P.t >= p.telegraph + p.active) { boss.pattern = null; boss.timer = p.rest; }
    }
  }

  function updateRings(dt, player) {
    for (const r of boss.rings) {
      r.r += r.p.speed * dt;
      const dx = player.x - r.x, dz = (player.z + 4) * r.p.squash;
      const d = Math.hypot(dx, dz);
      if (!r.hitDone && Math.abs(d - r.r) < r.p.band && player.h < r.p.safeHeight) {
        if (G.Combat.hurtPlayer(player, r.p.dmg, r.x, -40)) r.hitDone = true;
      }
    }
    boss.rings = boss.rings.filter(r => r.r < 900);
  }

  function updateLanes(dt, player) {
    for (const L of boss.lanes) {
      L.t += dt;
      if (L.state === 'warn' && L.t >= L.p.telegraph) { L.state = 'up'; L.t = 0; }
      else if (L.state === 'up') {
        if (!L.hit && player.z >= L.z0 - 2 && player.z <= L.z1 + 2 && player.h < L.p.height) {
          if (G.Combat.hurtPlayer(player, L.p.dmg, player.x, L.z0 - 20)) L.hit = true;
        }
        if (L.t >= L.p.active) { L.state = 'down'; L.t = 0; }
      } else if (L.state === 'down' && L.t >= 0.25) L.state = 'gone';
    }
    boss.lanes = boss.lanes.filter(L => L.state !== 'gone');
  }

  function hurtBoss(dmg) {
    if (boss.mode !== 'fight') return;
    boss.hp = Math.max(0, boss.hp - dmg);
    boss.flash = 0.08;
    updateUI();
    if (boss.hp <= 0) {
      boss.mode = 'dying';
      boss.timer = 2.4;
      boss.target.active = false;
      boss.slam = null; boss.pattern = null;
      boss.marks = []; boss.rings = []; boss.lanes = [];
      setPose('idle', false, 0.3);
      G.FX.shake(14, 0.6);
    }
  }

  // ---------- 그리기 ----------
  function drawPose(ctx, pose, alpha) {
    const P = def.poses[pose.key], im = P && G.Render.getImg(P.img);
    if (!im || alpha <= 0) return;
    const s = scaleOf(pose.key), a = anchor();
    const breathe = 1 + 0.012 * Math.sin(boss.time * 2);
    ctx.save();
    ctx.globalAlpha = alpha * (boss.mode !== 'fight' ? Math.max(0, 1 - boss.sink / 220) : 1);
    ctx.translate(a.x, a.y);
    ctx.scale(pose.mirror ? -1 : 1, breathe);
    ctx.drawImage(im, -P.cx * s, -P.bottom * s, im.naturalWidth * s, im.naturalHeight * s);
    if (boss.flash > 0) {      // 맞을 때 번쩍
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(im, -P.cx * s, -P.bottom * s, im.naturalWidth * s, im.naturalHeight * s);
    }
    ctx.restore();
  }

  // 바닥보다 먼저: 보스 뒤에서 비치는 기운
  function drawBack(ctx) {
    if (!def) return;
    const a = anchor(), cy = a.y - 160;
    const g = ctx.createRadialGradient(a.x, cy, 40, a.x, cy, 340);
    g.addColorStop(0, `rgba(${def.theme.moon}, 0.10)`);
    g.addColorStop(1, `rgba(${def.theme.moon}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(a.x - 360, cy - 360, 720, 720);
  }

  // 바닥 위: 예고 원, 균열, 덩굴 예고, 소리 고리 → 보스 그림 → 때릴 수 있는 손 표시
  function drawFront(ctx) {
    if (!def) return;
    for (const m of boss.marks) drawMark(ctx, m);
    for (const L of boss.lanes) if (L.state === 'warn') drawLaneWarn(ctx, L);
    for (const r of boss.rings) drawRing(ctx, r);
    // 발밑 그림자
    const a = anchor();
    G.Render.shadow(ctx, a.x, a.y + 4, 150, 0.35);
    if (boss.prev) drawPose(ctx, boss.prev, 1 - boss.fade);
    drawPose(ctx, boss.cur, boss.prev ? boss.fade : 1);
    if (boss.pattern && boss.pattern.kind === 'flute') drawFluteGlow(ctx, boss.pattern);
    if (boss.pattern && boss.pattern.kind === 'vines' && boss.pattern.pressed) drawPressGlow(ctx, boss.pattern);
    if (boss.target && boss.target.active) {
      const t = boss.target, y = S().floorY(t.z) - 18;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 230, 150, ${0.5 + 0.4 * Math.sin(boss.time * 10)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(t.x, y, t.w * 0.75, t.w * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // 피리: 그림 속 피리 끝에 초록 기운이 모임
  function drawFluteGlow(ctx, P) {
    if (P.t >= P.p.telegraph) return;
    const g = def.poses.flute.glow, pt = posePoint('flute', false, g[0], g[1]);
    glow(ctx, pt.x, pt.y, P.t / P.p.telegraph, 30, 60);
  }
  // 땅 누르기: 양손에서 초록 빛이 번쩍
  function drawPressGlow(ctx, P) {
    const u = Math.max(0, 1 - (P.t - P.p.telegraph) / P.p.active);
    const a = anchor();
    glow(ctx, a.x, a.y - 10, u, 80, 140);
  }
  function glow(ctx, x, y, u, r0, r1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = r0 + r1 * u;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, `rgba(170, 255, 140, ${0.5 * u})`);
    g.addColorStop(1, 'rgba(170, 255, 140, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 소리 고리: 바닥 위에 납작한 타원으로 퍼짐
  function drawRing(ctx, r) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = Math.max(0, 1 - r.r / 900), y = S().floorY(-4);
    ctx.strokeStyle = `rgba(160, 255, 150, ${0.75 * a})`;
    ctx.lineWidth = r.p.band * 1.1;
    ctx.beginPath(); ctx.ellipse(r.x, y, r.r, r.r / r.p.squash, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = `rgba(240, 255, 230, ${0.9 * a})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(r.x, y, r.r, r.r / r.p.squash, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  // 덩굴 예고: 줄 전체가 어둡게 꿈틀거림
  function drawLaneWarn(ctx, L) {
    const u = Math.min(1, L.t / L.p.telegraph), y0 = S().floorY(L.z0), y1 = S().floorY(L.z1);
    ctx.save();
    ctx.fillStyle = `rgba(60, 160, 60, ${0.12 + 0.2 * u + 0.08 * Math.sin(L.t * 20)})`;
    ctx.fillRect(-50, y0, G.CFG.ARENA_W + 100, y1 - y0);
    ctx.strokeStyle = 'rgba(140, 220, 110, .8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(-50, y0, G.CFG.ARENA_W + 100, y1 - y0);
    ctx.restore();
  }

  // 솟은 덩굴: 깊이 정렬에 끼워서 그림 (앞뒤 캐릭터와 올바르게 겹치도록)
  function drawLaneVines(ctx, L) {
    const k = L.state === 'up' ? Math.min(1, L.t / 0.08) : Math.max(0, 1 - L.t / 0.25);
    const H = L.p.height * k;
    let seed = L.seed;
    const rnd = () => (seed = (seed * 16807 + 7) % 2147483647) / 2147483647;
    for (let z = L.z0 + 4; z < L.z1; z += 9) {
      const y = S().floorY(z);
      for (let x = -20; x < G.CFG.ARENA_W + 20; x += 18 + rnd() * 10) {
        const h = H * (0.6 + rnd() * 0.6), lean = (rnd() - 0.5) * 10;
        ctx.fillStyle = rnd() < 0.5 ? '#3f6b2c' : '#2f5422';
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + lean, y - h); ctx.lineTo(x + 5, y); ctx.fill();
        if (h > 20) { ctx.fillStyle = '#c9d98a'; ctx.beginPath(); ctx.moveTo(x + lean * 0.5 - 2, y - h * 0.5); ctx.lineTo(x + lean * 0.5 + 6, y - h * 0.55); ctx.lineTo(x + lean * 0.5, y - h * 0.45); ctx.fill(); }
      }
    }
  }
  function drawables() {
    return boss.lanes.filter(L => L.state !== 'warn').map(L => ({ key: L.z0, draw: ctx => drawLaneVines(ctx, L) }));
  }

  function drawMark(ctx, m) {
    const y = S().floorY(m.z), rx = m.r, rz = m.r * 0.55;
    if (m.kind === 'warn') {
      ctx.save();
      ctx.fillStyle = `rgba(220, 40, 30, ${0.12 + 0.18 * m.k})`;
      ctx.beginPath(); ctx.ellipse(m.x, y, rx, rz, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 60, 40, .35)';                 // 차오르는 안쪽 원 = 남은 시간
      ctx.beginPath(); ctx.ellipse(m.x, y, rx * m.k, rz * m.k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 90, 70, .9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(m.x, y, rx, rz, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else {
      const al = Math.max(0, 1 - m.k / m.life);
      ctx.save();
      ctx.strokeStyle = `rgba(20, 14, 10, ${0.7 * al})`;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 7; i++) {
        const ang = i / 7 * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(m.x + Math.cos(ang) * rx * 0.3, y + Math.sin(ang) * rz * 0.3);
        ctx.lineTo(m.x + Math.cos(ang + 0.15) * rx * 0.75, y + Math.sin(ang + 0.15) * rz * 0.75);
        ctx.lineTo(m.x + Math.cos(ang - 0.05) * rx * 1.1, y + Math.sin(ang - 0.05) * rz * 1.1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- 화면 위 이름·체력 ----------
  const bar = document.getElementById('boss-bar');
  function updateUI() {
    if (!bar || !def) return;
    bar.querySelector('.name').textContent = `${def.floor}F · ${def.name} — ${def.title}`;
    bar.querySelector('.fill').style.width = (boss.hp / boss.maxHp * 100) + '%';
  }

  // 개발 확인용: 콘솔에서 G.Boss.force('flute') 처럼 특정 패턴을 바로 실행
  function force(kind, player) {
    boss.last = kind; boss.timer = 999;
    if (kind === 'flute') startFlute(); else if (kind === 'vines') startVines(); else startSlam(player || G.player);
  }

  return { state: boss, load, reset, update, drawBack, drawFront, drawables, updateUI, force, setPose, get def() { return def; } };
})();
