// =====================================================================
// boss.js — 배경을 채우는 거대 보스 (지금은 보여주기용: 숨쉬기 동작만)
//
// 보스는 전투장 뒤 낭떠러지에서 상반신을 내밀고, 두 손으로 바닥을 짚고 있습니다.
// 플레이어(옆모습)와 달리 "정면" 뼈대를 씁니다. 리그 계산(rig.js)과
// 도형/이미지 그리기(render.js)는 플레이어와 같은 방식이라, 나중에
// 일러스트 파츠로 교체할 수 있습니다.
//
// 공격 패턴, 피격, 체력 감소는 다음 단계(1-3)에서 추가합니다.
// =====================================================================
G.Boss = (function () {
  const D2R = Math.PI / 180;

  // ---------- 정면 뼈대 (단위: 게임 단위) ----------
  // 각 뼈: parent, at = 부모 기준 붙는 위치 [옆, 길이 방향], rest = 기본 각도
  // 몸통 좌표계는 위를 향하므로, 몸통 기준 +옆 = 화면 왼쪽
  const L = { torso: 150, head: 92, armUp: 100, armLow: 104 };
  const SKELETON = {
    hipHeight: 0, footPad: 0,
    bones: [
      { name: 'hip',      parent: null,      at: [0, 0],               rest: 0,       len: 0 },
      { name: 'torso',    parent: 'hip',     at: [0, 0],               rest: Math.PI, len: L.torso },
      { name: 'head',     parent: 'torso',   at: [0, L.torso - 6],     rest: 0,       len: L.head },
      { name: 'armL_up',  parent: 'torso',   at: [78, L.torso - 22],   rest: Math.PI, len: L.armUp },
      { name: 'armL_low', parent: 'armL_up', at: [0, L.armUp],         rest: 0,       len: L.armLow },
      { name: 'armR_up',  parent: 'torso',   at: [-78, L.torso - 22],  rest: Math.PI, len: L.armUp },
      { name: 'armR_low', parent: 'armR_up', at: [0, L.armUp],         rest: 0,       len: L.armLow },
    ],
  };

  // 바닥선 뒤에 가려지는 부분 / 바닥 위로 나오는 부분
  const BACK_ORDER = ['torso', 'armL_up', 'armR_up', 'head'];
  const FRONT_ORDER = ['armL_low', 'armR_low'];

  // ---------- 임시 도형 스킨 (2단계에서 일러스트로 교체) ----------
  const STONE = '#6a6372', STONE_D = '#4c4654', GLOW = '#ffb347';
  const SKIN = {
    torso:    { shape: 'golemTorso', w1: 120, w2: 190, color: STONE, glow: GLOW },
    head:     { shape: 'golemHead',  r: 42, color: '#77707f', glow: GLOW },
    armL_up:  { shape: 'capsule', w1: 58, w2: 48, color: STONE_D, lineW: 3 },
    armR_up:  { shape: 'capsule', w1: 58, w2: 48, color: STONE_D, lineW: 3 },
    armL_low: { shape: 'capsule', w1: 50, w2: 66, color: STONE, lineW: 3 },
    armR_low: { shape: 'capsule', w1: 50, w2: 66, color: STONE, lineW: 3 },
  };

  // ---------- 동작: 숨쉬기 (양팔 대칭, 각도 규칙은 rig.js 맨 위 참고) ----------
  // 왼팔(+)은 시계 방향으로 벌어지고, 오른팔은 반대 부호
  const breathe = (t, hipY, lean, armOut, elbow, headTilt) =>
    ({ t, p: { hipY, torso: lean, head: headTilt,
               armL_up: armOut, armL_low: -elbow, armR_up: -armOut, armR_low: elbow } });
  const CLIPS = {
    idle: { dur: 3.2, loop: true, keys: [
      breathe(0,   0,  0,   54, 4, 0),
      breathe(1.6, -6, -2,  52, 2, -3),
    ] },
  };

  const boss = {
    name: '무너진 석상 수문장',
    hp: 1000, maxHp: 1000,
    x: 0, y: 0,            // 골반 위치 (화면 좌표, 바닥선 아래에 숨겨짐)
    anim: new G.Rig.Animator(CLIPS),
    joints: null,
    time: 0,
  };

  function place() {
    boss.x = G.CFG.ARENA_W / 2;
    boss.y = G.Stage.floorY(0) + 40;   // 골반은 바닥선 아래 → 상반신만 보임
  }

  function update(dt) {
    boss.time += dt;
    boss.anim.play('idle');
    boss.anim.update(dt);
    boss.joints = G.Rig.compute(SKELETON, boss.anim.pose, false);
  }

  // 낭떠러지 뒤에 있는 몸통·머리 (바닥보다 먼저 그림)
  function drawBack(ctx) {
    if (!boss.joints) return;
    SKIN.head.pulse = SKIN.torso.pulse = 0.65 + 0.35 * Math.sin(boss.time * 2.2);
    // 바닥 뒤쪽 아지랑이 그림자
    const g = ctx.createRadialGradient(boss.x, boss.y - 150, 40, boss.x, boss.y - 150, 330);
    g.addColorStop(0, 'rgba(255, 150, 60, 0.10)');
    g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(boss.x - 340, boss.y - 480, 680, 480);
    G.Render.drawRig(ctx, boss.joints, SKIN, BACK_ORDER, boss.x, boss.y, 1);
  }

  // 바닥을 짚은 아래팔·주먹 (바닥 위에, 다른 것들보다는 먼저 그림)
  function drawFront(ctx) {
    if (!boss.joints) return;
    // 주먹 아래 그림자
    for (const k of ['armL_low', 'armR_low']) {
      const t = G.Rig.tip(boss.joints[k]);
      G.Render.shadow(ctx, boss.x + t.x, boss.y + t.y + 14, 46, 0.5);
    }
    G.Render.drawRig(ctx, boss.joints, SKIN, FRONT_ORDER, boss.x, boss.y, 1);
  }

  // 화면 위쪽 보스 이름·체력 표시
  const bar = document.getElementById('boss-bar');
  function updateUI() {
    if (!bar) return;
    bar.querySelector('.name').textContent = boss.name;
    bar.querySelector('.fill').style.width = (boss.hp / boss.maxHp * 100) + '%';
  }

  return { state: boss, place, update, drawBack, drawFront, updateUI };
})();
