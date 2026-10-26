// =====================================================================
// boss.js — 거대 보스 엔진 (동작 영상 방식). 보스 데이터는 bosses.js
//
// 보스는 AI 영상을 쪼갠 장면을 재생하고, 코드는 좌우 반전·숨쉬기와
// 효과(예고 표시, 균열, 소리 고리, 덩굴)를 더합니다.
//
// 보스는 전투장 맨 안쪽에 고정 (몸을 옮기면 허리에서 잘린 상체가 떠다니는 것처럼 보여서)
//   발밑 안개(mist)로 그림이 끝나는 허리선을 가림
//
// 내려찍기: 플레이어 쪽 팔을 치켜듦 → 땅을 내리침 → 손에서 플레이어 쪽으로 균열이 뻗음
//           → 손이 박혀 있는 동안 때릴 수 있음 → 원래 자세로. 왼쪽을 칠 때는 그림을 좌우로 뒤집어 씀
// 포효: 숨을 들이쉬며 몸이 부풂 → 포효와 함께 소리 고리가 퍼짐 (점프로 넘기)
// 가시덩굴: 두 팔을 치켜들었다가 양손으로 땅을 내리침 → 예고된 줄에서 덩굴이 솟음
//
// 동작 영상(clips): AI 영상을 장면별로 쪼개 한 장에 모은 그림(시트). 내려찍기는 영상으로 재생
//   자세에 { clip: '이름', frame: 번호 }를 적으면 영상의 한 장면을 멈춘 그림으로 씀 (idle)
//   seg: 영상 구간 [시작 장면, 끝 장면] — 게임 단계(들기/내리침/박힘/복귀) 시간에 맞춰 늘이거나 줄여 재생
// =====================================================================
G.Boss = (function () {
  const S = () => G.Stage;
  let def = null;

  const boss = {
    hp: 1, maxHp: 1,
    mode: 'fight',             // fight / dying / dead
    timer: 0,                  // 다음 공격까지 남은 시간
    time: 0, flash: 0, sink: 0,
    swell: 0, swellT: 0,       // 몸이 부푼 정도 (포효 때 숨 들이쉬기)
    cur: { key: 'idle', mirror: false }, prev: null, fade: 1, fadeDur: 0.2,
    frame: 0, idleMirror: false,   // 영상 장면 번호, 쉬는 자세 좌우 반전
    slam: null,                // 진행 중인 내려찍기
    queue: 0,                  // 2단계 연속 내려찍기 남은 횟수
    pattern: null,             // 진행 중인 몸 전체 패턴 (roar, vines)
    marks: [], rings: [], lanes: [],
    last: null,                // 직전 패턴 (연속 방지)
    target: null,              // 때릴 수 있는 손 (Combat 대상)
  };

  // ---------- 보스 불러오기 ----------
  function load(key) {
    def = G.BossDefs[key];
    // 영상 그림은 미리 불러 둠 (처음 공격 때 비어 보이지 않게)
    for (const c of Object.values(def.clips || {})) c.sheets.forEach(src => G.Render.getImg(src));
    reset();
  }

  function reset() {
    Object.assign(boss, {
      hp: def.hp, maxHp: def.hp, mode: 'fight', timer: 1.5, time: 0, flash: 0, sink: 0,
      swell: 0, swellT: 0,
      cur: { key: 'idle', mirror: false }, prev: null, fade: 1, frame: 0, idleMirror: false,
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
  function setPose(key, mirror, dur, frame) {
    mirror = !!mirror;
    if (boss.cur.key === key && boss.cur.mirror === mirror) return;
    boss.prev = boss.cur;
    boss.cur = { key, mirror, frame: frame || 0 };
    boss.fadeDur = Math.max(0.001, dur == null ? 0.2 : dur);
    boss.fade = 0;
  }

  // 자세 그림 배치: 그림의 (cx, bottom)을 바닥 위 기준점에 맞춤
  // 자세의 위치 정보: 영상 장면이면 영상(clip)의 정보를 씀
  function geo(key) {
    const P = def.poses[key];
    return P.clip ? def.clips[P.clip] : P;
  }
  function scaleOf(key) {
    const P = geo(key);
    return def.poseScale * (P.scale || 1);
  }
  function anchor() {
    return { x: def.baseX, y: S().floorY(def.baseZ) + boss.sink };
  }
  // 그림 속 점(픽셀) → 화면 위치
  function posePoint(key, mirror, px, py) {
    const P = geo(key), s = scaleOf(key), a = anchor();
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
        // 쉬는 중: 제자리에서 숨만 쉼 (몸을 옮기면 상체가 떠다니는 것처럼 보임)
        setPose('idle', boss.idleMirror, 0.3);
        if (boss.timer > 50) boss.timer = params(boss.last || 'slam').rest;
        boss.timer -= dt;
        if (boss.queue > 0 && boss.timer > 0.15) boss.timer = 0.15;
        if (boss.timer <= 0 && !player.dead) chooseAttack(player);
      }
    }

    boss.swell += ((boss.swellT || 0) - boss.swell) * Math.min(1, dt * 6);

    updateRings(dt, player);
    updateLanes(dt, player);
    // 예고 표시(warn, line)는 패턴이 직접 지우고, 나머지(균열 자국)는 시간이 지나면 사라짐
    const keep = m => m.kind === 'warn' || m.kind === 'line';
    boss.marks.forEach(m => { if (!keep(m)) m.k += dt; });
    boss.marks = boss.marks.filter(m => keep(m) || m.k < m.life);
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
    if (kind === 'roar') startRoar();
    else if (kind === 'vines') startVines();
    else startSlam(player);
  }

  // ---------- 내려찍기 ----------
  // 보스는 제자리. 플레이어 쪽 팔을 치켜들었다가 땅을 내리치면,
  // 손에서 플레이어 쪽으로 땅이 갈라지는 균열이 뻗어 나감 (예고: 바닥의 붉은 줄)
  // 예고 앞부분(track) 동안은 줄이 플레이어를 따라감 → 마지막에 옆으로 피하기
  function handPoint(mirror) {
    const P = def.clips.slam, h = posePoint('slamclip', mirror, P.hand[0], P.hand[1]);
    return { x: h.x, z: def.baseZ };
  }
  function aimSlam(slam, player) {
    const p = slam.p, H = handPoint(slam.mirror);
    let dx = player.x - H.x, dz = Math.max(20, player.z - H.z);       // 항상 앞쪽(플레이어 쪽)으로
    const d = Math.hypot(dx, dz);
    dx /= d; dz /= d;
    // 전투장 앞쪽 끝이나 옆 끝까지
    let L = p.reach;
    if (dz > 0) L = Math.min(L, (G.CFG.DEPTH + 6 - H.z) / dz);
    if (dx > 0) L = Math.min(L, (G.CFG.ARENA_W - H.x) / dx); else if (dx < 0) L = Math.min(L, -H.x / dx);
    slam.line = { x0: H.x, z0: H.z, x1: H.x + dx * L, z1: H.z + dz * L, w: p.width };
  }

  function startSlam(player) {
    const p = params('slam');
    // 플레이어가 보스 중심 오른쪽이면 그림 그대로(오른팔), 왼쪽이면 뒤집어서
    let side = player.x >= def.baseX ? 1 : -1;
    if (boss.queue === 0 && boss.slamSide && params('slam').double) side = -boss.slamSide;   // 연속 공격은 반대쪽 손
    boss.slamSide = side;
    const slam = { t: 0, phase: 'raise', p, side, mirror: side < 0 };
    aimSlam(slam, player);
    slam.mark = Object.assign({ kind: 'line', k: 0 }, slam.line);
    boss.marks.push(slam.mark);
    boss.slam = slam;
    setPose('slamclip', slam.mirror, 0.15, def.clips.slam.seg.raise[0]);
  }

  // 영상 구간 재생: u(0~1) 만큼 진행한 장면을 보여줌
  function playSeg(name, u, clip) {
    const [a, b] = def.clips[clip || 'slam'].seg[name];
    boss.cur.frame = Math.round(a + (b - a) * Math.max(0, Math.min(1, u)));
  }

  function updateSlam(dt, player) {
    const s = boss.slam, p = s.p;
    s.t += dt;
    if (s.phase === 'raise') {
      const u = Math.min(1, s.t / p.telegraph);
      if (u < p.track && !player.dead) aimSlam(s, player);           // 앞부분 동안 플레이어를 따라 조준
      Object.assign(s.mark, s.line, { k: u });
      playSeg('raise', u);
      if (u >= 1) { s.phase = 'drop'; s.t = 0; }
    } else if (s.phase === 'drop') {
      playSeg('drop', s.t / p.drop);
      if (s.t >= p.drop) impact(player);
    } else if (s.phase === 'stuck') {
      playSeg('stuck', s.t / p.stuck);
      if (s.t >= p.stuck) { s.phase = 'back'; s.t = 0; boss.target.active = false; }
    } else if (s.phase === 'back') {
      playSeg('recover', s.t / p.recover);
      if (s.t >= p.recover) {
        // 영상 끝 장면 = 쉬는 자세. 같은 방향의 쉬는 그림으로 이어서 끊김 없음
        boss.idleMirror = s.mirror;
        setPose('idle', s.mirror, 0.15);
        boss.slam = null; boss.timer = boss.queue > 0 ? 0.1 : p.rest;
      }
    }
  }

  // 점 (px, pz)에서 선분까지 거리
  function segDist(px, pz, L) {
    const vx = L.x1 - L.x0, vz = L.z1 - L.z0, len2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((px - L.x0) * vx + (pz - L.z0) * vz) / len2));
    return { d: Math.hypot(px - (L.x0 + vx * t), pz - (L.z0 + vz * t)), t };
  }

  function impact(player) {
    const s = boss.slam, p = s.p, L = s.line;
    s.phase = 'stuck'; s.t = 0;
    playSeg('drop', 1);
    boss.marks = boss.marks.filter(m => m !== s.mark);
    // 갈라진 땅: 들쭉날쭉한 선 (미리 모양을 정해 둠)
    const pts = [], n = 14;
    for (let i = 0; i <= n; i++) pts.push((Math.random() - 0.5) * (i === 0 || i === n ? 0 : p.width * 0.5));
    boss.marks.push(Object.assign({ kind: 'fissure', k: 0, life: p.stuck + 0.5, pts }, L));
    Object.assign(boss.target, { x: L.x0, z: L.z0, h: 0, active: true });   // 박힌 손 = 때릴 기회
    G.FX.shake(11, 0.3);
    G.FX.ring(L.x0, L.z0, p.radius);
    for (const u of [0, 0.35, 0.7]) {
      const x = L.x0 + (L.x1 - L.x0) * u, z = L.z0 + (L.z1 - L.z0) * u;
      G.FX.spark(x, S().floorY(z) - 4, 1, 0.8); G.FX.spark(x, S().floorY(z) - 4, -1, 0.8);
    }
    const hit = segDist(player.x, player.z, L);
    const nearHand = Math.hypot(player.x - L.x0, (player.z - L.z0) * 1.8) < p.radius;
    if ((hit.d < p.width / 2 + G.CFG.player.halfWidth || nearHand) && player.h < 40) {
      G.Combat.hurtPlayer(player, p.dmg, player.x - (L.x1 - L.x0) * 0.01, player.z - (L.z1 - L.z0) * 0.01);
    }
  }

  // ---------- 공포의 포효 ----------
  // 고개를 들고 포효 → 소리 고리가 보스 쪽에서 퍼져 나옴 → 점프로 넘기
  // (포효 영상이 생기기 전까지는 쉬는 자세에서 몸을 부풀리고 눈·입에 빛을 넣어 표현)
  function startRoar() {
    boss.pattern = { kind: 'roar', t: 0, p: params('roar'), fired: 0, stage: 'inhale' };
    boss.idleMirror = false;
    setPose('idle', false, 0.15);
  }

  // ---------- 가시덩굴 ----------
  function startVines() {
    const p = params('vines');
    const ids = [...Array(p.lanes).keys()].sort(() => Math.random() - 0.5).slice(0, p.hitLanes);
    const D = G.CFG.DEPTH, w = D / p.lanes;
    boss.lanes = ids.map(i => ({ z0: i * w, z1: (i + 1) * w, t: 0, p, state: 'warn', hit: false, seed: Math.random() * 1000 }));
    boss.pattern = { kind: 'vines', t: 0, p, pressed: false };
    boss.idleMirror = false;
    setPose('vinesclip', false, 0.12, def.clips.vines.seg.raise[0]);   // 두 팔을 치켜듦
  }

  function updatePattern(dt, player) {
    const P = boss.pattern, p = P.p;
    P.t += dt;
    if (P.kind === 'roar') {
      if (P.stage === 'inhale') {
        boss.swellT = 0.6 * Math.min(1, P.t / p.telegraph);            // 숨을 크게 들이쉬며 몸이 부풂
        if (P.t >= p.telegraph) { P.stage = 'roar'; G.FX.shake(6, 0.3); }
      }
      if (P.stage === 'roar') {
        boss.swellT = 1;
        const k = Math.floor((P.t - p.telegraph) / p.gap);
        while (P.fired <= k && P.fired < p.rings) {
          boss.rings.push({ r: 30, p, x: def.baseX });
          P.fired++; P.pulse = 0.3;
          G.FX.shake(5, 0.15);
        }
        if (P.fired >= p.rings && P.t > p.telegraph + p.gap * p.rings + 0.2) {
          boss.swellT = 0; boss.pattern = null; boss.timer = p.rest;
        }
      }
      P.pulse = Math.max(0, (P.pulse || 0) - dt);
    } else if (P.kind === 'vines') {
      // 영상: 두 팔을 치켜듦(raise, 예고 동안) → 양손으로 내리침(drop, 덩굴이 솟는 순간에 닿게) → 웅크린 채 버팀(crouch)
      const up = p.telegraph - p.drop;
      if (P.t < up) playSeg('raise', P.t / up, 'vines');
      else if (P.t < p.telegraph) playSeg('drop', (P.t - up) / p.drop, 'vines');
      else playSeg('crouch', (P.t - p.telegraph) / p.active, 'vines');
      if (!P.pressed && P.t >= p.telegraph) {
        P.pressed = true;
        G.FX.shake(9, 0.3);
      }
      if (P.t >= p.telegraph + p.active) {
        setPose('idle', false, 0.35);                                  // 웅크린 자세 → 쉬는 자세 (비슷한 자세라 겹쳐 넘김)
        boss.pattern = null; boss.timer = p.rest;
      }
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
      setPose('idle', boss.idleMirror, 0.3);
      G.FX.shake(14, 0.6);
    }
  }

  // ---------- 그리기 ----------
  function drawPose(ctx, pose, alpha) {
    const D = def.poses[pose.key];
    if (!D || alpha <= 0) return;
    const P = geo(pose.key), s = scaleOf(pose.key), a = anchor();
    // 그림 한 장, 또는 영상 시트에서 한 장면 잘라오기
    let im, sx = 0, sy = 0, w, h;
    if (D.clip) {
      const f = D.frame != null ? D.frame : (pose.frame || 0);
      im = G.Render.getImg(P.sheets[Math.floor(f / P.per)]);
      const k = f % P.per;
      sx = (k % P.cols) * P.fw; sy = Math.floor(k / P.cols) * P.fh; w = P.fw; h = P.fh;
    } else {
      im = G.Render.getImg(D.img);
      if (im) { w = im.naturalWidth; h = im.naturalHeight; }
    }
    if (!im) return;
    const breathe = 1 + 0.012 * Math.sin(boss.time * 2) + 0.045 * boss.swell;
    ctx.save();
    ctx.globalAlpha = alpha * (boss.mode !== 'fight' ? Math.max(0, 1 - boss.sink / 220) : 1);
    ctx.translate(a.x, a.y);
    ctx.scale(pose.mirror ? -1 : 1, breathe);
    ctx.drawImage(im, sx, sy, w, h, -P.cx * s, -P.bottom * s, w * s, h * s);
    if (boss.flash > 0) {      // 맞을 때 번쩍
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(im, sx, sy, w, h, -P.cx * s, -P.bottom * s, w * s, h * s);
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
    // 새 자세를 온전히 그리고, 앞 자세를 위에 겹쳐 서서히 지움 (둘 다 반투명이면 몸이 유령처럼 비쳐 보임)
    drawPose(ctx, boss.cur, 1);
    if (boss.prev) drawPose(ctx, boss.prev, 1 - boss.fade);
    drawMist(ctx);
    if (boss.pattern && boss.pattern.kind === 'roar') drawRoarGlow(ctx, boss.pattern);
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
  // 보스 발밑 안개: 그림이 허리에서 끝나는 선을 가려서 땅속에서 솟아 있는 것처럼 보이게
  function drawMist(ctx) {
    const y = S().floorY(def.baseZ), C = def.theme.ground, x = def.baseX, rx = def.mistWidth, ry = def.mist;
    ctx.save();
    // 보스 발밑을 감싸는 납작한 어둠 (가운데 진하고 가장자리로 흐려짐)
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
    g.addColorStop(0, hexA(C.far, 0.95));
    g.addColorStop(0.55, hexA(C.far, 0.7));
    g.addColorStop(1, hexA(C.far, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, Math.PI, 0); ctx.fill();   // 위쪽 반만 (아래는 바닥)
    ctx.restore();
    // 천천히 흐르는 옅은 안개 덩어리
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const mx = x - rx * 0.8 + ((i * 131 + boss.time * (6 + i * 2)) % (rx * 1.6));
      const r = 60 + (i % 3) * 25, cy = y - 8 - (i % 2) * 8;
      const m = ctx.createRadialGradient(mx, cy, 4, mx, cy, r);
      m.addColorStop(0, `rgba(${def.theme.moon}, 0.06)`);
      m.addColorStop(1, `rgba(${def.theme.moon}, 0)`);
      ctx.fillStyle = m;
      ctx.beginPath(); ctx.ellipse(mx, cy, r, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  // 포효: 눈과 입에 초록 빛. 숨을 들이쉴수록 밝아지고, 고리가 나갈 때마다 번쩍
  function drawRoarGlow(ctx, P) {
    const u = P.stage === 'inhale' ? P.t / P.p.telegraph : 0.7 + 1.5 * (P.pulse || 0);
    const R = def.roarGlow;
    for (const e of R.eyes) {
      const pt = posePoint('idle', false, e[0], e[1]);
      glow(ctx, pt.x, pt.y, Math.min(1, u), 5, 12);
    }
    if (P.stage === 'roar') {
      const pt = posePoint('idle', false, R.mouth[0], R.mouth[1]);
      glow(ctx, pt.x, pt.y, Math.min(1, u), 20, 50);
    }
  }
  // 땅 내리치기: 두 손에서 초록 빛이 번쩍
  function drawPressGlow(ctx, P) {
    const u = Math.max(0, 1 - (P.t - P.p.telegraph) / P.p.active);
    for (const g of def.clips.vines.glow) {
      const pt = posePoint('vinesclip', false, g[0], g[1]);
      glow(ctx, pt.x, pt.y, u, 40, 90);
    }
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

  // 바닥 위 선분 (x, z) → 화면 좌표의 네 꼭짓점 (폭 w)
  function bandPoly(m, w, len) {
    const x1 = m.x0 + (m.x1 - m.x0) * len, z1 = m.z0 + (m.z1 - m.z0) * len;
    const dx = m.x1 - m.x0, dz = m.z1 - m.z0, d = Math.hypot(dx, dz) || 1;
    const nx = -dz / d * w / 2, nz = dx / d * w / 2, F = S().floorY;
    return [[m.x0 + nx, F(m.z0 + nz)], [x1 + nx, F(z1 + nz)], [x1 - nx, F(z1 - nz)], [m.x0 - nx, F(m.z0 - nz)]];
  }
  function fillPoly(ctx, pts) {
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
  }

  function drawMark(ctx, m) {
    if (m.kind === 'line') {        // 균열 예고: 붉은 줄 + 손 쪽부터 차오르는 안쪽 줄 = 남은 시간
      ctx.save();
      ctx.fillStyle = `rgba(220, 40, 30, ${0.14 + 0.16 * m.k})`;
      fillPoly(ctx, bandPoly(m, m.w, 1));
      ctx.fillStyle = 'rgba(255, 70, 50, .35)';
      fillPoly(ctx, bandPoly(m, m.w * 0.6, m.k));
      ctx.restore();
      return;
    }
    if (m.kind === 'fissure') {     // 갈라진 땅: 손에서 빠르게 뻗어 나가고, 빛이 식으며 사라짐
      const grow = Math.min(1, m.k / 0.15), al = Math.max(0, 1 - m.k / m.life), F = S().floorY;
      const dx = m.x1 - m.x0, dz = m.z1 - m.z0, d = Math.hypot(dx, dz) || 1, nx = -dz / d, nz = dx / d;
      const n = m.pts.length - 1, last = Math.max(1, Math.round(n * grow));
      ctx.save();
      ctx.lineJoin = 'round';
      for (const [w, col] of [[9, `rgba(170, 255, 120, ${0.35 * al})`], [4, `rgba(15, 10, 6, ${0.9 * al})`]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i <= last; i++) {
          const u = i / n, o = m.pts[i];
          const x = m.x0 + dx * u + nx * o, y = F(m.z0 + dz * u + nz * o);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
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

  // 개발 확인용: 콘솔에서 G.Boss.force('roar') 처럼 특정 패턴을 바로 실행
  function force(kind, player) {
    boss.last = kind; boss.timer = 999;
    boss.slam = null; boss.pattern = null; boss.marks = boss.marks.filter(m => m.kind !== 'warn' && m.kind !== 'line');
    if (kind === 'roar') startRoar(); else if (kind === 'vines') startVines(); else startSlam(player || G.player);
  }

  return { state: boss, load, reset, update, drawBack, drawFront, drawables, updateUI, force, setPose, get def() { return def; } };
})();
