// =====================================================================
// items.js — 장비 데이터와 장착 효과
//
// G.Items: 장비 목록. 보스 보상(bosses.js의 reward)이 여기 id를 가리킴
//   slot  : 'weapon'(무기) / 'charm'(장신구)
//   atk   : 공격력 더하기 (모든 베기에)
//   special: 특수 효과 (combat.js가 처리) — thorns: 3타가 맞으면 가시덩굴이 솟아 주변 적에게 추가 피해
//   sword : 무기면 손에 드는 칼 모양 (그림, 윤곽, 길이, 손잡이 위치) — hero3d의 칼 정보와 같은 형식
// G.Equip: 지금 장착한 장비로 계산 (공격력 보너스, 특수 효과, 칼 모양 적용)
// =====================================================================
G.Items = {
  pan_hornblade: {
    name: '판의 뿔검', slot: 'weapon', from: '8F 판',
    icon: 'assets/items/pan_hornblade_icon.webp',
    desc: '숲과 공포의 신이 쥐던 검. 칼날에 감긴 덩굴이 아직 살아 있다.',
    atk: 3,
    special: { kind: 'thorns', dmg: 6, radius: 60, text: '3타가 맞으면 가시덩굴이 솟아 주변 적에게 6 추가 피해' },
    sword: { img: 'assets/items/pan_hornblade.webp', shape: 'assets/items/pan_hornblade.json', len: 1.3, grip: [1700, 258] },
    // 휘두를 때 이펙트 색 (칼날 자국 안쪽, 테두리, 칼끝 궤적, 맞을 때 불꽃) + 잎이 흩날림
    fx: { slash: '120, 255, 110', heavy: '170, 255, 90', edge: '220, 255, 200', trail: '150, 255, 130', spark: '160, 255, 120', leaves: true },
  },
  // 칼리돈의 엄니 (장신구): 체력이 30% 이하로 떨어지면 공격력 50% 증가 — 궁지에 몰린 짐승처럼
  boar_tusk: {
    name: '칼리돈의 엄니', slot: 'charm', from: '2F 칼리돈의 멧돼지',
    icon: 'assets/items/boar_tusk_icon.webp',
    desc: '사냥꾼들을 삼킨 짐승의 부러진 엄니. 궁지에 몰릴수록 피가 끓어오른다.',
    special: { kind: 'frenzy', below: 0.3, mul: 1.5, text: '체력 30% 이하일 때 공격력 50% 증가' },
  },
  // 미노타우로스의 도끼 (무기): 공격력 +3, 3타가 땅을 찍으면 앞으로 충격파. 대신 휘두르는 속도가 15% 느려짐
  mino_axe: {
    name: '미노타우로스의 도끼', slot: 'weapon', from: '4F 미노타우로스',
    icon: 'assets/items/mino_axe_icon.webp',
    desc: '미궁의 괴물이 평생 휘두른 양날 도끼. 무겁지만, 한 번 맞으면 끝이다.',
    atk: 3,
    speed: 0.85,                                        // 공격 속도 배율 (15% 느림)
    special: { kind: 'quake', dmg: 9, range: 320, speed: 650, text: '3타가 땅을 찍어 앞으로 충격파 — 줄에 선 적 모두에게 9 추가 피해 (공격 속도 15% 느림)' },
    // 그림: 도끼날이 왼쪽, 손잡이가 오른쪽 (받은 그림을 좌우 반전). grip은 원본 크기(1760×769) 기준 손잡이 끝 쪽
    sword: { img: 'assets/items/mino_axe.webp', shape: 'assets/items/mino_axe.json', len: 1.3, grip: [1500, 367] },
    fx: { slash: '255, 170, 90', heavy: '255, 120, 60', edge: '255, 230, 200', trail: '255, 150, 80', spark: '255, 180, 100' },
  },
  // 여왕의 깃털 (장신구): 3단 점프 — 어느 층에서든 공중에서 두 번 더 뛰어오름
  //   (공격 속도 효과 swift는 나중 장비에 쓸 수 있게 G.Equip.atkSpeed로 남겨 둠)
  harpy_feather: {
    name: '여왕의 깃털', slot: 'charm', from: '3F 하피 여왕',
    icon: 'assets/items/harpy_feather_icon.webp',
    desc: '하피 여왕의 가장 긴 날개깃. 쥐고 뛰어오르면 바람이 발밑을 받쳐 준다.',
    special: { kind: 'triple', text: '3단 점프 (공중에서 두 번 더 점프)' },
  },
};

G.Equip = (function () {
  const BASE_WEAPON = { name: '기본 검', slot: 'weapon', icon: 'assets/items/basic_sword_icon.webp', desc: '탑에 오를 때부터 들고 있던 평범한 검.' };
  const item = slot => { const id = G.Save.data.equip[slot], it = id && G.Items[id]; return it && it.slot === slot ? it : null; };   // 칸이 바뀐 장비는 무시
  function list() { return ['weapon', 'charm'].map(item).filter(Boolean); }
  function atkBonus() { return list().reduce((n, it) => n + (it.atk || 0), 0); }
  function special(kind) { for (const it of list()) if (it.special && it.special.kind === kind) return it.special; return null; }
  // 장착 / 해제 (같은 걸 다시 누르면 해제)
  function toggle(id) {
    const it = G.Items[id]; if (!it) return;
    const E = G.Save.data.equip;
    E[it.slot] = E[it.slot] === id ? null : id;
    G.Save.save();
    apply();
  }
  // 칸에 장착 (id가 null이면 빼기 → 무기는 기본 검)
  function set(slot, id) {
    G.Save.data.equip[slot] = id || null;
    G.Save.save();
    apply();
  }
  // 손에 든 칼을 장착한 무기로
  function apply() {
    const w = item('weapon');
    if (G.Hero3D && G.Hero3D.setSword) G.Hero3D.setSword(w && w.sword);
  }
  // 보스 보상 받기. 새로 얻었으면 장비 정보, 이미 있으면 null
  function grant(id) {
    const O = G.Save.data.owned.equip;
    if (!G.Items[id] || O.includes(id)) return null;
    O.push(id); G.Save.save();
    return G.Items[id];
  }
  // 공격 속도 배율: 장비의 speed(또는 special 'swift'의 mul)를 곱함. 1보다 작으면 느려짐 — 미노타우로스의 도끼 0.85
  function atkSpeed() { return list().reduce((m, it) => m * (it.speed || (it.special && it.special.kind === 'swift' ? it.special.mul : 1)), 1); }
  // 지금 든 무기의 이펙트 색 (없으면 null = 기본 색)
  function fx() { const w = item('weapon'); return (w && w.fx) || null; }
  // 칼리돈의 엄니: 지금 효과가 켜져 있는가 (체력이 기준 이하)
  function frenzy(p) {
    const f = special('frenzy'); p = p || G.player;
    return !!(f && p && !p.dead && p.hp / G.CFG.player.maxHp <= f.below) && f;
  }
  return { item, list, atkBonus, atkSpeed, special, toggle, set, apply, grant, fx, frenzy, BASE_WEAPON };
})();
