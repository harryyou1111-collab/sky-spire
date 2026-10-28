// =====================================================================
// cine.js — 보스전 전 시네마틱 영상 (AI 영상 + 자막)
//
// 보스마다 bosses.js에 cine: { src: 영상 파일, lines: [[시작, 끝, 말하는 이, 대사], ...] }
//   - 자막은 영상에 넣지 않고 여기서 띄움 (대사를 고칠 때 영상을 다시 만들 필요 없음)
//   - 처음 한 번만 나옴 (본 기록은 저장). 다시 도전할 때는 안 나옴
//   - 화면을 누르면 건너뜀
// 폰 브라우저는 '누르는 순간'에만 소리 있는 영상 재생을 허락해서,
//   로비의 "탑 오르기"를 누를 때 prime()으로 미리 한 번 틀었다 멈춰 둠 (안 되면 소리 없이 재생)
// =====================================================================
G.Cine = (function () {
  const el = document.getElementById('cine');
  const video = el.querySelector('video');
  const subWho = el.querySelector('.cine-sub small'), subText = el.querySelector('.cine-sub span'), sub = el.querySelector('.cine-sub');
  let cur = null, done = null, startedAt = 0, raf = 0;

  // "탑 오르기"를 누를 때 (사용자 터치 순간) 영상을 미리 깨워 둠
  function prime(def) {
    if (!def || video.dataset.src === def.src) return;
    video.dataset.src = def.src;
    video.src = def.src + '?v=' + G.VERSION;
    video.muted = false;
    const p = video.play();
    if (p && p.then) p.then(() => { if (!cur) { video.pause(); video.currentTime = 0; } }).catch(() => {});
  }

  function play(def, cb) {
    cur = def; done = cb; startedAt = performance.now();
    if (video.dataset.src !== def.src) { video.dataset.src = def.src; video.src = def.src + '?v=' + G.VERSION; }
    video.currentTime = 0;
    video.volume = Math.min(1, (G.Sound.volume.bgm ?? 0.7) * 1.2);
    video.muted = false;
    el.classList.remove('hidden');
    document.body.classList.add('cine');
    sub.classList.remove('on');
    const p = video.play();
    if (p && p.catch) p.catch(() => { video.muted = true; video.play().catch(() => finish()); });   // 소리 허락이 없으면 소리 없이
    raf = requestAnimationFrame(tick);
  }

  // 자막: 영상 시간에 맞춰 바꿈
  let shown = -1;
  function tick() {
    if (!cur) return;
    const t = video.currentTime;
    const i = cur.lines.findIndex(L => t >= L[0] && t < L[1]);
    if (i !== shown) {
      shown = i;
      if (i >= 0) { subWho.textContent = cur.lines[i][2] || ''; subText.textContent = cur.lines[i][3]; sub.classList.add('on'); }
      else sub.classList.remove('on');
    }
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    if (!cur) return;
    cancelAnimationFrame(raf);
    cur = null; shown = -1;
    video.pause();
    el.classList.add('hidden');
    sub.classList.remove('on');
    const cb = done; done = null;
    if (cb) cb();
  }
  video.addEventListener('ended', finish);
  // 화면을 누르면 건너뜀 (실수로 바로 넘어가지 않게 0.6초 뒤부터)
  el.addEventListener('pointerdown', () => { if (cur && performance.now() - startedAt > 600) finish(); });

  return { prime, play, skip: finish, get on() { return !!cur; } };
})();
