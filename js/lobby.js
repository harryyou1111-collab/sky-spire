// =====================================================================
// lobby.js — 로비 (탑 입구): 층 고르기, 탑 오르기, 장비·스킬·강화·기록 창
//
// 화면은 index.html의 #lobby. 주인공은 3D 캐릭터(hero3d)를 그대로 가져와 천천히 돌려 보여줌 (손가락으로 돌리기 가능)
// 배경은 탑 입구 그림(assets/world/lobby.jpg). 숲·폐허는 탑 안의 세계라 바깥은 맑은 하늘
// 처음 탑에 오를 때는 오프닝(descent.js: 꼭대기에서 입구까지 내려오는 장면) 뒤에 1층 시작
// 장비 탭은 따로 된 화면(#lb-equip): 가운데 주인공(능력치는 머리 위), 왼쪽 무기, 오른쪽 장신구.
//   칸을 누르면 그 칸의 장비 목록이 펼쳐지고, 고르면 바로 장착 → 가운데 주인공의 칼도 바뀜
// 스킬은 아직 얻을 방법이 없어서 빈 칸 + 안내만
// =====================================================================
G.Lobby = (function () {
  const el = document.getElementById('lobby');
  const heroCv = document.getElementById('lb-hero'), hctx = heroCv.getContext('2d');
  const $ = s => el.querySelector(s);
  const panel = $('#lb-panel'), panelBody = $('.lb-panel-body'), panelTitle = $('.lb-panel-head b');
  const eqEl = $('#lb-equip'), eqCv = $('#eq-hero'), ectx = eqCv.getContext('2d');
  let eqOpen = false; const eqList = { weapon: false, charm: false };   // 펼친 목록
  let open = false, sel = 1, yaw = 0.5, spin = 0.25, drag = null;

  const floors = () => Object.keys(G.Floors).map(Number).sort((a, b) => a - b);
  const maxBuilt = () => Math.max(...floors());
  const bossOf = n => G.BossDefs[G.Floors[n].boss];
  // 고를 수 있는 층: 만들어진 층 중 깬 최고층 바로 다음 층까지 (아직 없는 층은 건너뜀)
  const maxSel = () => floors().find(n => n > G.Save.data.best) || maxBuilt();
  // 만들어진 층 목록에서 앞·뒤 층
  const step = (n, d) => { const L = floors().filter(f => f <= maxSel()), i = L.indexOf(n); return L[Math.max(0, Math.min(L.length - 1, i + d))] || n; };

  let shownAt = 0;
  function show() {
    open = true; shownAt = performance.now();
    sel = maxSel();
    el.classList.remove('hidden');
    document.body.classList.add('in-lobby');
    closePanel(); closeEquip();
    refresh();
  }
  function hide() {
    open = false;
    el.classList.add('hidden');
    document.body.classList.remove('in-lobby');
    dispatchEvent(new Event('resize'));     // 3D 그림 선명도를 게임 화면에 맞게 되돌림
  }

  function refresh() {
    const S = G.Save.data, b = bossOf(sel);
    $('#lb-fn').textContent = sel + 'F';
    $('#lb-boss').textContent = `${b.name} · ${b.title}`;
    const c = S.cleared[sel];
    let note;
    if (c) note = `클리어 ${c.count}회${c.time ? ' · 최고 ' + fmt(c.time) : ''}`;
    else note = '처음 도전하는 층';
    if (sel === maxBuilt() && S.best >= maxBuilt()) note += ' · 다음 층은 준비 중';
    $('#lb-note').textContent = note;
    $('#lb-go').textContent = c ? '다시 오르기' : '탑 오르기';
    el.querySelector('[data-floor="-1"]').classList.toggle('off', sel <= floors()[0]);
    el.querySelector('[data-floor="1"]').classList.toggle('off', sel >= maxSel());
    $('#lb-best').textContent = S.best ? `최고 ${S.best}F` : '아직 깬 층 없음';
  }
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  // ---------- 창 (장비·스킬·강화·기록·설정) ----------
  const PANELS = {
    skills() {
      const S = G.Save.data;
      const slot = (s, i) => `<div class="lb-slot${s ? ' on' : ''}"><i>${i + 1}</i><b>스킬 ${i + 1}</b><span>${s || '비어 있음'}</span></div>`;
      return ['스킬', `
        <div class="lb-slots">${S.skills.map(slot).join('')}</div>
        <p class="lb-hint">${S.owned.skills.length ? '' : '배운 스킬이 없어요. 스킬을 주는 보스를 쓰러뜨리면 배울 수 있어요.'}</p>`];
    },
    forge() { return ['강화', `<p class="lb-hint big">🔒 준비 중이에요</p>`]; },
    records() {
      const S = G.Save.data;
      const rows = floors().map(n => {
        const b = bossOf(n), c = S.cleared[n];
        return `<tr class="${c ? 'done' : ''}"><td>${n}F</td><td>${b.name}</td><td>${c ? '✓ ' + c.count + '회' : '—'}</td><td>${c && c.time ? fmt(c.time) : ''}</td></tr>`;
      }).join('');
      return ['기록', `
        <table class="lb-table"><tr><th>층</th><th>보스</th><th>클리어</th><th>최고 기록</th></tr>${rows}</table>
        <p class="lb-hint">쓰러진 횟수 ${S.stats.deaths}번 · 플레이 ${fmt(S.stats.playTime)}</p>`];
    },
    settings() {
      return ['설정', `
        <div class="lb-vol"><span>효과음</span><input type="range" min="0" max="1" step="0.05" value="${G.Sound.volume.sfx}" data-vol="sfx"></div>
        <div class="lb-vol"><span>배경음</span><input type="range" min="0" max="1" step="0.05" value="${G.Sound.volume.bgm}" data-vol="bgm"></div>
        <button class="lb-btn" id="lb-opening">오프닝 다시 보기</button>
        <button class="lb-btn danger" id="lb-reset">저장 기록 지우기</button>
        <p class="lb-hint">버전 v${G.VERSION}</p>`];
    },
  };
  function openPanel(key) {
    const [title, html] = PANELS[key]();
    panelTitle.textContent = title; panelBody.innerHTML = html;
    panel.classList.remove('hidden');
    panelBody.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => { G.Equip.toggle(b.dataset.equip); openPanel(key); }));
    panelBody.querySelectorAll('[data-vol]').forEach(r => r.addEventListener('input', () => {
      G.Sound.setVolume(r.dataset.vol, Number(r.value));
      if (r.dataset.vol === 'sfx') G.Sound.play('hit');      // 바로 들어 보기
    }));
    const op = $('#lb-opening');
    if (op) op.addEventListener('click', () => { closePanel(); G.Descent.play(null); });
    const r = $('#lb-reset');
    if (r) r.addEventListener('click', () => {
      // 두 번 눌러야 지워짐 (실수 방지)
      if (!r.dataset.sure) { r.dataset.sure = 1; r.textContent = '정말 지울까요? 한 번 더 누르기'; return; }
      G.Save.reset(); sel = 1; refresh(); closePanel();
    });
  }
  function closePanel() { panel.classList.add('hidden'); }

  // ---------- 장비 화면 ----------
  function openEquip() { eqOpen = true; eqList.weapon = eqList.charm = false; eqEl.classList.remove('hidden'); el.classList.add('eq-open'); renderEquip(); }
  function closeEquip() { eqOpen = false; eqEl.classList.add('hidden'); el.classList.remove('eq-open'); }
  const img = it => `<img src="${it.icon}?v=${G.VERSION}" alt="">`;
  function renderEquip() {
    const S = G.Save.data, C = G.CFG, E = G.Equip, bonus = E.atkBonus();
    $('.eq-stats').innerHTML = `
      <div><span>체력</span><b>${C.player.maxHp}</b></div>
      <div><span>공격</span><b>${C.attack.side1.dmg + bonus}</b>${bonus ? `<small>+${bonus}</small>` : ''}</div>
      <div><span>포션</span><b>${C.potion.count}</b></div>`;
    for (const col of eqEl.querySelectorAll('.eq-col')) {
      const slot = col.dataset.slot, label = slot === 'weapon' ? '무기' : '장신구';
      const cur = E.item(slot) || (slot === 'weapon' ? E.BASE_WEAPON : null);
      // 이 칸에 넣을 수 있는 것: 무기는 기본 검 + 가진 무기, 장신구는 가진 장신구
      const ids = (slot === 'weapon' ? [null] : []).concat(S.owned.equip.filter(id => G.Items[id] && G.Items[id].slot === slot));
      const rows = ids.map(id => {
        const it = id ? G.Items[id] : E.BASE_WEAPON, on = (S.equip[slot] || null) === id;
        const info = [it.atk ? `공격 +${it.atk}` : '', it.special ? it.special.text : ''].filter(Boolean).join(' · ') || '특별한 효과 없음';
        return `<button type="button" class="eq-row${on ? ' on' : ''}" data-pick="${id || ''}">
          ${img(it)}<div><b>${it.name}${on ? ' <i>장착 중</i>' : ''}</b><span>${info}</span>${on ? `<p>${it.desc}</p>` : ''}</div></button>`;
      }).join('');
      col.innerHTML = `
        <button type="button" class="eq-slot${eqList[slot] ? ' open' : ''}" data-toggle="${slot}">
          <small>${label}</small>
          ${cur ? img(cur) : '<i>◈</i>'}
          <b>${cur ? cur.name : '비어 있음'}</b>
          <em>${eqList[slot] ? '닫기 ▲' : '바꾸기 ▼'}</em>
        </button>
        <div class="eq-list${eqList[slot] ? '' : ' hidden'}">
          ${rows || `<p class="eq-empty">아직 ${label}가 없어요<br><span>보스를 쓰러뜨리면 얻을 수 있어요</span></p>`}
        </div>`;
    }
  }
  eqEl.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    e.stopPropagation();
    G.Sound.play('ui');
    if (t.classList.contains('eq-back')) closeEquip();
    else if (t.dataset.toggle) { eqList[t.dataset.toggle] = !eqList[t.dataset.toggle]; renderEquip(); }
    else if (t.dataset.pick !== undefined) {
      const slot = t.closest('.eq-col').dataset.slot, id = t.dataset.pick || null;
      // 장신구는 장착 중인 걸 다시 누르면 빼기, 무기는 기본 검으로 바꾸려면 기본 검을 누름
      if (slot === 'charm' && G.Save.data.equip.charm === id) G.Equip.set(slot, null);
      else G.Equip.set(slot, id);
      renderEquip();
    }
  });

  // 탑 오르기: 처음이면 오프닝을 보여 준 뒤 시작
  function climb() {
    const S = G.Save.data, n = sel;
    // 이 층 보스의 시네마틱을 아직 안 봤으면, 누르는 순간 영상을 미리 깨워 둠 (폰에서 소리 나게)
    const B = bossOf(n);
    if (B.cine && !(S.seenCine || {})[G.Floors[n].boss]) G.Cine.prime(B.cine);
    const go = () => { G.Game.play(n); G.Floor.state.fade = 1; G.Floor.state.fadeOut = true; };   // 검은 화면에서 서서히 밝아짐
    if (!S.seenOpening) G.Descent.play(() => { S.seenOpening = true; G.Save.save(); go(); });
    else G.Game.play(n);
  }

  el.addEventListener('click', e => {
    if (performance.now() - shownAt < 450) return;     // 시작 화면을 누른 손가락이 그대로 로비 버튼을 누르지 않게
    const t = e.target.closest('button, [data-open]');
    if (!t) return;
    G.Sound.play('ui');
    if (t.dataset.open === 'equip') openEquip();
    else if (t.dataset.open) openPanel(t.dataset.open);
    else if (t.dataset.floor) { sel = step(sel, Number(t.dataset.floor)); refresh(); }
    else if (t.classList.contains('lb-close')) closePanel();
    else if (t.id === 'lb-go') climb();
  });
  panel.addEventListener('click', e => { if (e.target === panel) closePanel(); });

  // 주인공 돌리기 (손가락으로 좌우로 끌기)
  for (const cv of [heroCv, eqCv]) {
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
    cv.addEventListener('pointerup', () => { drag = null; });
  }

  // ---------- 매 프레임 (로비가 열려 있을 때 main.js가 부름) ----------
  const idle = { state: 'idle', vx: 0, vz: 0, atk: null, dash: null, facing: 1 };
  function frame(dt) {
    if (!open) return;
    // 장비 화면이 열려 있으면 그쪽 캔버스에 (가운데, 조금 작게), 아니면 로비 캔버스에
    const cv = eqOpen ? eqCv : heroCv, c2 = eqOpen ? ectx : hctx;
    const H3 = G.Hero3D;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.clearRect(0, 0, cv.width, cv.height);
    if (!H3 || !H3.ready || !cv.height) return;
    if (!drag) yaw += dt * spin;
    H3.yaw = yaw;
    H3.update(dt, idle);
    // 3D 캐릭터(키 heightUnits)가 캔버스 높이의 70%가 되게 크게, 발은 아래쪽 4% 위에
    const k = cv.height * (eqOpen ? 0.74 : 0.70) / H3.heightUnits;
    // 로비에서는 주인공을 크게 보여 주니까 3D 그림도 그만큼 선명하게 (게임으로 돌아가면 main.js가 원래대로)
    if (Math.abs((G.viewScale || 1) - k) > 0.05) { G.viewScale = k; H3.resize(); }
    c2.setTransform(k, 0, 0, k, 0, 0);
    H3.draw(c2, cv.width / k / 2, cv.height / k * (eqOpen ? 0.95 : 0.96));
  }

  return { show, hide, frame, refresh, get open() { return open; } };
})();
