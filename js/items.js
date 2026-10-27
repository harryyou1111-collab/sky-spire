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
    name: '판의 뿔검', slot: 'weapon', from: '1F 판',
    icon: 'assets/items/pan_hornblade_icon.webp',
    desc: '숲과 공포의 신이 쥐던 검. 칼날에 감긴 덩굴이 아직 살아 있다.',
    atk: 3,
    special: { kind: 'thorns', dmg: 6, radius: 60, text: '3타가 맞으면 가시덩굴이 솟아 주변 적에게 6 추가 피해' },
    sword: { img: 'assets/items/pan_hornblade.webp', shape: 'assets/items/pan_hornblade.json', len: 1.3, grip: [1700, 258] },
    // 휘두를 때 이펙트 색 (칼날 자국 안쪽, 테두리, 칼끝 궤적, 맞을 때 불꽃) + 잎이 흩날림
    fx: { slash: '120, 255, 110', heavy: '170, 255, 90', edge: '220, 255, 200', trail: '150, 255, 130', spark: '160, 255, 120', leaves: true },
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
  // 지금 든 무기의 이펙트 색 (없으면 null = 기본 색)
  function fx() { const w = item('weapon'); return (w && w.fx) || null; }
  return { item, list, atkBonus, special, toggle, set, apply, grant, fx, BASE_WEAPON };
})();
