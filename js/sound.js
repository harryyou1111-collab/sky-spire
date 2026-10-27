// =====================================================================
// sound.js — 효과음과 배경음 (파일만 씀. 파일이 없는 소리는 조용히 넘어감)
//
// 효과음: assets/sfx/<이름>.mp3 — 새 파일을 넣으면 SFX 목록에 이름을 추가
//   게임 곳곳에서 G.Sound.play('이름')을 부르는데, 아직 파일이 없는 소리는 재생되지 않음
//   (앞으로 넣을 이름: hurt, mob_die, dodge, jump, land, drink, heal, arrow, explode, vines, thorns, gate, ui, banner, whoosh, reward, win, lose)
// 비슷한 소리는 다른 파일을 높이·크기만 바꿔 씀 (ALIAS)
// 배경음: assets/bgm/<이름>.mp3 — BGM 목록에서 true로 바꾸면 재생. G.Sound.bgm('boss') 처럼 바꾸면 서서히 넘어감
// 폰 브라우저는 화면을 한 번 터치해야 소리가 나므로, 시작 화면 터치 때 unlock()
// 음량은 설정 창에서 조절 (저장됨)
// =====================================================================
G.Sound = (function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master, sfxGain, bgmGain;
  const buffers = {};
  const vol = () => (G.Save.data.settings || (G.Save.data.settings = { sfx: 0.8, bgm: 0.5 }));

  // 있는 효과음 파일 (이름: 기본 크기)
  const SFX = { swing: 0.8, swing3: 0.9, hit: 0.9, smash: 1, roar: 1 };
  // 다른 파일을 빌려 쓰는 소리: 이름 → [파일 이름, { rate: 높이(1 = 그대로), vol: 크기 }]
  const ALIAS = {
    swing2: ['swing', { rate: 1.08 }],
    hit_heavy: ['hit', { rate: 0.85, vol: 1 }],
    hit_boss: ['hit', { rate: 0.72, vol: 1 }],
  };
  // 배경음 (파일을 넣으면 true로)
  const BGM = { lobby: false, path: false, boss: false, opening: false };

  async function loadFile(url) {
    const r = await fetch(url + '?v=' + (G.VERSION || 0));
    if (!r.ok) throw new Error('없음');
    const data = await r.arrayBuffer();
    return await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
  }

  function init() {
    if (!AC || ctx) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    bgmGain = ctx.createGain(); bgmGain.connect(master);
    applyVolume();
    for (const name of Object.keys(SFX)) loadFile(`assets/sfx/${name}.mp3`).then(b => { buffers[name] = b; }).catch(() => {});
  }
  // 첫 터치 때 (폰은 이때부터 소리가 남)
  function unlock() {
    init();
    if (ctx && ctx.state !== 'running') ctx.resume();
  }

  // 효과음 재생. 같은 소리가 너무 겹치지 않게 아주 짧은 간격은 건너뜀
  const lastAt = {};
  function play(name, o) {
    if (!ctx || ctx.state !== 'running') return;
    let file = name, base = {};
    if (ALIAS[name]) [file, base] = ALIAS[name];
    const b = buffers[file]; if (!b) return;           // 파일이 없는 소리는 조용히
    const now = ctx.currentTime;
    if (lastAt[name] && now - lastAt[name] < 0.03) return;
    lastAt[name] = now;
    const s = ctx.createBufferSource(); s.buffer = b;
    const rate = (o && o.rate) || base.rate || 1;
    s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.08);   // 매번 살짝 다른 높이 (덜 반복적으로 들림)
    const g = ctx.createGain();
    g.gain.value = (SFX[file] || 1) * ((o && o.vol != null) ? o.vol : (base.vol != null ? base.vol : 1));
    s.connect(g); g.connect(sfxGain); s.start();
  }

  // 배경음: 서서히 바뀜
  let cur = null, curName = null;
  const bgmCache = {};
  async function bgm(name) {
    if (!ctx || name === curName) return;
    curName = name;
    const old = cur; cur = null;
    if (old) { old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { old.s.stop(); } catch (e) {} }, 2500); }
    if (!name || !BGM[name]) return;
    try {
      const b = bgmCache[name] || (bgmCache[name] = await loadFile(`assets/bgm/${name}.mp3`));
      if (curName !== name) return;
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
      s.connect(g); g.connect(bgmGain); s.start();
      cur = { s, g };
    } catch (e) { /* 배경음 파일이 없으면 조용히 */ }
  }

  function applyVolume() {
    if (!ctx) return;
    const v = vol();
    sfxGain.gain.value = v.sfx; bgmGain.gain.value = v.bgm * 0.7;
  }
  function setVolume(kind, value) { vol()[kind] = value; G.Save.save(); applyVolume(); }
  // 다른 앱으로 가면 소리도 멈춤
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

  return { unlock, play, bgm, setVolume, get volume() { return vol(); } };
})();
