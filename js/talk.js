// =====================================================================
// talk.js — 대화 장면 (배경 그림 + 인물 그림 + 아래 대화창)
//
// 보스마다 bosses.js에 talk: { bg, cast, lines } 를 적으면 보스전 전에 나옴 (처음 한 번만)
//   bg   : 배경 그림
//   cast : 나오는 인물 { 이름표: { name, side: 'left'|'right'|'back', faces: { 표정: 그림 } } }
//          back = 화면 뒤쪽에 크게 (거대한 보스), flip: true = 그림을 좌우로 뒤집음 (바라보는 방향 맞추기)
//   lines: [{ who, face, text, voice, shake, flash }, ...]
//          who: cast의 이름표 (없으면 해설), face: 표정 (바꿀 때만), voice: 목소리 파일 (없어도 됨)
//          shake: 화면 흔들림, flash: 번쩍 (깨어날 때 등)
// 조작: 화면을 누르면 글이 다 나오고, 한 번 더 누르면 다음 대사. 자동 / 건너뛰기 버튼
// =====================================================================
G.Talk = (function () {
  const el = document.getElementById('talk');
  const bgEl = el.querySelector('.tk-bg'), stage = el.querySelector('.tk-stage');
  const box = el.querySelector('.tk-box'), nameEl = el.querySelector('.tk-name'), textEl = el.querySelector('.tk-text');
  const autoBtn = el.querySelector('[data-tk="auto"]'), skipBtn = el.querySelector('[data-tk="skip"]');
  let voiceTimer = 0;
  let S = null, i = -1, shown = 0, full = '', typing = false, done = null, imgs = {}, auto = false, waitT = 0, last = 0, raf = 0, voiceEnd = 0;
  const SPEED = 28;      // 글자 / 초

  const src = p => p + '?v=' + G.VERSION;

  function play(script, cb) {
    S = script; done = cb; i = -1; imgs = {};
    bgEl.style.backgroundImage = `url("${src(script.bg)}")`;
    stage.innerHTML = '';
    for (const [id, c] of Object.entries(script.cast)) {
      const im = document.createElement('img');
      im.className = 'tk-char ' + (c.side || 'left') + (c.flip ? ' flip' : ''); im.alt = '';   // flip: 그림을 좌우로 뒤집음
      im.dataset.id = id;
      Object.values(c.faces).forEach(f => { new Image().src = src(f); });   // 표정 그림 미리 불러 두기
      stage.appendChild(im); imgs[id] = im;
    }
    script.lines.forEach(L => L.voice && G.Sound.preloadVoice(L.voice));   // 목소리 미리 불러 두기
    el.classList.remove('hidden');
    document.body.classList.add('cine');
    next();
    last = performance.now(); raf = requestAnimationFrame(tick);
  }

  function next() {
    i++;
    if (i >= S.lines.length) return finish();
    const L = S.lines[i], c = S.cast[L.who];
    // 인물: 처음 대사 전엔 숨겨 둠 → 말하거나 표정이 정해지면 나타남
    for (const [id, im] of Object.entries(imgs)) {
      const face = id === L.who && L.face ? L.face : im.dataset.face || (S.lines.find(x => x.who === id && x.face) || {}).face || Object.keys(S.cast[id].faces)[0];
      if (im.dataset.face !== face) { im.dataset.face = face; im.src = src(S.cast[id].faces[face]); }
      if (id === L.who) im.classList.add('in');
      im.classList.toggle('speak', id === L.who);
    }
    if (L.shake) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    if (L.flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    nameEl.textContent = c ? c.name : '';
    nameEl.classList.toggle('none', !c);
    box.classList.toggle('right', !!(c && c.side === 'right'));
    full = L.text; shown = 0; typing = true; textEl.textContent = '';
    // 목소리: voiceDelay 초 뒤에 (효과음과 겹치지 않게). 자동 넘김은 목소리가 끝날 때까지 기다림
    clearTimeout(voiceTimer); G.Sound.voice(null);
    voiceEnd = L.voice ? performance.now() + 60000 : 0;
    if (L.voice) voiceTimer = setTimeout(() => { voiceEnd = performance.now() + (G.Sound.voice(L.voice) || 0) * 1000; }, (L.voiceDelay || 0) * 1000);
    if (L.sfx) G.Sound.play(L.sfx);
    waitT = 0;
  }

  function tick(now) {
    if (!S) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (typing) {
      shown = Math.min(full.length, shown + dt * SPEED);
      textEl.textContent = full.slice(0, Math.floor(shown));
      if (shown >= full.length) typing = false;
    } else if (auto) {
      waitT += dt;
      if (waitT > 1.1 + full.length * 0.03 && now > voiceEnd) next();
    }
    box.classList.toggle('ready', !typing);
    raf = requestAnimationFrame(tick);
  }

  function tap() {
    if (!S) return;
    if (typing) { shown = full.length; typing = false; textEl.textContent = full; }
    else next();
  }

  function finish() {
    if (!S) return;
    cancelAnimationFrame(raf);
    clearTimeout(voiceTimer); G.Sound.voice(null);
    S = null;
    el.classList.add('hidden');
    el.classList.remove('shake', 'flash');
    document.body.classList.remove('cine');     // 화면 조작 버튼 다시 보이게 (보스 등장 연출이 이어지면 거기서 다시 숨김)
    const cb = done; done = null;
    if (cb) cb();
  }

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-tk]');
    if (b) {
      e.stopPropagation();
      if (b.dataset.tk === 'auto') { auto = !auto; autoBtn.classList.toggle('on', auto); }
      else finish();
      return;
    }
    tap();
  });

  return { play, skip: finish, get on() { return !!S; } };
})();
