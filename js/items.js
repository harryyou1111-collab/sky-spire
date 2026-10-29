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
  // 여왕의 깃털 검 (무기): 공격 속도 25% 증가 — 깃털처럼 가벼운 칼날
  //   칼 그림(sword)이 아직 없어서 손에 든 칼은 기본 검 모양. 그림이 오면 sword·fx를 채움
  harpy_feather: {
    name: '여왕의 깃털 검', slot: 'weapon', from: '3F 하피 여왕',
    icon: 'assets/items/harpy_feather_icon.webp',
    desc: '하피 여왕의 날개깃을 벼려 만든 검. 바람을 가르듯 가볍다.',
    atk: 1,
    special: { kind: 'swift', mul: 1.25, text: '공격 속도 25% 증가' },
  },
};

G.Equip = (function () {
  const BASE_WEAPON = { name: '기본 검', slot: 'weapon', icon: 'assets/items/basic_sword_icon.webp', desc: '탑에 오를 때부터 들고 있던 평범한 검.' };
  const item = slot => { const id = G.Save.data.equip[slot]; return id && G.Items[id] ? G.Items[id] : null; };
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
  // 공격 속도 배율 (여왕의 깃털 검: 1.25). 공격 시간과 동작을 이만큼 빠르게
  function atkSpeed() { const f = special('swift'); return f ? f.mul : 1; }
  // 지금 든 무기의 이펙트 색 (없으면 null = 기본 색)
  function fx() { const w = item('weapon'); return (w && w.fx) || null; }
  // 칼리돈의 엄니: 지금 효과가 켜져 있는가 (체력이 기준 이하)
  function frenzy(p) {
    const f = special('frenzy'); p = p || G.player;
    return !!(f && p && !p.dead && p.hp / G.CFG.player.maxHp <= f.below) && f;
  }
  return { item, list, atkBonus, atkSpeed, special, toggle, set, apply, grant, fx, frenzy, BASE_WEAPON };
})();
