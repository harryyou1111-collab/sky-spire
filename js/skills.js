// =====================================================================
// skills.js — 스킬 데이터와 사용 (보스 보상으로 배움, 2칸에 장착)
//
// G.Skills: 스킬 목록. 보스 보상(bosses.js의 reward: { skill: id })이 여기 id를 가리킴
//   cooldown: 다시 쓸 수 있을 때까지(초), duration: 효과 시간(초)
// G.Skill : 장착·배우기·사용·쿨타임
//   게임 화면 오른쪽 버튼(스킬 1, 2)은 장착한 스킬이 있을 때만 보임
// =====================================================================
G.Skills = {
  // 석화: 2초 동안 몸이 돌로 변해 어떤 공격도 받지 않음. 대신 그동안 움직이거나 공격할 수 없음
  //   공격이 닿기 직전에 쓰는 '막기' 스킬 (보스의 내려찍기·낙석·고리 모두 막음)
  stone_skin: {
    name: '석화', from: '1F 탑의 문지기',
    icon: 'assets/skills/stone_skin.webp',
    desc: '2초 동안 몸이 돌로 변해 어떤 공격도 받지 않는다. 그동안은 움직일 수 없다.',
    cooldown: 14, duration: 2,
  },
};

G.Skill = (function () {
  const S = () => G.Save.data;
  const cd = [0, 0];                       // 칸별 남은 쿨타임
  const slots = () => S().skills;
  // 보스 보상으로 배움. 새로 배웠으면 스킬 정보, 이미 있으면 null. 빈 칸이 있으면 바로 장착
  function grant(id) {
    const O = S().owned.skills;
    if (!G.Skills[id] || O.includes(id)) return null;
    O.push(id);
    const i = slots().indexOf(null);
    if (i >= 0) slots()[i] = id;
    G.Save.save(); refreshButtons();
    return G.Skills[id];
  }
  // 장착 / 해제: 이미 장착한 걸 누르면 빼고, 아니면 빈 칸(없으면 1번 칸)에
  function toggle(id) {
    const L = slots(), at = L.indexOf(id);
    if (at >= 0) L[at] = null;
    else { const i = L.indexOf(null); L[i >= 0 ? i : 0] = id; }
    G.Save.save(); refreshButtons();
  }
  function reset() { cd[0] = cd[1] = 0; refreshButtons(); }

  // 사용 (player.js가 부름). 쓰면 true
  function use(p, i) {
    const id = slots()[i], K = id && G.Skills[id];
    if (!K || cd[i] > 0 || p.dead) return false;
    cd[i] = K.cooldown;
    if (id === 'stone_skin') {
      p.stone = K.duration;
      p.atk = null; p.dash = null; p.drink = 0; p.hurt = 0;
      G.Sound.play('smash', { rate: 1.6, vol: 0.6 });
      G.FX.shake(3, 0.15);
      G.FX.text(p.x, G.Stage.screenY(p.z, p.h + 150), '석화', '#bfe3ff');
    }
    return true;
  }
  function update(dt) {
    for (let i = 0; i < 2; i++) cd[i] = Math.max(0, cd[i] - dt);
    for (let i = 0; i < 2; i++) {
      const b = btns[i]; if (!b || !slots()[i]) continue;
      const K = G.Skills[slots()[i]], k = cd[i] / K.cooldown;
      b.style.setProperty('--cd', k);
      b.classList.toggle('cooling', k > 0);
      b.querySelector('b').textContent = k > 0 ? Math.ceil(cd[i]) : '';
    }
  }

  // 게임 화면 버튼: 장착한 스킬 그림 넣기 (빈 칸이면 숨김)
  const btns = [document.querySelector('[data-act="skill1"]'), document.querySelector('[data-act="skill2"]')];
  function refreshButtons() {
    btns.forEach((b, i) => {
      if (!b) return;
      const id = slots()[i], K = id && G.Skills[id];
      b.classList.toggle('hidden', !K);
      if (K) b.querySelector('img').src = K.icon + '?v=' + G.VERSION;
    });
  }
  refreshButtons();

  return { grant, toggle, use, update, reset, refreshButtons, get cd() { return cd; } };
})();
