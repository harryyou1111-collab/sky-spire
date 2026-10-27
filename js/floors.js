// =====================================================================
// floors.js — 층 구성과 일반 몹 데이터
//
// 층마다: 몹 구간(여러 번에 나눠 등장) → 다 잡으면 보스방 문이 열림 → 보스전
//   waves : 한 번에 나오는 몹 묶음들. 앞 묶음을 다 잡으면 다음 묶음이 나옴
//           { type: 몹 종류, n: 마리 수 }
//   boss  : bosses.js의 보스 이름
// 몹은 구역(10층)마다 3~4종을 같이 쓰고, 층이 오를수록 강화(power)만 올림
// =====================================================================
G.Floors = {
  1: {
    boss: 'pan',
    power: 1,                               // 몹 체력·공격력 배율 (층이 오를수록 올림)
    waves: [
      [{ type: 'satyr_spear', n: 3 }],
      [{ type: 'satyr_spear', n: 2 }, { type: 'satyr_archer', n: 1 }, { type: 'wisp', n: 1 }],
      [{ type: 'satyr_spear', n: 2 }, { type: 'satyr_archer', n: 2 }, { type: 'wisp', n: 1 }],
    ],
  },
};

// ---------------------------------------------------------------------
// 몹 종류 (1구역: 판의 숲)
//   hp, speed: 체력, 이동 속도
//   range   : 이 거리까지 다가가서 공격 (궁수는 이만큼 거리를 유지)
//   windup  : 공격 예고 시간 (몸이 빛나거나 무기를 당김 → 이때 피하면 됨)
//   active  : 공격 판정 시간,  recover: 공격 뒤 빈틈 (때릴 기회),  cooldown: 다음 공격까지
//   dmg     : 플레이어가 받는 피해
// ---------------------------------------------------------------------
G.MobDefs = {
  // 사티로스 창병: 다가와서 창으로 앞으로 찌름 (찌르며 앞으로 내딛음)
  satyr_spear: {
    name: '사티로스 창병', kind: 'melee',
    hp: 40, speed: 95, w: 30, height: 100,
    range: 55, windup: 0.5, active: 0.15, recover: 0.55, cooldown: 1.1,
    dmg: 10, lunge: 260, reach: 75, thick: 26,
    color: '#7a5a3c', cloth: '#5c3b2a',
  },
  // 사티로스 궁수: 거리를 두고 활을 쏨. 화살은 똑바로 날아감 → 옆으로 비키거나 점프·구르기
  satyr_archer: {
    name: '사티로스 궁수', kind: 'ranged',
    hp: 28, speed: 85, w: 28, height: 96,
    range: 260, windup: 0.75, active: 0.1, recover: 0.4, cooldown: 1.7,
    dmg: 8, arrowSpeed: 430, arrowH: 55,
    color: '#7a5a3c', cloth: '#3f5a2c',
  },
  // 도깨비불: 떠다니다 가까이 오면 부풀어 오르고 터짐 (터지면 사라짐)
  wisp: {
    name: '도깨비불', kind: 'bomber',
    hp: 12, speed: 125, w: 26, height: 40, float: 46,
    range: 70, windup: 0.75, active: 0.12, recover: 0, cooldown: 0,
    dmg: 12, blast: 62,
    color: '#9dff7a',
  },
};
