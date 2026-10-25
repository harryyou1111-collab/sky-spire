// =====================================================================
// player.js — 플레이어: 이동, 점프, 발판, 공격, 회피 대시, 동작 선택
// 상태는 셋 중 하나: 자유 이동 / 공격 중(p.atk) / 대시 중(p.dash)
// =====================================================================
G.Player = (function () {
  const C = () => G.CFG.player;

  // ---------- 뼈대 길이 (기획서 4번 표와 같은 값) ----------
  const SKELETON = G.Rig.humanoid({
    torso: 38, head: 26, armUp: 20, armLow: 19, weapon: 50,
    legUp: 26, legLow: 27, footPad: 5,
  });

  // ---------- 그리는 순서 (뒤 → 앞) ----------
  const ORDER = ['armB_up', 'armB_low', 'legB_up', 'legB_low', 'torso', 'head',
                 'legF_up', 'legF_low', 'armF_up', 'armF_low', 'weapon'];

  // ---------- 임시 도형 스킨 (2단계에서 일러스트로 교체) ----------
  const STEEL = '#8d93a3', STEEL_D = '#5a5f6d', LEATHER = '#5b4433', LEATHER_D = '#3d2d22';
  const SKIN = {
    torso:    { shape: 'torso',   w1: 20, w2: 26, color: STEEL, belt: LEATHER },
    head:     { shape: 'head',    r: 11, color: '#a3a9b8', visor: '#141018', crest: '#d9c38a' },
    armF_up:  { shape: 'capsule', w1: 10, w2: 8,  color: STEEL },
    armF_low: { shape: 'capsule', w1: 8,  w2: 7,  color: LEATHER },
    armB_up:  { shape: 'capsule', w1: 10, w2: 8,  color: STEEL_D },
    armB_low: { shape: 'capsule', w1: 8,  w2: 7,  color: LEATHER_D },
    legF_up:  { shape: 'capsule', w1: 12, w2: 9,  color: LEATHER },
    legF_low: { shape: 'capsule', w1: 9,  w2: 8,  color: STEEL, foot: 11 },
    legB_up:  { shape: 'capsule', w1: 12, w2: 9,  color: LEATHER_D },
    legB_low: { shape: 'capsule', w1: 9,  w2: 8,  color: STEEL_D, foot: 11 },
    weapon:   { shape: 'sword', grip: '#2a1e16', guard: '#d9c38a', blade: '#dfe4ee', edge: '#7d8596' },
  };

  // ---------- 애니메이션 (포즈 = 관절 각도, 각도 규칙은 rig.js 맨 위 참고) ----------
  const CLIPS = {
    idle: { dur: 1.6, loop: true, keys: [
      { t: 0,   p: { torso: 6, head: -4, armF_up: -24, armF_low: -50, weapon: 30, armB_up: 14, armB_low: -22,
                     legF_up: -16, legF_low: 22, legB_up: 12, legB_low: 16 } },
      { t: 0.8, p: { torso: 8, head: -6, armF_up: -21, armF_low: -54, weapon: 34, armB_up: 17, armB_low: -26,
                     legF_up: -18, legF_low: 26, legB_up: 11, legB_low: 20 } },
    ] },
    run: { dur: 0.52, loop: true, keys: [
      { t: 0,    p: { torso: 14, head: -10, legF_up: -38, legF_low: 12, legB_up: 30, legB_low: 48,
                      armB_up: -28, armB_low: -40, armF_up: -30, armF_low: -62, weapon: 46 } },
      { t: 0.13, p: { torso: 12, head: -9,  legF_up: 0,   legF_low: 16, legB_up: -12, legB_low: 88,
                      armB_up: 0, armB_low: -30, armF_up: -24, armF_low: -60, weapon: 44 } },
      { t: 0.26, p: { torso: 14, head: -10, legF_up: 30,  legF_low: 48, legB_up: -38, legB_low: 12,
                      armB_up: 30, armB_low: -18, armF_up: -18, armF_low: -58, weapon: 42 } },
      { t: 0.39, p: { torso: 12, head: -9,  legF_up: -12, legF_low: 88, legB_up: 0,   legB_low: 16,
                      armB_up: 0, armB_low: -30, armF_up: -24, armF_low: -60, weapon: 44 } },
    ] },
    jump: { dur: 0.15, loop: false, keys: [
      { t: 0, p: { torso: 8, head: -6, legF_up: -55, legF_low: 75, legB_up: 18, legB_low: 40,
                   armB_up: -70, armB_low: -30, armF_up: -45, armF_low: -50, weapon: 40 } },
    ] },
    fall: { dur: 0.2, loop: false, keys: [
      { t: 0, p: { torso: 4, head: -2, legF_up: -28, legF_low: 30, legB_up: 14, legB_low: 55,
                   armB_up: -115, armB_low: -25, armF_up: -55, armF_low: -40, weapon: 30 } },
    ] },
    land: { dur: 0.1, loop: false, keys: [
      { t: 0, p: { torso: 20, head: -14, legF_up: -48, legF_low: 80, legB_up: 22, legB_low: 70,
                   armB_up: 10, armB_low: -30, armF_up: -20, armF_low: -45, weapon: 25 } },
    ] },
  };

  // ---------- 공격·대시 동작 ----------
  // 다리 자세 묶음 (공격 포즈에 섞어 씀)
  const SET   = { legF_up: -24, legF_low: 26, legB_up: 18, legB_low: 20 };  // 준비 자세
  const LUNGE = { legF_up: -42, legF_low: 34, legB_up: 32, legB_low: 22 };  // 앞으로 내딛은 자세
  const P = (...parts) => Object.assign({}, ...parts);

  // 공격 동작: 준비(wind) → 타격(strike) → 마무리(follow)
  // 타이밍은 config.js의 공격 수치와 자동으로 맞춰짐
  function attackClip(def, wind, strike, follow) {
    const s = def.startup, e = s + def.active, end = e + def.recovery;
    return { dur: end, loop: false, keys: [
      { t: 0, p: wind }, { t: s, p: strike }, { t: e, p: follow }, { t: end, p: follow },
    ] };
  }

  function buildAttackClips() {
    const A = G.CFG.attack;
    CLIPS.atk_side1 = attackClip(A.side1,   // 위에서 앞으로 내려 베기
      P(SET,   { torso: -6, head: 2,   armF_up: -140, armF_low: -20, weapon: 16, armB_up: 20, armB_low: -30 }),
      P(LUNGE, { torso: 16, head: -10, armF_up: -40,  armF_low: 0,   weapon: 64, armB_up: 35, armB_low: -20 }),
      P(LUNGE, { torso: 18, head: -10, armF_up: -20,  armF_low: -10, weapon: 92, armB_up: 40, armB_low: -15 }));
    CLIPS.atk_side2 = attackClip(A.side2,   // 아래에서 위로 올려 베기
      P(SET,   { torso: 10, head: -6, armF_up: 10,   armF_low: -20, weapon: 100, armB_up: -20, armB_low: -30 }),
      P(LUNGE, { torso: 4,  head: -4, armF_up: -110, armF_low: -10, weapon: 56,  armB_up: 30,  armB_low: -20 }),
      P(LUNGE, { torso: 0,  head: -2, armF_up: -150, armF_low: -10, weapon: 50,  armB_up: 35,  armB_low: -20 }));
    const HEAVY = { legF_up: -55, legF_low: 40, legB_up: 40, legB_low: 20 };
    CLIPS.atk_side3 = attackClip(A.side3,   // 크게 넘겨 내려치기 (3타)
      { torso: -10, head: 4, armF_up: -170, armF_low: -20, weapon: 0, armB_up: -40, armB_low: -40,
        legF_up: -10, legF_low: 30, legB_up: 10, legB_low: 30 },
      P(HEAVY, { torso: 24, head: -14, armF_up: -30, armF_low: 0,  weapon: 66, armB_up: 50, armB_low: -10 }),
      P(HEAVY, { torso: 26, head: -14, armF_up: -10, armF_low: -5, weapon: 84, armB_up: 50, armB_low: -10 }));
    CLIPS.atk_down = { dur: 0.1, loop: false, keys: [ // 공중 내려찍기: 칼끝을 아래로
      { t: 0, p: { torso: 10, head: -8, armF_up: -10, armF_low: -20, weapon: 110, armB_up: -60, armB_low: -30,
                   legF_up: -60, legF_low: 90, legB_up: -20, legB_low: 100 } },
    ] };
  }
  CLIPS.dash = { dur: 0.1, loop: false, keys: [
    { t: 0, p: { torso: 32, head: -18, armF_up: 40, armF_low: -20, weapon: 60, armB_up: 55, armB_low: -20,
                 legF_up: -30, legF_low: 60, legB_up: 45, legB_low: 40 } },
  ] };
  // 더블 점프: 무릎을 모아 웅크린 자세
  CLIPS.jump2 = { dur: 0.15, loop: false, keys: [
    { t: 0, p: { torso: 20, head: -12, legF_up: -80, legF_low: 110, legB_up: -40, legB_low: 110,
                 armB_up: -40, armB_low: -60, armF_up: -60, armF_low: -70, weapon: 50 } },
  ] };
  buildAttackClips();

  // 대시 잔상용 단색 스킨
  const GHOST = {};
  for (const k in SKIN) {
    const g = Object.assign({}, SKIN[k]);
    ['color', 'belt', 'visor', 'crest', 'grip', 'guard', 'blade', 'edge'].forEach(f => { if (f in g) g[f] = '#6fb6ff'; });
    g.outline = 'rgba(0,0,0,0)';
    GHOST[k] = g;
  }


  function create(x, z) {
    const c = C();
    return {
      x, z, h: 0,                 // 좌우, 깊이, 높이 (stage.js 맨 위 설명 참고)
      vx: 0, vz: 0, vh: 0,
      sy: 0,                      // 화면에 그릴 발 위치 y (매 프레임 계산)
      halfWidth: c.halfWidth, halfDepth: c.halfDepth, height: c.height,
      facing: 1,
      onGround: true,
      coyote: 0, jumpBuf: 0, jumpCutDone: true, jumps: 0, landTimer: 0,
      // 공격
      atk: null, atkBuf: 0, combo: 0, chainT: 0, atkCount: 0, animAtkId: -1,
      // 대시
      dash: null, dashBuf: 0, dashCd: 0, airDashUsed: false, iframe: 0, ghostT: 0,
      state: 'idle', jumpAnim: 'jump',
      anim: new G.Rig.Animator(CLIPS),
      joints: null,
    };
  }

  // 현재 속도 v를 목표 속도 target 쪽으로 최대 delta 만큼 움직임
  function approach(v, target, delta) {
    if (v < target) return Math.min(v + delta, target);
    return Math.max(v - delta, target);
  }

  // ---------------- 물리 한 단계 (dt = CFG.STEP) ----------------
  function step(p, dt) {
    const c = C(), I = G.Input, A = G.CFG.attack;
    const ax = I.axis.x, ay = I.axis.y;

    // 입력 기억(버퍼)과 각종 타이머
    p.jumpBuf = I.pressed.jump ? c.jumpBuffer : Math.max(0, p.jumpBuf - dt);
    p.atkBuf  = I.pressed.attack ? A.buffer : Math.max(0, p.atkBuf - dt);
    p.dashBuf = I.pressed.dodge ? 0.1 : Math.max(0, p.dashBuf - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.iframe = Math.max(0, p.iframe - dt);
    p.chainT = Math.max(0, p.chainT - dt);
    p.coyote = p.onGround ? c.coyoteTime : Math.max(0, p.coyote - dt);

    // 1순위: 회피 대시 (공격 중에도 바로 끊고 회피 가능)
    if (p.dashBuf > 0 && p.dashCd <= 0 && !p.dash && (p.onGround || !p.airDashUsed)) startDash(p, ax, ay);

    if (p.dash) updateDash(p, dt);
    else if (p.atk) updateAttack(p, dt, ax, ay);
    else freeMove(p, dt, ax, ay);

    // 중력 (대시 중에는 공중에 멈춤)
    if (p.dash) p.vh = 0;
    else {
      const g = G.CFG.GRAVITY * (p.vh < 0 ? G.CFG.FALL_GRAVITY_MULT : 1);
      p.vh = Math.max(p.vh - g * dt, -G.CFG.MAX_FALL);
      if (p.atk && p.atk.kind === 'down' && p.atk.t >= p.atk.def.startup) p.vh = Math.min(p.vh, -480);
    }

    // 이동 + 충돌
    const wasGround = p.onGround;
    p.onGround = G.Stage.move(p, dt);
    if (p.onGround && !wasGround) {           // 막 착지
      p.landTimer = c.landTime;
      p.airDashUsed = false;
      p.jumps = 0;
      if (p.atk && p.atk.kind === 'down') p.atk = null;
    }
    if (!p.onGround && wasGround && p.jumps === 0 && p.coyote <= 0) p.jumps = 1; // 걸어서 떨어지면 공중 점프 1번만
    if (!p.onGround && p.coyote <= 0 && p.jumps === 0) p.jumps = 1;
    p.landTimer = Math.max(0, p.landTimer - dt);

    // 공격 판정
    if (p.atk && p.atk.phase === 'active' && G.Combat.playerAttack(p) && p.atk.kind === 'down') {
      // 내려찍기가 맞으면 위로 튕겨 오름 (공중 대시, 더블 점프 회복)
      p.vh = p.atk.def.pogo;
      p.atk = null;
      p.airDashUsed = false;
      p.jumps = 1;
      p.jumpCutDone = true;
    }
  }

  // 좌우 + 깊이 이동 (가속/감속은 두 방향에 따로 적용)
  function steer(p, dt, ax, ay, mul) {
    const c = C();
    const tx = ax * c.maxSpeed, tz = ay * c.maxSpeed * c.depthSpeed;
    const rate = (target, v) => {
      if (p.onGround) {
        if (target === 0) return c.decel;
        if (v !== 0 && Math.sign(v) !== Math.sign(target)) return c.turnAccel;
        return c.accel;
      }
      return target === 0 ? c.airDecel : c.airAccel;
    };
    p.vx = approach(p.vx, tx, rate(tx, p.vx) * mul * dt);
    p.vz = approach(p.vz, tz, rate(tz, p.vz) * mul * dt);
  }

  // ---------- 자유 이동: 걷기, 점프, 더블 점프, 공격 시작 ----------
  function freeMove(p, dt, ax, ay) {
    const c = C(), I = G.Input;
    steer(p, dt, ax, ay, 1);
    if (ax !== 0) p.facing = Math.sign(ax);

    if (p.jumpBuf > 0) {
      if (p.coyote > 0) jump(p, 1);
      else if (p.jumps < 2) jump(p, c.doubleJump);   // 공중에서 한 번 더
    }
    // 점프 버튼을 일찍 떼면 낮게 뜀
    if (!p.jumpCutDone && !I.held.jump && p.vh > 0) {
      p.vh = Math.min(p.vh, c.jumpVel * c.jumpCut);
      p.jumpCutDone = true;
    }

    if (p.atkBuf > 0) startAttack(p, ax, ay);
  }

  function jump(p, power) {
    const c = C();
    p.vh = c.jumpVel * power;
    p.jumps = p.onGround || p.coyote > 0 ? 1 : 2;
    p.jumpAnim = p.jumps === 2 ? 'jump2' : 'jump';
    p.onGround = false;
    p.coyote = 0; p.jumpBuf = 0;
    p.jumpCutDone = false;
    p.landTimer = 0;
    if (p.jumps === 2) p.anim.play('jump2', true, 0.04);
  }

  // ---------- 공격 ----------
  // 공중에서 조이스틱을 똑바로 아래로 + 공격 = 내려찍기, 그 외 = 3연타
  function startAttack(p, ax, ay) {
    const A = G.CFG.attack;
    let kind;
    if (!p.onGround && ay > 0.8 && Math.abs(ax) < 0.35) kind = 'down';
    else {
      const n = (p.chainT > 0 && p.combo < 3) ? p.combo + 1 : 1;
      p.combo = n;
      kind = 'side' + n;
    }
    if (ax !== 0) p.facing = Math.sign(ax);
    p.atk = { kind, def: A[kind], t: 0, phase: 'startup', hit: new Set(), queued: false, lunged: false, id: ++p.atkCount };
    p.atkBuf = 0;
    p.chainT = 0;
  }

  function updateAttack(p, dt, ax, ay) {
    const c = C(), a = p.atk, d = a.def;
    a.t += dt;
    const s = d.startup, e = s + d.active, end = e + d.recovery;
    a.phase = a.t < s ? 'startup' : a.t < e ? 'active' : 'recovery';
    if (a.kind === 'down' && a.t >= s && !p.onGround) a.phase = 'active'; // 땅에 닿을 때까지 판정 유지

    // 움직임: 땅에서는 제자리에 서서 휘두르고, 타격 순간 앞으로 내딛음
    if (p.onGround) {
      if (a.phase === 'active' && !a.lunged && d.lunge > 0) { p.vx = p.facing * d.lunge; a.lunged = true; }
      else p.vx = approach(p.vx, 0, c.decel * 0.5 * dt);
      p.vz = approach(p.vz, 0, c.decel * dt);
    } else {
      steer(p, dt, ax, ay, 0.6);
    }

    // 3연타: 휘두르는 중에 공격을 누르면 다음 타를 예약
    if (p.atkBuf > 0 && a.kind.startsWith('side') && p.combo < 3) { a.queued = true; p.atkBuf = 0; }
    if (a.queued && a.t >= e) {
      p.chainT = 1;
      p.atk = null;
      startAttack(p, ax, ay);
      return;
    }
    // 휘두른 뒤 빈틈에는 점프로 끊을 수 있음
    if (a.phase === 'recovery' && p.jumpBuf > 0 && (p.coyote > 0 || p.jumps < 2)) {
      p.atk = null;
      jump(p, p.coyote > 0 ? 1 : C().doubleJump);
      return;
    }

    if (a.t >= end && a.kind !== 'down') {
      p.atk = null;
      if (a.kind.startsWith('side') && p.combo < 3) p.chainT = G.CFG.attack.chain;
      else p.combo = 0;
    }
  }

  // ---------- 회피 대시 (바닥 평면 8방향: 좌우 + 안쪽/바깥쪽) ----------
  function startDash(p, ax, ay) {
    const d = G.CFG.dash;
    let dx, dz;
    if (ax === 0 && ay === 0) { dx = p.facing; dz = 0; }
    else {
      const ang = Math.round(Math.atan2(ay, ax) / (Math.PI / 4)) * (Math.PI / 4); // 45도 단위로 맞춤
      dx = Math.round(Math.cos(ang) * 1000) / 1000;
      dz = Math.round(Math.sin(ang) * 1000) / 1000;
    }
    p.atk = null;
    p.dash = { t: 0, dx, dz };
    p.dashCd = d.cooldown;
    p.iframe = d.iframe;
    p.dashBuf = 0;
    p.jumpCutDone = true;
    p.ghostT = 0;
    if (!p.onGround) p.airDashUsed = true;
    if (dx !== 0) p.facing = Math.sign(dx);
  }

  function updateDash(p, dt) {
    const d = G.CFG.dash, c = C(), D = p.dash;
    D.t += dt;
    p.vx = D.dx * d.speed;
    p.vz = D.dz * d.speed * c.depthSpeed;
    if (D.t >= d.time) {
      p.vx = D.dx * c.maxSpeed;
      p.vz = D.dz * c.maxSpeed * c.depthSpeed;
      p.dash = null;
    }
  }

  // ---------------- 화면 프레임마다: 동작 고르기, 뼈대 계산, 효과 기록 ----------------
  function animate(p, dt) {
    const c = C();
    let speed = 1;
    if (p.dash) {
      p.state = 'dash';
      p.anim.play('dash', false, 0.03);
    } else if (p.atk) {
      p.state = 'atk_' + p.atk.kind;
      if (p.atk.id !== p.animAtkId) { p.anim.play(p.state, true, 0.03); p.animAtkId = p.atk.id; }
    } else {
      const moving = Math.hypot(p.vx, p.vz);
      if (!p.onGround) p.state = p.vh > 0 ? p.jumpAnim : 'fall';
      else if (p.landTimer > 0 && moving < 30) p.state = 'land';
      else if (moving > 15) {
        p.state = 'run';
        speed = Math.max(0.45, moving / c.maxSpeed);
      } else p.state = 'idle';
      p.anim.play(p.state);
    }
    p.anim.update(dt, speed);
    p.joints = G.Rig.compute(SKELETON, p.anim.pose, p.onGround);
    p.sy = G.Stage.screenY(p.z, p.h);

    // 검 궤적: 타격 직전부터 휘두른 직후까지 기록 (화면 좌표)
    if (p.atk) {
      const d = p.atk.def;
      if (p.atk.t >= d.startup - 0.02 && p.atk.t < d.startup + d.active + 0.05) {
        const w = p.joints.weapon;
        const dirX = -Math.sin(w.a), dirY = Math.cos(w.a);
        const at = (k) => ({ x: p.x + p.facing * (w.o.x + dirX * w.len * k), y: p.sy + w.o.y + dirY * w.len * k });
        G.FX.trailPoint(at(1), at(0.35));
      }
    }
    // 대시 잔상
    if (p.dash) {
      p.ghostT -= dt;
      if (p.ghostT <= 0) {
        G.FX.ghost({ joints: p.joints, x: p.x, y: p.sy, facing: p.facing });
        p.ghostT = G.CFG.dash.ghostEvery;
      }
    }
  }

  function drawGhost(ctx, g, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    G.Render.drawRig(ctx, g.joints, GHOST, ORDER, g.x, g.y, g.facing);
    ctx.restore();
  }

  function draw(ctx, p) {
    const c = C();
    const floor = G.Stage.support(p.x, p.z, c.halfWidth, c.halfDepth, p.h);
    const air = Math.min(1, (p.h - floor) / 150);
    G.Render.shadow(ctx, p.x, G.Stage.screenY(p.z, floor), 20 * (1 - air * 0.5), 0.45 * (1 - air * 0.6));
    G.FX.drawBack(ctx, drawGhost);
    G.Render.drawRig(ctx, p.joints, SKIN, ORDER, p.x, p.sy, p.facing);
    if (G.CFG.debug) G.Render.drawJoints(ctx, p.joints, p.x, p.sy, p.facing);
  }

  // 깊이 정렬용 (z가 클수록 앞에 그림)
  function drawable(p) { return { key: p.z, draw: ctx => draw(ctx, p) }; }

  return { create, step, animate, drawable };
})();
