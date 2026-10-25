// =====================================================================
// player.js — 플레이어: 이동, 점프, 동작 선택
// 1-1 단계: 이동과 점프만. 공격·회피는 1-2, 1-4 단계에서 추가합니다.
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

  function create(x) {
    return {
      x, y: G.CFG.GROUND_Y, vx: 0, vy: 0,
      facing: 1,
      onGround: true,
      coyote: 0, jumpBuf: 0, jumpCutDone: true,
      landTimer: 0,
      state: 'idle',
      anim: new G.Rig.Animator(CLIPS),
      joints: null,
    };
  }

  // 현재 속도 v를 목표 속도 target 쪽으로 최대 rate*dt 만큼 움직임
  function approach(v, target, delta) {
    if (v < target) return Math.min(v + delta, target);
    return Math.max(v - delta, target);
  }

  // 물리 한 단계 (dt = CFG.STEP)
  function step(p, dt) {
    const c = C(), I = G.Input;
    const ax = I.axis.x;            // 조이스틱 좌우 (-1 ~ 1), 덜 밀면 천천히 걸음
    const dir = Math.sign(ax);

    // --- 좌우 이동 ---
    const target = ax * c.maxSpeed;
    let rate;
    if (p.onGround) {
      if (dir === 0) rate = c.decel;
      else if (p.vx !== 0 && Math.sign(p.vx) !== dir) rate = c.turnAccel;
      else rate = c.accel;
    } else {
      rate = dir === 0 ? c.airDecel : c.airAccel;
    }
    p.vx = approach(p.vx, target, rate * dt);
    if (dir !== 0) p.facing = dir; // 방향 전환은 즉시

    // --- 점프 (버퍼 + 코요테 타임) ---
    if (I.pressed.jump) p.jumpBuf = c.jumpBuffer;
    else p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    p.coyote = p.onGround ? c.coyoteTime : Math.max(0, p.coyote - dt);

    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -c.jumpVel;
      p.onGround = false;
      p.coyote = 0; p.jumpBuf = 0;
      p.jumpCutDone = false;
      p.landTimer = 0;
    }
    // 점프 버튼을 일찍 떼면 낮게 뜀
    if (!p.jumpCutDone && !I.held.jump && p.vy < 0) {
      p.vy = Math.max(p.vy, -c.jumpVel * c.jumpCut);
      p.jumpCutDone = true;
    }

    // --- 중력 ---
    if (!p.onGround) {
      const g = G.CFG.GRAVITY * (p.vy > 0 ? G.CFG.FALL_GRAVITY_MULT : 1);
      p.vy = Math.min(p.vy + g * dt, G.CFG.MAX_FALL);
    }

    // --- 위치 이동 + 바닥/벽 ---
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.y >= G.CFG.GROUND_Y) {
      if (!p.onGround) p.landTimer = c.landTime; // 막 착지함
      p.y = G.CFG.GROUND_Y; p.vy = 0; p.onGround = true;
    } else {
      p.onGround = false;
    }
    const minX = c.halfWidth, maxX = G.CFG.ARENA_W - c.halfWidth;
    if (p.x < minX) { p.x = minX; p.vx = 0; }
    if (p.x > maxX) { p.x = maxX; p.vx = 0; }

    p.landTimer = Math.max(0, p.landTimer - dt);
  }

  // 화면 프레임마다: 상태에 맞는 동작 고르고 뼈대 계산
  function animate(p, dt) {
    const c = C();
    let speed = 1;
    if (!p.onGround) p.state = p.vy < 0 ? 'jump' : 'fall';
    else if (p.landTimer > 0 && Math.abs(p.vx) < 30) p.state = 'land';
    else if (Math.abs(p.vx) > 15) {
      p.state = 'run';
      speed = Math.max(0.45, Math.abs(p.vx) / c.maxSpeed);
    } else p.state = 'idle';

    p.anim.play(p.state);
    p.anim.update(dt, speed);
    p.joints = G.Rig.compute(SKELETON, p.anim.pose, p.onGround);
  }

  function draw(ctx, p) {
    const air = Math.min(1, (G.CFG.GROUND_Y - p.y) / 150);
    G.Render.shadow(ctx, p.x, G.CFG.GROUND_Y, 20 * (1 - air * 0.5), 0.45 * (1 - air * 0.6));
    G.Render.drawRig(ctx, p.joints, SKIN, ORDER, p.x, p.y, p.facing);
    if (G.CFG.debug) G.Render.drawJoints(ctx, p.joints, p.x, p.y, p.facing);
  }

  return { create, step, animate, draw };
})();
