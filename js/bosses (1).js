// =====================================================================
// bosses.js — 보스 데이터 (층마다 하나씩 추가)
//
// 새 보스를 만들 때 이 파일에 항목 하나를 추가합니다.
//   body    : 뼈대 길이 (거인형 정면 뼈대 기준)
//   skin    : 파츠별 모양과 색. img 파일이 있으면 그 그림을, 없으면 도형을 그림
//             (img 규칙은 render.js 맨 위 설명 참고)
//   theme   : 배경 분위기
//   patterns: 사용하는 공격 패턴과 수치 (패턴 동작은 boss.js)
//   phase2  : 체력이 일정 이하일 때 바뀌는 수치
// =====================================================================
G.BossDefs = {

  // ------------------------------------------------------------------
  // 1층 — 판: 숲과 야생, 공포(panic)의 신. 염소 뿔과 귀, 수염
  // ------------------------------------------------------------------
  pan: {
    floor: 1,
    name: '판',
    title: '숲과 공포의 신',
    hp: 320,

    // shoulderDrop: 몸통 꼭대기(목)에서 어깨 관절까지 내려온 거리 — 그림의 어깨 위치에 맞춤
    body: { torso: 180, head: 123, armUp: 134, armLow: 141, shoulderX: 91, shoulderDrop: 52, hipBelowEdge: 48 },
    restHands: [{ dx: -255, z: 66 }, { dx: 255, z: 66 }],   // 쉴 때 손 위치 (보스 중심 기준 x, 깊이 z)
    fist: { r: 34 },                                         // 주먹 크기 (그림자·판정용)

    skin: {
      torso:    { shape: 'beastTorso', w1: 118, w2: 196, color: '#8b6a4e', shade: '#6d5139', fur: '#5a4330', leaf: '#5e8a3a',
                  img: 'assets/bosses/pan/torso.png', anchor: 'bottom', lenMul: 1.01 },
      head:     { shape: 'hornedHead', r: 46, color: '#987657', horn: '#d8c7a3', beard: '#5a4330', eye: '#9dff7a',
                  img: 'assets/bosses/pan/head.png', anchor: 'bottom', lenMul: 1.36, offset: [0, 42] },
      armL_up:  { shape: 'capsule', w1: 60, w2: 50, color: '#7d5f45', lineW: 3,
                  img: 'assets/bosses/pan/arm_up.png', anchor: 'top', lenMul: 1.12, widthMul: 1.45, offset: [0, -12] },
      armR_up:  { shape: 'capsule', w1: 60, w2: 50, color: '#7d5f45', lineW: 3,
                  img: 'assets/bosses/pan/arm_up.png', anchor: 'top', lenMul: 1.12, widthMul: 1.45, offset: [0, -12], mirror: true },
      armL_low: { shape: 'beastArm', w1: 52, w2: 62, color: '#6e523b', finger: '#7d5f45',
                  img: 'assets/bosses/pan/arm_low.png', anchor: 'top', lenMul: 1.27, widthMul: 1.35, offset: [0, -12] },
      armR_low: { shape: 'beastArm', w1: 52, w2: 62, color: '#6e523b', finger: '#7d5f45',
                  img: 'assets/bosses/pan/arm_low.png', anchor: 'top', lenMul: 1.27, widthMul: 1.35, offset: [0, -12], mirror: true },
    },

    theme: {
      bg: 'assets/bosses/pan/bg.jpg',          // 배경 그림 (없으면 아래 색으로 그림)
      sky: ['#07100c', '#173024', '#0b120e'],
      moon: '210, 255, 200',
      silhouette: 'trees',
    },

    patterns: {
      // 손바닥 내려찍기: 예고 → 손 들기(플레이어 추적) → 내려침 → 손이 박힘(때릴 기회) → 복귀
      slam: {
        weight: 2,         // 패턴이 뽑힐 확률 비중
        telegraph: 0.95,   // 예고 시간 (이 동안 피하면 됨)
        track: 0.6,        // 예고 시간 중 앞부분 이 비율 동안은 플레이어를 따라감
        lift: 140,         // 손을 드는 높이
        drop: 0.12,        // 내려치는 시간
        stuck: 1.7,        // 손이 바닥에 박혀 있는 시간 (공격 기회)
        recover: 0.55,     // 손이 돌아가는 시간
        rest: 1.1,         // 다음 공격까지 쉬는 시간
        dmg: 25,           // 플레이어가 맞으면 받는 피해
        radius: 64,        // 충격 범위 (가로 반지름, 깊이는 0.55배)
      },
      // 피리 충격파: 두 손으로 피리를 불면 소리 고리가 보스 쪽에서 퍼져 나옴 → 점프로 넘기
      flute: {
        weight: 1,
        telegraph: 0.9,    // 피리를 입에 대고 숨 들이쉬는 시간
        rings: 3,          // 고리 개수
        gap: 0.5,          // 고리 사이 간격(초)
        speed: 270,        // 고리 퍼지는 속도
        band: 16,          // 고리 두께 (이 안에 있으면 맞음)
        squash: 1.6,       // 깊이 방향으로 납작한 정도
        safeHeight: 30,    // 이 높이 이상 뛰어 있으면 안 맞음
        dmg: 15,
        rest: 1.0,
      },
      // 가시덩굴: 땅을 짚으면 바닥 줄(깊이별) 몇 개에 덩굴이 솟음 → 안전한 줄로 이동
      vines: {
        weight: 1,
        telegraph: 1.0,    // 줄 예고 시간
        active: 0.7,       // 덩굴이 솟아 있는 시간
        lanes: 4,          // 바닥을 깊이별로 나눈 줄 수
        hitLanes: 2,       // 그중 덩굴이 솟는 줄 수
        height: 42,        // 덩굴 높이 (이보다 높이 있으면 안 맞음)
        dmg: 20,
        rest: 1.0,
      },
    },

    // 체력 50% 이하: 더 빠르고 강해짐 (패턴별로 덮어쓸 수치)
    phase2: {
      at: 0.5,
      slam:  { telegraph: 0.7, stuck: 1.25, rest: 0.55, double: true },
      flute: { rings: 4, gap: 0.38, rest: 0.7 },
      vines: { hitLanes: 3, telegraph: 0.85, rest: 0.7 },
    },
  },
};
