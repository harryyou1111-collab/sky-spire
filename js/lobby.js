// =====================================================================
// lobby.js — 로비 (탑 입구): 층 고르기, 탑 오르기, 장비·스킬·강화·기록 창
//
// 화면은 index.html의 #lobby. 주인공은 3D 캐릭터(hero3d)를 그대로 가져와 천천히 돌려 보여줌 (손가락으로 돌리기 가능)
// 배경은 탑 입구 그림(assets/world/lobby.jpg). 숲·폐허는 탑 안의 세계라 바깥은 맑은 하늘
// 처음 탑에 오를 때는 오프닝(descent.js: 꼭대기에서 입구까지 내려오는 장면) 뒤에 1층 시작
// 장비·스킬은 아직 얻을 방법이 없어서 빈 칸 + 안내만 (보스 보상을 만들 때 여기를 채움)
// =====================================================================
G.Lobby = (function () {
  const el = document.getElementById('lobby');
  const heroCv = document.getElementById('lb-hero'), hctx = heroCv.getContext('2d');
  const $ = s => el.querySelector(s);
  const panel = $('#lb-panel'), panelBody = $('.lb-panel-body'), panelTitle = $('.lb-panel-head b');
  let open = false, sel = 1, yaw = 0.5, spin = 0.25, drag = null;

  const floors = () => Object.keys(G.Floors).map(Number).sort((a, b) => a - b);
  const maxBuilt = () => Math.max(...floors());
  const bossOf = n => G.BossDefs[G.Floors[n].boss];
  // 고를 수 있는 층: 1층 ~ (깬 최고층 + 1), 단 만들어진 층까지만
  const maxSel = () => Math.min(G.Save.data.best + 1, maxBuilt());

  let shownAt = 0;
  function show() {
    open = true; shownAt = performance.now();
    sel = maxSel();
    el.classList.remove('hidden');
    document.body.classList.add('in-lobby');
    closePanel();
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
    el.querySelector('[data-floor="-1"]').classList.toggle('off', sel <= 1);
    el.querySelector('[data-floor="1"]').classList.toggle('off', sel >= maxSel());
    $('#lb-best').textContent = S.best ? `최고 ${S.best}F` : '아직 깬 층 없음';
  }
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  // ---------- 창 (장비·스킬·강화·기록·설정) ----------
  const PANELS = {
    equip() {
      const S = G.Save.data, C = G.CFG, E = G.Equip, w = E.item('weapon'), c = E.item('charm');
      const bonus = E.atkBonus(), base = C.attack.side1.dmg;
      const slot = (it, icon, label, empty) => `<div class="lb-slot${it ? ' on' : ''}">
          ${it ? `<img src="${it.icon}?v=${G.VERSION}" alt="">` : `<i>${icon}</i>`}<b>${label}</b><span>${it ? it.name : empty}</span></div>`;
      const cards = S.owned.equip.map(id => {
        const it = G.Items[id]; if (!it) return '';
        const on = S.equip[it.slot] === id;
        return `<div class="lb-item${on ? ' on' : ''}">
          <img src="${it.icon}?v=${G.VERSION}" alt="">
          <div class="lb-item-info"><b>${it.name}</b><small>${it.slot === 'weapon' ? '무기' : '장신구'} · ${it.from}</small>
            <p>${it.atk ? `<em>공격 +${it.atk}</em>` : ''}${it.special ? `<em class="sp">${it.special.text}</em>` : ''}</p>
            <p class="desc">${it.desc}</p></div>
          <button type="button" class="lb-btn${on ? '' : ' gold'}" data-equip="${id}">${on ? '해제' : '장착'}</button>
        </div>`;
      }).join('');
      return ['장비', `
        <div class="lb-stats">
          <div><span>체력</span><b>${C.player.maxHp}</b></div>
          <div><span>공격</span><b>${base + bonus}</b>${bonus ? `<small> (+${bonus})</small>` : ''}</div>
          <div><span>포션</span><b>${C.potion.count}</b></div>
        </div>
        <div class="lb-slots">${slot(w, '⚔', '무기', '기본 검')}${slot(c, '◈', '장신구', '비어 있음')}</div>
        ${cards ? `<div class="lb-items">${cards}</div>` : '<p class="lb-hint">가진 장비가 없어요. 장비를 주는 보스를 쓰러뜨리면 얻을 수 있어요.</p>'}`];
    },
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

  // 탑 오르기: 처음이면 오프닝을 보여 준 뒤 시작
  function climb() {
    const S = G.Save.data, n = sel;
    const go = () => { G.Game.play(n); G.Floor.state.fade = 1; G.Floor.state.fadeOut = true; };   // 검은 화면에서 서서히 밝아짐
    if (!S.seenOpening) G.Descent.play(() => { S.seenOpening = true; G.Save.save(); go(); });
    else G.Game.play(n);
  }

  el.addEventListener('click', e => {
    if (performance.now() - shownAt < 450) return;     // 시작 화면을 누른 손가락이 그대로 로비 버튼을 누르지 않게
    const t = e.target.closest('button, [data-open]');
    if (!t) return;
    if (t.dataset.open) openPanel(t.dataset.open);
    else if (t.dataset.floor) { sel = Math.max(1, Math.min(maxSel(), sel + Number(t.dataset.floor))); refresh(); }
    else if (t.classList.contains('lb-close')) closePanel();
    else if (t.id === 'lb-go') climb();
  });
  panel.addEventListener('click', e => { if (e.target === panel) closePanel(); });

  // 주인공 돌리기 (손가락으로 좌우로 끌기)
  heroCv.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw }; heroCv.setPointerCapture(e.pointerId); });
  heroCv.addEventListener('pointermove', e => { if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  heroCv.addEventListener('pointerup', () => { drag = null; });

  // ---------- 매 프레임 (로비가 열려 있을 때 main.js가 부름) ----------
  const idle = { state: 'idle', vx: 0, vz: 0, atk: null, dash: null, facing: 1 };
  function frame(dt) {
    if (!open) return;
    const H3 = G.Hero3D;
    const w = heroCv.clientWidth, h = heroCv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (heroCv.width !== Math.round(w * dpr) || heroCv.height !== Math.round(h * dpr)) {
      heroCv.width = Math.round(w * dpr); heroCv.height = Math.round(h * dpr);
    }
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, heroCv.width, heroCv.height);
    if (!H3 || !H3.ready) return;
    if (!drag) yaw += dt * spin;
    H3.yaw = yaw;
    H3.update(dt, idle);
    // 3D 캐릭터(키 heightUnits)가 캔버스 높이의 70%가 되게 크게, 발은 풀밭(아래쪽 4% 위)에
    const k = heroCv.height * 0.70 / H3.heightUnits;
    // 로비에서는 주인공을 크게 보여 주니까 3D 그림도 그만큼 선명하게 (게임으로 돌아가면 main.js가 원래대로)
    if (Math.abs((G.viewScale || 1) - k) > 0.05) { G.viewScale = k; H3.resize(); }
    hctx.setTransform(k, 0, 0, k, 0, 0);
    H3.draw(hctx, heroCv.width / k / 2, heroCv.height / k * 0.96);
  }

  return { show, hide, frame, refresh, get open() { return open; } };
})();
