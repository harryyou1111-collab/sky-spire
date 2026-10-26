// =====================================================================
// bosses.js — 보스 데이터 (층마다 하나씩 추가)
//
// 새 보스를 만들 때 이 파일에 항목 하나를 추가합니다.
//   poses   : 동작별 자세 그림과 위치 (boss.js 맨 위 설명 참고)
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

    // ---------- 자세 그림 ----------
    // 동작마다 통째로 그린 그림 한 장. 코드는 그림을 옮기고·뒤집고·숨쉬게만 함
    //   cx: 그림 속 얼굴(몸 중심) 가로 위치(픽셀), bottom: 그림 속 땅에 닿는 선(픽셀)
    //   scale: 그림마다 캐릭터 크기가 다를 때 보정, hand: 내려친 손 위치, glow: 피리 끝
    poseScale: 0.43,     // 그림 1픽셀 = 게임 몇 단위 (idle 기준 키 ≈ 235)
    baseX: 450,          // 보스가 서 있는 가로 위치 (전투장 가운데)
    baseZ: 6,            // 보스가 서 있는 깊이 (맨 안쪽)
    maxShift: 200,       // 멀리 있는 플레이어를 칠 때 몸이 옮겨가는 최대 거리
    lungeGrow: 0.0015,   // 앞으로 숙일 때 (가까워지니) 커지는 정도
    handHit: { w: 80, h: 60 },   // 박힌 손을 때릴 수 있는 범위
    poses: {
      idle:       { img: 'assets/bosses/pan/pose_idle.png',       cx: 348, bottom: 546, scale: 1 },
      raise:      { img: 'assets/bosses/pan/pose_raise.png',      cx: 307, bottom: 639, scale: 1.02 },
      slam:       { img: 'assets/bosses/pan/pose_slam.png',       cx: 373, bottom: 624, scale: 1.0, hand: [576, 613] },
      press:      { img: 'assets/bosses/pan/pose_press.png',      cx: 348, bottom: 635, scale: 0.8 },
      press_glow: { img: 'assets/bosses/pan/pose_press_glow.png', cx: 349, bottom: 628, scale: 0.8 },
      flute:      { img: 'assets/bosses/pan/pose_flute.png',      cx: 490, bottom: 643, scale: 0.78, glow: [20, 395] },
    },

    theme: {
      bg: 'assets/bosses/pan/bg.jpg',          // 배경 그림 (없으면 아래 색으로 그림)
      horizon: 0.64,                           // 배경 그림에서 땅이 시작되는 높이 (위에서부터 비율)
      sky: ['#07100c', '#173024', '#0b120e'],
      moon: '210, 255, 200',
      silhouette: 'trees',
      // 이끼 낀 숲 폐허 바닥과 기둥
      ground: { far: '#121a14', near: '#26301f', line: '#3b4a30', front: '#0c120d', wall: '#060a07',
                side: ['#1f281c', '#37442f', '#1c2419'], top: '#46553a', rim: '#6a7d52' },
    },

    patterns: {
      // 손바닥 내려찍기: 예고 → 손 들기(플레이어 추적) → 내려침 → 손이 박힘(때릴 기회) → 복귀
      slam: {
        weight: 2,         // 패턴이 뽑힐 확률 비중
        telegraph: 0.95,   // 예고 시간 (이 동안 피하면 됨)
        track: 0.6,        // 예고 시간 중 앞부분 이 비율 동안은 플레이어를 따라감
        lift: 150,         // 손을 드는 높이
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
