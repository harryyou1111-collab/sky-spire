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
  // 1층 — 탑의 문지기: 첫 번째 문을 지키는 돌 골렘. 처음 오르는 자를 위한 연습 상대
  //   내려찍기(판과 같은 코드, 더 느리고 약하게)와 낙석 두 가지만 씀
  // ------------------------------------------------------------------
  golem: {
    floor: 1,
    name: '탑의 문지기',
    title: '첫 번째 문을 지키는 자',
    reward: { skill: 'stone_skin' },   // 처음 쓰러뜨리면 스킬 '석화' (skills.js)
    hp: 340,

    // 영상 3개(내려찍기·두 주먹·깨어나기)를 모두 같은 크기·기준점으로 맞춰 둠 → 위치 정보가 다 같음
    poseScale: 0.55,     // 장면 1픽셀 = 게임 몇 단위 (쉬는 자세 너비 600픽셀 ≈ 330)
    baseX: 450,
    baseZ: 6,
    handHit: { w: 90, h: 70 },
    mist: 46,
    mistWidth: 360,
    roarGlow: { eyes: [[294, 146], [329, 146]] },  // 두 눈 (입 없음)
    // 처음 만날 때 나오는 대화 장면 (talk.js). voice: ElevenLabs 목소리 파일을 넣으면 재생
    talk: {
      bg: 'assets/bosses/golem/bg.jpg',
      cast: {
        golem: { name: '탑의 문지기', side: 'back', faces: { sleep: 'assets/story/golem_sleep.webp', awake: 'assets/story/golem_awake.webp' } },
        hero:  { name: '홀로 오르는 자', side: 'left', flip: true, faces: { base: 'assets/story/hero_base.webp', serious: 'assets/story/hero_serious.webp', tired: 'assets/story/hero_tired.webp' } },
      },
      lines: [
        { who: 'golem', face: 'sleep', text: '…오랜만이군. 발소리가 들린 것은.', voice: 'assets/story/voice/golem_01.mp3' },
        { who: 'golem', face: 'awake', text: '이 탑을 오르려는 자여.', flash: true, shake: true, voice: 'assets/story/voice/golem_02.mp3', voiceDelay: 0.3 },
        { who: 'golem', text: '첫 번째 문은, 나를 쓰러뜨린 자에게만 열린다.', voice: 'assets/story/voice/golem_03.mp3' },
        { who: 'hero', face: 'serious', text: '…그럼 쓰러뜨리면 되겠군.', voice: 'assets/story/voice/hero_04.mp3' },
        { who: 'golem', text: '증명해 보아라.', shake: true, sfx: 'smash', voice: 'assets/story/voice/golem_05.mp3', voiceDelay: 0.35 },
      ],
    },
    // 처음 쓰러뜨렸을 때 대화 (talk.js) → 끝나면 결과 화면 (스킬 '석화' 획득). 4번째 대사 때 번쩍
    talkWin: {
      bg: 'assets/bosses/golem/bg.jpg',
      cast: {
        golem: { name: '탑의 문지기', side: 'back', faces: { sleep: 'assets/story/golem_sleep.webp', awake: 'assets/story/golem_awake.webp' } },
        hero:  { name: '홀로 오르는 자', side: 'left', flip: true, faces: { base: 'assets/story/hero_base.webp', serious: 'assets/story/hero_serious.webp', tired: 'assets/story/hero_tired.webp' } },
      },
      lines: [
        { who: 'golem', face: 'awake', text: '…훌륭하다.', voice: 'assets/story/voice/golem_w1.mp3' },
        { who: 'golem', text: '수많은 자들이 이 문 앞에서 무릎을 꿇었다. 끝까지 일어선 자는, 네가 처음이군.', voice: 'assets/story/voice/golem_w2.mp3' },
        { who: 'hero', face: 'tired', text: '이제 비켜줄 건가.', voice: 'assets/story/voice/hero_w3.mp3' },
        { who: 'golem', text: '후후. 가져가라. 이 돌의 힘이 네 길을 지켜줄 것이다.', voice: 'assets/story/voice/golem_w4.mp3', flash: true },
        { who: 'golem', face: 'sleep', text: '행운을 빌지, 홀로 오르는 자여. 위에서 기다리는 것들은, 나보다 가혹하다.', voice: 'assets/story/voice/golem_w5.mp3' },
      ],
    },
    // 질 때마다 하는 말 (이 층에서 진 횟수 → 대사. 사이 횟수는 바로 앞 대사) / 쓰러졌을 때 하는 말
    lines: {
      lose: { 1: '그 정도로는 이 문을 지날 수 없다.', 2: '다시 오는가. 좋다.', 3: '…또 왔나.', 5: '쓰러질 때마다 눈빛이 달라지는군.', 10: '포기를 모르는 자. 그것 또한 힘이다.' },
      win: '…가라. 위에서 기다리는 것들은 나보다 가혹하다.',
    },
    intro: {
      rise: 'wakeclip',  // 등장 연출: 석상처럼 잠든 자세에서 깨어남
      // 깨어나는 영상이 길어서 시간표를 늘림 (intro.js의 FULL을 덮어씀)
      full: { pan: [0.4, 1.4], rise: [0.5, 3.3], roar: 3.4, card: [3.65, 5.6], back: [5.0, 5.8], end: 5.9 },
    },
    poses: {
      idle:      { clip: 'slam', frame: 0 },
      slamclip:  { clip: 'slam' },
      poundclip: { clip: 'pound' },
      wakeclip:  { clip: 'wake' },
    },
    clips: {
      // 내려찍기: 화면 왼쪽 팔을 치켜들어 앞쪽 땅을 내리침 → 주먹이 박혀 있음 → 복귀 (Kling)
      slam: {
        sheets: [0, 1, 2, 3].map(i => `assets/bosses/golem/slam_${i}.webp`),
        fw: 620, fh: 484, cols: 4, per: 16, cx: 310, bottom: 475, hand: [215, 455],
        seg: { raise: [1, 12], drop: [12, 23], stuck: [23, 37], recover: [37, 54] },
      },
      // 두 주먹: 양 주먹을 들어 동시에 땅을 침 → 처음 자세로 (Vidu)
      pound: {
        sheets: [0, 1, 2, 3].map(i => `assets/bosses/golem/pound_${i}.webp`),
        fw: 620, fh: 484, cols: 4, per: 16, cx: 310, bottom: 475,
        hands: [[115, 470], [505, 470]],
        seg: { raise: [0, 20], drop: [20, 34], settle: [34, 54] },
      },
      // 깨어나기: 고개를 숙인 석상 → 고개를 들고 룬과 눈에 불이 켜짐 (Kling, 마지막 장면 = 쉬는 자세)
      wake: {
        sheets: [0, 1].map(i => `assets/bosses/golem/wake_${i}.webp`),
        fw: 620, fh: 484, cols: 4, per: 16, cx: 310, bottom: 475,
        seg: { up: [0, 31] },
      },
    },

    theme: {
      bg: 'assets/bosses/golem/bg.jpg',        // 탑 1층 대전당 (가운데 큰 문)
      horizon: 0.62,
      sky: ['#0d1420', '#2a3d5c', '#101722'],
      moon: '170, 210, 255',                   // 보스 뒤 기운·안개 빛
      glow: '120, 200, 255',                   // 눈 빛 (없으면 초록)
      crack: ['110, 190, 255', '160, 215, 255'],   // 갈라진 땅 빛 (없으면 초록)
      leaves: false,                           // 등장 연출 때 잎을 흩날리지 않음
      dust: '120, 120, 125',                   // 등장 연출 먼지 색
      silhouette: 'none',
      ground: { far: '#15181d', near: '#2a2e35', line: '#3c424b', front: '#0d0f12', wall: '#07080a',
                side: ['#22262d', '#3a3f48', '#1d2026'], top: '#4c525c', rim: '#7d8796' },
    },

    patterns: {
      // 내려찍기: 판과 같은 패턴 (예고 줄을 보고 옆으로 피한 뒤, 박힌 주먹을 때리기)
      slam: {
        weight: 2,
        telegraph: 1.0, track: 0.65, drop: 0.24, stuck: 1.6, recover: 0.85, rest: 0.9,
        dmg: 22, radius: 64, width: 46, reach: 900,
      },
      // 낙석: 두 주먹으로 땅을 치면 천장에서 돌이 떨어짐 → 바닥의 붉은 원(돌 그림자)을 피하기
      //   하나는 항상 플레이어 자리에 떨어짐. waves: 몇 번에 나눠 떨어지는지
      quake: {
        weight: 1,
        telegraph: 1.1,    // 두 주먹을 드는 시간
        drop: 0.5,         // 내려치는 시간
        settle: 1.4,       // 처음 자세로 돌아가는 시간 (영상)
        rocks: 8,          // 한 번에 떨어지는 돌 수
        fall: 0.95,        // 붉은 원이 생기고 돌이 땅에 닿기까지
        radius: 52,        // 돌 크기 (이 안에 있으면 맞음)
        waves: 1, waveGap: 0.8,
        shock: 60, shockDmg: 12,   // 주먹 바로 앞 충격 (가까이 붙어 있으면 맞음)
        dmg: 20,
        rest: 0.9,
      },
    },

    // 체력 50% 이하: 더 빨라지고, 내려찍기 연속 2번, 낙석이 두 번에 나눠 떨어짐
    phase2: {
      at: 0.5,
      slam:  { telegraph: 0.8, stuck: 1.2, recover: 0.7, rest: 0.5, double: true },
      quake: { rocks: 9, radius: 56, waves: 2, waveGap: 0.65, fall: 0.85, rest: 0.6 },
    },
  },

  // ------------------------------------------------------------------
  // 2층 — 칼리돈의 멧돼지: 수많은 사냥꾼을 쓰러뜨린 거대한 멧돼지. 전투장을 뛰어다니는 보스 (beast.js)
  //   돌진을 옆으로 피해 바위·벽에 부딪히게 만들면 기절 → 공격 기회
  // ------------------------------------------------------------------
  boar: {
    kind: 'beast',
    floor: 2,
    name: '칼리돈의 멧돼지',
    title: '사냥꾼들을 삼킨 짐승',
    reward: { equip: 'boar_tusk' },   // 처음 쓰러뜨리면 장신구 '칼리돈의 엄니' (items.js)
    // 대화 장면 (talk.js): 멧돼지는 말을 못 하니 울음과 화면 흔들림으로 대답. 주인공 목소리만
    talk: {
      bg: 'assets/bosses/boar/bg.jpg',
      cast: {
        boar: { name: '칼리돈의 멧돼지', side: 'back', flip: true, faces: { base: 'assets/story/boar.webp' } },
        hero: { name: '홀로 오르는 자', side: 'left', flip: true, faces: { base: 'assets/story/hero_base.webp', serious: 'assets/story/hero_serious.webp', tired: 'assets/story/hero_tired.webp' } },
      },
      lines: [
        { who: 'hero', face: 'serious', text: '사냥터라기보단, 무덤이군.', voice: 'assets/story/voice/hero_b1.mp3' },
        { who: 'boar', face: 'base', text: '크르르르…!', sfx: 'boar_roar', shake: true },
        { who: 'hero', text: '덤벼.', voice: 'assets/story/voice/hero_b2.mp3' },
      ],
    },
    talkWin: {
      bg: 'assets/bosses/boar/bg.jpg',
      cast: {
        boar: { name: '칼리돈의 멧돼지', side: 'back', flip: true, faces: { base: 'assets/story/boar.webp' } },
        hero: { name: '홀로 오르는 자', side: 'left', flip: true, faces: { base: 'assets/story/hero_base.webp', serious: 'assets/story/hero_serious.webp', tired: 'assets/story/hero_tired.webp' } },
      },
      lines: [
        { who: 'hero', face: 'tired', text: '정면으로 받아내긴… 무리였어.', voice: 'assets/story/voice/hero_b3.mp3' },
        { who: 'hero', face: 'base', text: '끝까지 물러서지 않았군. 이건 가져가지.', voice: 'assets/story/voice/hero_b4.mp3', flash: true },
      ],
    },
    hp: 420,
    start: { x: 700, z: 60, face: -1 },
    baseX: 700, baseZ: 60,          // 등장 연출 카메라가 볼 곳
    poses: {},
    scale: 0.62,                    // 시트 1픽셀 = 게임 몇 단위 (몸길이 ≈ 290)
    hit: { w: 230, h: 165 },        // 맞는 범위·부딪히는 범위 (가로, 높이)
    roar: 'boar_roar',              // 울음소리 (sound.js). 등장·돌진·쓰러질 때
    // rim: 'rgba(255, 170, 90, .55)', // 몸 테두리 빛 (폰에서 느려질 수 있어 꺼 둠. 바닥을 밝게 해서 구분됨)
    // 영상 시트: 모두 같은 자리·크기로 맞춤 (Dreamina). fw·fh 한 장면 크기, cx·bottom 발 가운데
    clips: {
      idle: { sheets: [0, 1].map(i => `assets/bosses/boar/idle_${i}.webp`), count: 31, fw: 620, fh: 330, cx: 302.5, bottom: 318.5 },
      run:  { sheets: [0, 1].map(i => `assets/bosses/boar/run_${i}.webp`), count: 20, fw: 620, fh: 330, cx: 302.5, bottom: 318.5 },
      stun: { sheets: [0, 1, 2].map(i => `assets/bosses/boar/stun_${i}.webp`), count: 41, fw: 620, fh: 330, cx: 302.5, bottom: 318.5,
              seg: { hit: [0, 3], dazed: [3, 29], recover: [29, 40] } },
      tusk: { sheets: [0, 1, 2].map(i => `assets/bosses/boar/tusk_${i}.webp`), count: 43, fw: 620, fh: 330, cx: 302.5, bottom: 318.5,
              seg: { lower: [0, 18], strike: [19, 29], recover: [29, 42] } },
    },
    theme: {
      bg: 'assets/bosses/boar/bg.jpg',          // 가을 사냥터
      horizon: 0.60,
      sky: ['#2a1a12', '#7a4a2a', '#1e140e'],
      moon: '255, 190, 120',
      leaves: false,
      dust: '140, 105, 70',
      silhouette: 'none',
      // 바닥은 멧돼지(어두운 갈색)보다 밝은 흙색
      ground: { far: '#4a3626', near: '#6e5236', line: '#7d5f3e', front: '#24180f', wall: '#120c07',
                side: ['#3b2a1c', '#5a4129', '#33251a'], top: '#7a5c3c', rim: '#a07a4e' },
      // 몹 구간에서 구역을 막는 벽: 사냥용 나무 목책
      wall: { src: 'assets/props/fence.webp', w: 179, h: 300, height: 92 },
    },
    patterns: {
      // 돌진: 예고 줄을 보고 옆으로 피하기. 바위에 부딪히면 오래 기절, 벽은 짧게
      //   기술을 쓰는 중(돌진 준비·돌진·엄니)에는 공격이 막힘 → 쉬는 틈이나 기절했을 때만 때릴 수 있음
      //   stunPlayer: 돌진에 맞으면 주인공이 그 시간(초) 동안 기절
      charge: { weight: 3, telegraph: 0.9, track: 0.6, speed: 760, width: 70, dmg: 24, stunPlayer: 2,
                stunWall: 1.3, stunRock: 2.6, rest: 0.8, bounce: 0, bounceTelegraph: 0.55 },
      // 엄니 올려치기: 앞에 붙어 있으면. 예고(앞쪽 붉은 반원)를 보고 물러나기
      tusk: { weight: 1, range: 190, windup: 0.55, strike: 0.22, recover: 0.55, dmg: 20, rest: 0.6 },
    },
    // 체력 50% 이하: 더 빠르고, 벽에 부딪혀도 한 번 되돌아 돌진
    phase2: {
      at: 0.5,
      charge: { telegraph: 0.75, speed: 900, bounce: 1, stunWall: 1.0, rest: 0.5 },
      tusk: { windup: 0.4, rest: 0.4 },
    },
    // 광폭화 (체력 20% 이하): 몸이 붉게 달아오르고 거의 쉬지 않고 돌진 (돌진은 한 번에 최대 2번: 벽에 부딪히면 한 번 되돌아옴)
    //   바위에 부딪히면 여전히 기절하지만 짧음 → 남은 바위를 아껴 두는 게 중요
    rage: {
      at: 0.2,
      charge: { telegraph: 0.6, speed: 1050, bounce: 1, bounceTelegraph: 0.45, stunWall: 0.6, stunRock: 1.7, rest: 0.15 },
      tusk: { windup: 0.3, rest: 0.2 },
    },
  },

  // ------------------------------------------------------------------
  // 8층 — 판: 숲과 야생, 공포(panic)의 신. 염소 뿔과 귀, 수염 (처음엔 1층 보스였음)
  // ------------------------------------------------------------------
  pan: {
    floor: 8,
    name: '판',
    reward: { equip: 'pan_hornblade' },   // 처음 쓰러뜨리면 받는 보상 (items.js). 스킬을 주는 보스는 { skill: 'id' }
    title: '숲과 공포의 신',
    hp: 320,

    // ---------- 자세 그림 ----------
    // 동작마다 통째로 그린 그림 한 장. 코드는 그림을 옮기고·뒤집고·숨쉬게만 함
    //   cx: 그림 속 얼굴(몸 중심) 가로 위치(픽셀), bottom: 그림 속 땅에 닿는 선(픽셀)
    //   scale: 그림마다 캐릭터 크기가 다를 때 보정, hand: 내려친 손 위치, glow: 피리 끝
    poseScale: 0.43,     // 그림 1픽셀 = 게임 몇 단위 (idle 기준 키 ≈ 235)
    baseX: 450,          // 보스가 서 있는 가로 위치 (전투장 가운데)
    baseZ: 6,            // 보스가 서 있는 깊이 (맨 안쪽)
    handHit: { w: 80, h: 60 },   // 박힌 손을 때릴 수 있는 범위
    mist: 46,            // 발밑 안개 높이 (그림이 끝나는 허리선을 가림)
    mistWidth: 330,      // 발밑 안개 가로 반지름
    // 포효 때 빛나는 곳 (쉬는 자세 그림 속 픽셀): 두 눈, 입
    roarGlow: { eyes: [[258, 152], [285, 152]], mouth: [272, 186] },
    poses: {
      idle:       { clip: 'slam', frame: 0 },      // 내려찍기 영상의 첫 장면 = 쉬는 자세 (영상과 이어지게)
      slamclip:   { clip: 'slam' },                // 내려찍기 영상 재생 중
      vinesclip:  { clip: 'vines' },               // 가시덩굴 영상 재생 중
      riseclip:   { clip: 'rise' },                // 가시덩굴 뒤 웅크린 자세에서 일어나기
    },

    // ---------- 동작 영상 ----------
    // AI 영상(Kling)을 장면별로 쪼개 시트로 모은 것. 시트 하나에 4x4=16장면
    //   fw, fh: 한 장면 크기(픽셀), cx/bottom/hand: 장면 속 위치(픽셀), scale: 자세 그림 대비 크기
    //   seg: 게임 단계별로 재생할 장면 구간 [시작, 끝]
    clips: {
      slam: {
        sheets: [0, 1, 2, 3, 4].map(i => `assets/bosses/pan/slam_${i}.webp`),
        fw: 670, fh: 434, cols: 4, per: 16,
        cx: 272, bottom: 408, scale: 1.473, hand: [403, 397],
        seg: { raise: [1, 22], drop: [22, 30], stuck: [30, 48], recover: [48, 69] },
      },
      // 가시덩굴: 두 팔을 들었다가 양손으로 땅을 내리침. 영상 뒷부분(다시 팔을 드는 동작)은 잘라냄
      vines: {
        sheets: [0, 1, 2].map(i => `assets/bosses/pan/vines_${i}.webp`),
        fw: 620, fh: 553, cols: 4, per: 16,
        cx: 303, bottom: 530, scale: 1.472,
        glow: [[65, 525], [539, 525]],               // 두 손
        seg: { raise: [0, 14], drop: [14, 20], crouch: [20, 35] },
      },
      // 일어나기: 가시덩굴 영상의 웅크린 장면 → 쉬는 자세 (따로 만든 영상, 위치·크기는 가시덩굴과 같음)
      rise: {
        sheets: [0, 1].map(i => `assets/bosses/pan/rise_${i}.webp`),
        fw: 620, fh: 553, cols: 4, per: 16,
        cx: 303, bottom: 530, scale: 1.472,
        seg: { up: [0, 30] },
      },
    },

    theme: {
      bg: 'assets/bosses/pan/bg.jpg',          // 배경 그림 (없으면 아래 색으로 그림)
      horizon: 0.64,                           // 배경 그림에서 땅이 시작되는 높이 (위에서부터 비율)
      sky: ['#07100c', '#173024', '#0b120e'],
      moon: '210, 255, 200',
      silhouette: 'trees',
      // 이끼 낀 숲 폐허 바닥과 기둥
      ground: { tex: 'assets/bosses/pan/ground.jpg', texScale: 0.42, texSquash: 0.5,   // 바닥 그림 (없으면 색으로)
                far: '#121a14', near: '#26301f', line: '#3b4a30', front: '#0c120d', wall: '#060a07',
                side: ['#1f281c', '#37442f', '#1c2419'], top: '#46553a', rim: '#6a7d52' },
    },

    patterns: {
      // 내려찍기: 팔을 듦(예고: 손에서 플레이어 쪽으로 붉은 줄, 앞부분 동안 따라옴) → 내려침 → 줄을 따라 땅이 갈라짐
      //           → 손이 박힘(때릴 기회) → 복귀. 예고 줄을 보고 옆으로 피하기
      slam: {
        weight: 2,         // 패턴이 뽑힐 확률 비중
        telegraph: 0.95,   // 예고 시간 (이 동안 피하면 됨)
        track: 0.6,        // 예고 시간 중 앞부분 이 비율 동안은 플레이어를 따라감
        drop: 0.12,        // 내려치는 시간
        stuck: 1.7,        // 손이 바닥에 박혀 있는 시간 (공격 기회)
        recover: 0.85,     // 손이 돌아가는 시간 (영상의 복귀 동작 재생)
        rest: 0.8,         // 다음 공격까지 쉬는 시간
        dmg: 25,           // 플레이어가 맞으면 받는 피해
        radius: 64,        // 손 주변 충격 범위
        width: 44,         // 균열 폭 (이 안에 있으면 맞음)
        reach: 900,        // 균열이 뻗는 최대 거리
      },
      // 공포의 포효 (판 = panic의 어원): 숨을 들이쉬고 포효하면 소리 고리가 보스 쪽에서 퍼져 나옴 → 점프로 넘기
      roar: {
        weight: 1,
        telegraph: 0.9,    // 숨을 크게 들이쉬는 시간 (몸이 부풀고 눈이 빛남)
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
        drop: 0.14,        // 두 손을 내리치는 시간 (예고 끝에 땅에 닿음)
        rise: 0.6,         // 웅크린 자세에서 일어나는 시간 (영상 재생)
        dmg: 20,
        rest: 0.5,         // (일어나는 0.6초가 늘어난 만큼 줄임)
      },
    },

    // 체력 50% 이하: 더 빠르고 강해짐 (패턴별로 덮어쓸 수치)
    phase2: {
      at: 0.5,
      slam:  { telegraph: 0.7, stuck: 1.25, recover: 0.7, rest: 0.35, double: true },
      roar:  { rings: 4, gap: 0.38, rest: 0.7 },
      vines: { hitLanes: 3, telegraph: 0.85, rest: 0.25 },
    },
  },
};
