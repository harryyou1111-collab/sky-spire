// =====================================================================
// boss.js — 거대 보스 엔진 (보스 데이터는 bosses.js)
//
// 보스는 전투장 뒤 낭떠러지에서 상반신을 내밀고, 두 손으로 바닥을 짚습니다.
// 몸통·머리는 때릴 수 없고, 바닥으로 내려온 손을 때려서 체력을 깎습니다.
// 팔은 IK(rig.js)로 손 위치를 따라가므로, 손을 어디로 옮기든 자연스럽게 뻗습니다.
//
// 손 상태: rest(쉼) → raise(들고 조준) → drop(내려침) → stuck(박힘, 때릴 기회) → back(복귀)
//          ctrl(패턴이 직접 위치를 정함: 피리 들기, 땅 짚기)
// 패턴: slam(내려찍기), flute(피리 충격파), vines(가시덩굴)
// =====================================================================
G.Boss = (function () {
  const D2R = Math.PI / 180;
  const S = () => G.Stage;

  let def = null, SKELETON = null, CLIPS = null;
  const BACK_ORDER = ['torso', 'armL_up', 'armR_up', 'head'];
  const FRONT_ORDER = ['armL_low', 'armR_low'];

  const boss = {
    hp: 1, maxHp: 1,
    x: 0, y: 0,                // 골반 위치 (화면 좌표, 바닥선 아래에 숨겨짐)
    mode: 'fight',             // fight / dying / dead
    timer: 0,                  // 다음 공격까지 남은 시간
    time: 0, flash: 0, sink: 0, lean: 0,
    shift: 0,                  // 몸통이 옆으로 움직인 거리 (멀리 있는 플레이어를 칠 때 상체를 그쪽으로 숙임)
    pose: null, poseK: 0,      // 자세 그림 (예: 피리 불기). poseK 0 = 파츠 리그, 1 = 자세 그림
    hands: [],
    marks: [],                 // 바닥 예고 원과 균열
    pattern: null,             // 진행 중인 몸 전체 패턴 (flute, vines)
    rings: [],                 // 퍼지는 소리 고리
    lanes: [],                 // 가시덩굴 줄
    last: null,                // 직전 패턴 (연속 방지)
    anim: null, joints: null,
  };

  // ---------- 보스 불러오기 ----------
  function load(key) {
    def = G.BossDefs[key];
    const b = def.body;
    SKELETON = {
      hipHeight: 0, footPad: 0,
      bones: [
        { name: 'hip',      parent: null,      at: [0, 0],                          rest: 0,       len: 0 },
        { name: 'torso',    parent: 'hip',     at: [0, 0],                          rest: Math.PI, len: b.torso },
        { name: 'head',     parent: 'torso',   at: [0, b.torso - 6],                rest: 0,       len: b.head },
        { name: 'armL_up',  parent: 'torso',   at: [b.shoulderX, b.torso - (b.shoulderDrop || 22)], rest: Math.PI, len: b.armUp },
        { name: 'armL_low', parent: 'armL_up', at: [0, b.armUp],                    rest: 0,       len: b.armLow },
        { name: 'armR_up',  parent: 'torso',   at: [-b.shoulderX, b.torso - (b.shoulderDrop || 22)], rest: Math.PI, len: b.armUp },
        { name: 'armR_low', parent: 'armR_up', at: [0, b.armUp],                    rest: 0,       len: b.armLow },
      ],
    };
    // 숨쉬기 (팔 각도는 IK가 덮어쓰므로 몸통·머리만)
    CLIPS = { idle: { dur: 3.2, loop: true, keys: [
      { t: 0,   p: { hipY: 0,  torso: 0,  head: 0 } },
      { t: 1.6, p: { hipY: -6, torso: -2, head: -3 } },
    ] } };
    reset();
  }

  function reset() {
    boss.hp = boss.maxHp = def.hp;
    boss.mode = 'fight';
    boss.timer = 1.5;
    boss.time = 0; boss.flash = 0; boss.sink = 0; boss.lean = 0; boss.shift = 0; boss.pose = null; boss.poseK = 0;
    boss.x = G.CFG.ARENA_W / 2;
    boss.y = S().floorY(0) + def.body.hipBelowEdge;
    boss.anim = new G.Rig.Animator(CLIPS);
    boss.marks = []; boss.rings = []; boss.lanes = []; boss.pattern = null; boss.last = null;
    // 기존 손 판정 제거 후 새로 등록
    for (const h of boss.hands) G.Combat.removeTarget(h.target);
    boss.hands = def.restHands.map((r, i) => {
      const hand = {
        side: i === 0 ? 'L' : 'R',
        rest: { x: boss.x + r.dx, z: r.z },
        x: boss.x + r.dx, z: r.z, h: 0,
        state: 'rest', t: 0, from: null, aim: null,
        shake: 0,
      };
      hand.target = G.Combat.addTarget({
        x: hand.x, z: hand.z, h: 0, w: def.fist.r * 2.2, height: def.fist.r * 1.6, active: false,
        onHit: (dmg) => hurtBoss(dmg, hand),
      });
      return hand;
    });
    updateUI();
  }

  // 현재 단계(체력에 따라)의 패턴 수치
  function params(kind) {
    const p = Object.assign({}, def.patterns[kind]);
    if (def.phase2 && boss.hp / boss.maxHp <= def.phase2.at) Object.assign(p, def.phase2[kind] || {});
    return p;
  }
  const slamParams = () => params('slam');

  // ---------- 손이 닿을 수 있는 위치로 목표 보정 ----------
  // 목표 x를 칠 때 몸통이 옆으로 움직일 거리 (최대 maxShift)
  function shiftFor(x) {
    const m = def.body.maxShift || 0;
    return Math.max(-m, Math.min(m, (x - boss.x) * 0.4));
  }
  function shoulderScreen(side, shift) {
    const j = boss.joints || G.Rig.compute(SKELETON, boss.anim.pose, false);
    const s = j[side === 'L' ? 'armL_up' : 'armR_up'].o;
    return { x: boss.x + shift + s.x, y: boss.y + s.y };
  }
  function reachable(side, x, z) {
    const sh = shoulderScreen(side, shiftFor(x)), b = def.body;
    const tx = x, ty = S().screenY(z, def.fist.r);
    return Math.hypot(tx - sh.x, ty - sh.y) < (b.armUp + b.armLow) * 0.95;
  }
  function clampTarget(side, x, z) {
    x = Math.max(boss.x - 330, Math.min(boss.x + 330, x));
    // 너무 멀면 보스 쪽(안쪽, 가운데)으로 당김
    for (let i = 0; i < 30 && !reachable(side, x, z); i++) {
      z = Math.max(0, z - 6);
      x += (boss.x - x) * 0.04;
    }
    return { x, z };
  }

  // ---------- 공격 시작 ----------
  function startSlam(hand, player, delay) {
    const p = slamParams();
    hand.state = 'raise';
    hand.t = -(delay || 0);
    hand.params = p;
    hand.from = { x: hand.x, z: hand.z, h: hand.h };
    hand.aim = clampTarget(hand.side, player.x, player.z);
    hand.base = G.Stage.support(hand.aim.x, hand.aim.z, 9999);   // 기둥 위면 기둥 윗면을 침
    hand.mark = { x: hand.aim.x, z: hand.aim.z, r: p.radius, kind: 'warn', k: 0, hand };
    boss.marks.push(hand.mark);
  }

  // 패턴 고르기: 비중(weight)대로 무작위, 직전 패턴은 제외
  function chooseAttack(player) {
    const kinds = Object.keys(def.patterns).filter(k => k !== boss.last);
    let total = kinds.reduce((n, k) => n + (def.patterns[k].weight || 1), 0);
    let r = Math.random() * total, kind = kinds[0];
    for (const k of kinds) { r -= def.patterns[k].weight || 1; if (r <= 0) { kind = k; break; } }
    boss.last = kind;
    boss.timer = 999;   // 패턴이 끝나고 손이 모두 쉬면 다시 설정
    if (kind === 'flute') startFlute();
    else if (kind === 'vines') startVines();
    else startSlamAttack(player);
  }

  function startSlamAttack(player) {
    const p = slamParams();
    // 플레이어에게 가까운 손으로 공격
    const sorted = [...boss.hands].sort((a, b) => Math.abs(a.rest.x - player.x) - Math.abs(b.rest.x - player.x));
    startSlam(sorted[0], player, 0);
    if (p.double) startSlam(sorted[1], player, p.telegraph * 0.55);   // 2단계: 다른 손도 조금 늦게
    boss.timer = 999; // 손이 모두 쉬면 다시 설정
  }

  // ---------- 매 프레임 ----------
  function update(dt, player) {
    boss.time += dt;
    boss.flash = Math.max(0, boss.flash - dt);

    if (boss.mode === 'dying') {
      boss.sink += dt * 70;
      boss.timer -= dt;
      if (Math.random() < 0.3) G.FX.shake(4, 0.1);
      if (boss.timer <= 0) { boss.mode = 'dead'; G.Game.win(); }
    }

    if (boss.mode === 'fight') {
      for (const h of boss.hands) updateHand(h, dt, player);
      if (boss.pattern) updatePattern(dt, player);
      const allRest = boss.hands.every(h => h.state === 'rest') && !boss.pattern;
      if (allRest) {
        if (boss.timer > 50) boss.timer = params(boss.last || 'slam').rest;
        boss.timer -= dt;
        if (boss.timer <= 0 && !player.dead) chooseAttack(player);
      }
    }

    // 공격하는 손의 목표 쪽으로 상체를 옮기고 기울임 (팔만 늘어나 보이지 않게)
    let shiftTarget = 0;
    for (const h of boss.hands) {
      if ((h.state === 'raise' && h.t >= 0) || h.state === 'drop' || h.state === 'stuck') shiftTarget = shiftFor(h.aim.x);
    }
    boss.shift += (shiftTarget - boss.shift) * Math.min(1, dt * 3);
    const leanTarget = boss.shift * 0.09;
    boss.lean += (leanTarget - boss.lean) * Math.min(1, dt * 4);

    // 자세 그림 전환: 패턴에 맞는 자세 그림이 있으면 부드럽게 바꿔 끼움
    // 패턴 중: 그 패턴의 자세 그림 / 공격하지 않고 쉴 때: 'idle' 자세 그림 (그림 파일이 있을 때만)
    const allRest = boss.hands.every(h => h.state === 'rest');
    let want = null;
    if (boss.pattern && def.poses && def.poses[boss.pattern.kind]) want = boss.pattern.kind;
    else if (allRest && !boss.pattern && boss.mode === 'fight' && def.poses && def.poses.idle && G.Render.getImg(def.poses.idle.img)) want = 'idle';
    if (want && boss.pose && boss.pose !== want && boss.poseK > 0) want = boss.pose;   // 다른 자세로 바로 넘어가지 않고 일단 리그로 돌아옴
    if (want) boss.pose = want;
    boss.poseK = Math.max(0, Math.min(1, boss.poseK + (want ? 1 : -1) * dt * 7));
    if (!want && boss.poseK === 0) boss.pose = null;

    boss.anim.play('idle');
    boss.anim.update(dt);
    const pose = Object.assign({}, boss.anim.pose);
    pose.torso = (pose.torso || 0) + boss.lean;
    pose.hipY = (pose.hipY || 0) + boss.sink;
    // 머리는 플레이어 쪽을 살짝 봄
    pose.head = (pose.head || 0) + Math.max(-10, Math.min(10, (boss.x - player.x) * 0.03));

    // 팔: 손 위치에 맞춰 IK
    let j = G.Rig.compute(SKELETON, pose, false);
    const torsoWorld = j.torso.a;
    const bx = boss.x + boss.shift;     // 몸통 중심 x (옆으로 움직인 만큼)
    for (const h of boss.hands) {
      const up = h.side === 'L' ? 'armL_up' : 'armR_up', low = h.side === 'L' ? 'armL_low' : 'armR_low';
      const sh = { x: j[up].o.x, y: j[up].o.y };
      const shakeX = h.shake > 0 ? (Math.random() - 0.5) * 4 : 0;
      const tgt = { x: h.x - bx + shakeX, y: S().screenY(h.z, h.h + def.fist.r) - boss.y };
      const r = G.Rig.ik2(sh, tgt, def.body.armUp, def.body.armLow, h.side === 'L' ? -1 : 1);
      pose[up] = norm(r.a1 - torsoWorld - Math.PI) / D2R;
      pose[low] = norm(r.a2 - r.a1) / D2R;
      h.shake = Math.max(0, h.shake - dt);
    }
    boss.joints = G.Rig.compute(SKELETON, pose, false);

    // 소리 고리와 덩굴 (패턴이 끝나도 남은 것은 계속 움직임)
    updateRings(dt, player);
    updateLanes(dt, player);

    // 바닥 표시 수명
    boss.marks.forEach(m => { if (m.kind !== 'warn') m.k += dt; });
    boss.marks = boss.marks.filter(m => m.kind === 'warn' || m.k < m.life);
  }

  function norm(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function ease(u) { return u * u * (3 - 2 * u); }

  function updateHand(h, dt, player) {
    const p = h.params;
    h.t += dt;
    switch (h.state) {
      case 'raise': {
        if (h.t < 0) break;                       // 2단계 연속 공격의 대기
        const u = Math.min(1, h.t / p.telegraph);
        // 앞부분 동안은 플레이어를 따라 조준, 이후 고정
        if (u < p.track && !player.dead) {
          const a = clampTarget(h.side, player.x, player.z);
          h.aim.x += (a.x - h.aim.x) * Math.min(1, dt * 6);
          h.aim.z += (a.z - h.aim.z) * Math.min(1, dt * 6);
          h.base = G.Stage.support(h.aim.x, h.aim.z, 9999);
        }
        h.mark.x = h.aim.x; h.mark.z = h.aim.z; h.mark.k = u;
        // 1) 먼저 거의 제자리에서 크게 들어 올림 → 2) 공중에서 목표 위로 이동 → 3) 살짝 더 치켜들며 힘을 모음
        const up = ease(Math.min(1, u / 0.35));
        const move = ease(Math.max(0, Math.min(1, (u - 0.25) / 0.5)));
        const windup = Math.max(0, (u - 0.75) / 0.25);
        h.x = h.from.x + (h.aim.x - h.from.x) * move;
        h.z = h.from.z + (h.aim.z - h.from.z) * move;
        h.h = h.from.h + (p.lift * 0.85 - h.from.h) * up + (p.lift * 0.15 + h.base) * move + p.lift * 0.12 * windup;
        if (u >= 1) { h.state = 'drop'; h.t = 0; }
        break;
      }
      case 'drop': {
        const u = Math.min(1, h.t / p.drop);
        h.h = h.base + (p.lift * 1.12) * (1 - u * u);   // 점점 빨라지며 떨어짐 (기둥 위면 윗면까지)
        if (u >= 1) impact(h, player);
        break;
      }
      case 'stuck':
        if (h.t >= p.stuck) {
          h.state = 'back'; h.t = 0; h.target.active = false;
          h.from = { x: h.x, z: h.z, h: 0 };
        }
        break;
      case 'ctrl':                                 // 패턴이 위치를 직접 정함
        break;
      case 'rest':                                 // 숨쉬기에 맞춰 손가락 끝이 살짝 들썩임
        h.h = 2 + 2 * Math.sin(boss.time * 1.96 + (h.side === 'L' ? 0 : 1.3));
        break;
      case 'back': {
        const u = Math.min(1, h.t / p.recover), e = ease(u);
        h.x = h.from.x + (h.rest.x - h.from.x) * e;
        h.z = h.from.z + (h.rest.z - h.from.z) * e;
        h.h = Math.sin(u * Math.PI) * 50;
        if (u >= 1) { h.state = 'rest'; h.h = 0; }
        break;
      }
    }
    // 판정 위치 갱신
    Object.assign(h.target, { x: h.x, z: h.z, h: h.h });
  }

  function impact(h, player) {
    const p = h.params;
    h.state = 'stuck'; h.t = 0; h.h = h.base || 0;
    h.target.active = true;
    boss.marks = boss.marks.filter(m => m !== h.mark);
    boss.marks.push({ x: h.x, z: h.z, r: p.radius, kind: 'crack', k: 0, life: p.stuck + 0.4, base: h.base || 0 });
    G.FX.shake(9, 0.25);
    G.FX.ring(h.x, h.z, p.radius);
    // 범위 안의 플레이어 피해 (깊이는 납작한 타원)
    const dx = (player.x - h.x) / (p.radius + 10), dz = (player.z - h.z) / (p.radius * 0.55 + 8);
    if (dx * dx + dz * dz < 1 && Math.abs(player.h - (h.base || 0)) < 60) G.Combat.hurtPlayer(player, p.dmg, h.x, h.z);
  }

  // ---------- 손을 패턴이 직접 움직일 때 ----------
  function handTo(h, x, z, height, u) {   // from에서 (x, z, height)로 u(0~1)만큼
    const e = ease(Math.min(1, Math.max(0, u)));
    h.x = h.from.x + (x - h.from.x) * e;
    h.z = h.from.z + (z - h.from.z) * e;
    h.h = h.from.h + (height - h.from.h) * e;
  }
  function takeHands() { for (const h of boss.hands) { h.state = 'ctrl'; h.from = { x: h.x, z: h.z, h: h.h }; } }
  function releaseHands() {
    for (const h of boss.hands) { h.state = 'back'; h.t = 0; h.params = slamParams(); h.from = { x: h.x, z: h.z, h: h.h }; }
  }

  // ---------- 피리 충격파 ----------
  function startFlute() {
    const p = params('flute');
    boss.pattern = { kind: 'flute', t: 0, p, fired: 0 };
    // 손은 바닥을 짚은 채로 두고, 피리는 입 앞에 마법처럼 나타남 (팔을 접으면 그림이 얼굴을 가림)
  }

  // ---------- 가시덩굴 ----------
  function startVines() {
    const p = params('vines');
    // 줄 번호를 섞어서 앞에서부터 hitLanes개 고름 → 나머지가 안전한 줄
    const ids = [...Array(p.lanes).keys()].sort(() => Math.random() - 0.5).slice(0, p.hitLanes);
    const D = G.CFG.DEPTH, w = D / p.lanes;
    boss.lanes = ids.map(i => ({ z0: i * w, z1: (i + 1) * w, t: 0, p, state: 'warn', hit: false,
                                  seed: Math.random() * 1000 }));
    boss.pattern = { kind: 'vines', t: 0, p, pressed: false };
    takeHands();
  }

  function updatePattern(dt, player) {
    const P = boss.pattern, p = P.p;
    P.t += dt;
    if (P.kind === 'flute') {
      if (P.t > p.telegraph) {
        const k = Math.floor((P.t - p.telegraph) / p.gap);
        while (P.fired <= k && P.fired < p.rings) {
          boss.rings.push({ r: 30, p });
          P.fired++;
          G.FX.shake(3, 0.12);
        }
        if (P.fired >= p.rings && P.t > p.telegraph + p.gap * p.rings + 0.2) boss.pattern = null;
      }
    } else if (P.kind === 'vines') {
      // 손을 들었다가 예고 끝에 땅을 짚음
      const pressAt = p.telegraph;
      boss.hands.forEach(h => {
        const up = Math.min(1, P.t / (pressAt * 0.7));
        const lift = P.t < pressAt * 0.7 ? 80 * up : 80 * Math.max(0, 1 - (P.t - pressAt * 0.7) / (pressAt * 0.3));
        h.x = h.from.x; h.z = h.from.z; h.h = lift;
      });
      if (!P.pressed && P.t >= pressAt) {
        P.pressed = true;
        G.FX.shake(7, 0.25);
        boss.hands.forEach(h => G.FX.ring(h.x, h.z, 50));
      }
      if (P.t >= pressAt + 0.25) { boss.pattern = null; releaseHands(); }
    }
  }

  function updateRings(dt, player) {
    for (const r of boss.rings) {
      r.r += r.p.speed * dt;
      // 플레이어와 고리 사이 거리 (깊이는 squash배)
      const dx = player.x - boss.x, dz = (player.z + 4) * r.p.squash;
      const d = Math.hypot(dx, dz);
      if (!r.hitDone && Math.abs(d - r.r) < r.p.band && player.h < r.p.safeHeight) {
        if (G.Combat.hurtPlayer(player, r.p.dmg, boss.x, -40)) r.hitDone = true;
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

  function hurtBoss(dmg, hand) {
    if (boss.mode !== 'fight') return;
    boss.hp = Math.max(0, boss.hp - dmg);
    boss.flash = 0.08;
    hand.shake = 0.15;
    updateUI();
    if (boss.hp <= 0) {
      boss.mode = 'dying';
      boss.timer = 2.4;
      for (const h of boss.hands) { h.target.active = false; }
      boss.marks = []; boss.rings = []; boss.lanes = []; boss.pattern = null;
      G.FX.shake(14, 0.6);
    }
  }

  // ---------- 그리기 ----------
  // 자세 그림 위치: 그림 속 기준점(anchor, 픽셀)을 보스 목 위치에 맞춤
  function poseRect() {
    const P = def.poses[boss.pose], im = G.Render.getImg(P.img);
    if (!im) return null;
    const k = P.width / im.naturalWidth;
    const neckX = boss.x + boss.shift, neckY = boss.y + boss.joints.torso.o.y - def.body.torso + (P.offsetY || 0);
    return { im, k, x: neckX - P.anchor[0] * k, y: neckY - P.anchor[1] * k, w: P.width, h: im.naturalHeight * k };
  }
  // 낭떠러지 뒤에 있는 몸통·머리 (바닥보다 먼저)
  function drawBack(ctx) {
    if (!boss.joints) return;
    const skin = def.skin;
    // 뒤에서 비치는 기운
    const g = ctx.createRadialGradient(boss.x, boss.y - 160, 40, boss.x, boss.y - 160, 340);
    g.addColorStop(0, `rgba(${def.theme.moon}, 0.10)`);
    g.addColorStop(1, `rgba(${def.theme.moon}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(boss.x - 360, boss.y - 520, 720, 520);
    skin.head.pulse = 0.65 + 0.35 * Math.sin(boss.time * 2.2);
    ctx.save();
    const fade = boss.mode !== 'fight' ? Math.max(0, 1 - boss.sink / 200) : 1;
    const pr = boss.pose && boss.poseK > 0 ? poseRect() : null;
    const rigK = pr ? 1 - boss.poseK : 1;
    if (rigK > 0) {
      ctx.globalAlpha = fade * rigK;
      G.Render.drawRig(ctx, boss.joints, skin, BACK_ORDER, boss.x + boss.shift, boss.y, 1);
    }
    if (pr) {                // 자세 그림 (피리 불기 등)
      ctx.globalAlpha = fade * boss.poseK;
      ctx.drawImage(pr.im, pr.x, pr.y, pr.w, pr.h);
    }
    if (boss.flash > 0) {   // 맞을 때 몸 전체가 번쩍
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      G.Render.drawRig(ctx, boss.joints, skin, BACK_ORDER, boss.x + boss.shift, boss.y, 1);
    }
    ctx.restore();
  }

  // 바닥 위: 예고 원, 균열, 덩굴 예고, 소리 고리, 손 그림자, 아래팔과 손
  function drawFront(ctx) {
    if (!boss.joints) return;
    for (const m of boss.marks) drawMark(ctx, m);
    for (const L of boss.lanes) if (L.state === 'warn') drawLaneWarn(ctx, L);
    for (const r of boss.rings) drawRing(ctx, r);
    const rigK = boss.pose ? 1 - boss.poseK : 1;     // 자세 그림이 나오는 동안은 팔 파츠를 숨김
    for (const h of boss.hands) {
      const r = def.fist.r * (1 + Math.min(1, h.h / 200));
      G.Render.shadow(ctx, h.x, S().screenY(h.z, h.base && h.state !== 'rest' && h.state !== 'back' ? h.base : 0), r * 1.3, (0.55 - Math.min(0.35, h.h / 500)) * rigK);
    }
    ctx.save();
    ctx.globalAlpha = (boss.mode !== 'fight' ? Math.max(0, 1 - boss.sink / 200) : 1) * rigK;
    if (rigK > 0) G.Render.drawRig(ctx, boss.joints, def.skin, FRONT_ORDER, boss.x + boss.shift, boss.y, 1);
    ctx.globalAlpha = 1;
    if (boss.pattern && boss.pattern.kind === 'flute') drawFlute(ctx, boss.pattern);
    // 때릴 수 있는 손은 테두리로 표시
    for (const h of boss.hands) {
      if (!h.target.active) continue;
      const y = S().screenY(h.z, def.fist.r);
      ctx.strokeStyle = `rgba(255, 230, 150, ${0.5 + 0.4 * Math.sin(boss.time * 10)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.x, y, def.fist.r + 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // 피리(시링크스): 길이가 다른 관을 나란히 묶은 것. 두 손 사이, 입 앞
  function drawFlute(ctx, P) {
    // 입 위치: 머리 뼈의 아래쪽 (목에서 머리 길이의 15%)
    const hd = boss.joints.head, m = 0.15 * hd.len;
    let cx = boss.x + boss.shift + hd.o.x - Math.sin(hd.a) * m, cy = boss.y + hd.o.y + Math.cos(hd.a) * m;
    const pose = def.poses && def.poses.flute;
    const pr = pose && boss.pose === 'flute' ? poseRect() : null;
    if (pr) {                // 피리 부는 그림이 있으면: 그림 속 피리 끝에서 기운이 모임
      cx = pr.x + pose.glow[0] * pr.k; cy = pr.y + pose.glow[1] * pr.k;
      if (P.t < P.p.telegraph) fluteGlow(ctx, cx, cy, P.t / P.p.telegraph);
      return;
    }
    const k = Math.min(1, P.t / 0.3);
    ctx.save();
    ctx.globalAlpha = k;
    for (let i = 0; i < 7; i++) {
      const x = cx - 42 + i * 12, len = 70 - i * 6;
      ctx.fillStyle = i % 2 ? '#b08a52' : '#c49a5e';
      ctx.fillRect(x, cy - 10, 10, len);
      ctx.strokeStyle = '#2a1e12'; ctx.lineWidth = 1.5; ctx.strokeRect(x, cy - 10, 10, len);
    }
    ctx.fillStyle = '#5e8a3a'; ctx.fillRect(cx - 46, cy + 6, 92, 7);       // 묶은 덩굴
    ctx.restore();
    if (P.t < P.p.telegraph) fluteGlow(ctx, cx, cy, P.t / P.p.telegraph);
  }
  // 숨 들이쉬는 동안 초록 기운이 모임
  function fluteGlow(ctx, cx, cy, u) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30 + 60 * u);
    g.addColorStop(0, `rgba(170, 255, 140, ${0.5 * u})`);
    g.addColorStop(1, 'rgba(170, 255, 140, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 30 + 60 * u, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 소리 고리: 바닥 위에 납작한 타원으로 퍼짐
  function drawRing(ctx, r) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = Math.max(0, 1 - r.r / 900);
    ctx.strokeStyle = `rgba(160, 255, 150, ${0.75 * a})`;
    ctx.lineWidth = r.p.band * 1.1;
    ctx.beginPath(); ctx.ellipse(boss.x, S().floorY(-4), r.r, r.r / r.p.squash, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = `rgba(240, 255, 230, ${0.9 * a})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(boss.x, S().floorY(-4), r.r, r.r / r.p.squash, 0, 0, Math.PI); ctx.stroke();
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
    const base = m.hand ? (m.hand.base || 0) : (m.base || 0);   // 기둥 위를 칠 때는 기둥 윗면에 표시
    const y = S().screenY(m.z, base), rx = m.r, rz = m.r * 0.55;
    if (m.kind === 'warn') {
      ctx.save();
      ctx.fillStyle = `rgba(220, 40, 30, ${0.12 + 0.18 * m.k})`;
      ctx.beginPath(); ctx.ellipse(m.x, y, rx, rz, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255, 60, 40, ${0.35})`;           // 차오르는 안쪽 원 = 남은 시간
      ctx.beginPath(); ctx.ellipse(m.x, y, rx * m.k, rz * m.k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 90, 70, .9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(m.x, y, rx, rz, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else {
      const a = Math.max(0, 1 - m.k / m.life);
      ctx.save();
      ctx.strokeStyle = `rgba(20, 14, 10, ${0.7 * a})`;
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
    if (kind === 'flute') startFlute(); else if (kind === 'vines') startVines(); else startSlamAttack(player || G.player);
  }

  return { state: boss, load, reset, update, drawBack, drawFront, drawables, updateUI, force, get def() { return def; } };
})();
