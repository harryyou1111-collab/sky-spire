// =====================================================================
// sound.js — 효과음과 배경음
//
// 효과음: 아래 RECIPE로 코드에서 직접 만든 소리(합성음)를 씀 → 파일 없이도 소리가 남
//   assets/sfx/<이름>.mp3 파일을 넣으면 그 파일이 합성음 대신 재생됨 (FILES에 이름이 있는 것만 찾아봄)
// 배경음: assets/bgm/<이름>.mp3 (없으면 조용히 넘어감). G.Sound.bgm('boss') 처럼 바꾸면 서서히 넘어감
// 사용: G.Sound.play('hit') / G.Sound.play('swing', { vol: 0.8, rate: 1.1 })
// 폰 브라우저는 화면을 한 번 터치해야 소리가 나므로, 시작 화면 터치 때 unlock()
// 음량은 설정 창에서 조절 (저장됨)
// =====================================================================
G.Sound = (function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ok = !!(AC && OAC);
  let ctx = null, master, sfxGain, bgmGain;
  const buffers = {};            // 이름 → AudioBuffer (파일이 있으면 파일, 없으면 합성음)
  const vol = () => (G.Save.data.settings || (G.Save.data.settings = { sfx: 0.8, bgm: 0.5 }));

  // 파일로 바꿀 수 있는 효과음 이름 (assets/sfx/이름.mp3)
  const FILES = ['roar', 'smash', 'win', 'lose', 'reward', 'gate', 'boss_intro'];
  // 배경음 (assets/bgm/이름.mp3)
  const BGM = { lobby: 'assets/bgm/lobby.mp3', path: 'assets/bgm/path.mp3', boss: 'assets/bgm/boss.mp3', opening: 'assets/bgm/opening.mp3' };

  // ---------- 합성음 만들기 ----------
  // 각 소리는 (오프라인 오디오, 출력, 길이)로 소리 장치(잡음·발진기·필터)를 연결해 미리 한 번 녹음해 둠
  function noiseBuf(c, sec) {
    const b = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noise(c, out, t0, dur, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 1, attack = 0.005, curve = 'exp' } = {}) {
    const n = c.createBufferSource(); n.buffer = noiseBuf(c, dur + 0.05);
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); else g.gain.linearRampToValueAtTime(0, t0 + dur);
    n.connect(f); f.connect(g); g.connect(out); n.start(t0); n.stop(t0 + dur + 0.05);
  }
  function tone(c, out, t0, dur, { type = 'sine', f0 = 200, f1 = f0, gain = 1, attack = 0.004, vib = 0 } = {}) {
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib; lg.gain.value = f0 * 0.06; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur); }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // 이름: [길이(초), 만드는 법]
  const RECIPE = {
    // 칼 휘두르는 바람 소리 (점점 높아지는 쉭)
    swing:  [0.22, (c, o) => noise(c, o, 0, 0.2, { f0: 700, f1: 2600, q: 1.4, gain: 0.55, attack: 0.03 })],
    swing2: [0.22, (c, o) => noise(c, o, 0, 0.2, { f0: 900, f1: 3000, q: 1.6, gain: 0.55, attack: 0.025 })],
    swing3: [0.34, (c, o) => { noise(c, o, 0, 0.3, { f0: 400, f1: 2200, q: 1.1, gain: 0.75, attack: 0.05 }); noise(c, o, 0.05, 0.25, { type: 'lowpass', f0: 500, f1: 200, gain: 0.3 }); }],
    // 베기가 맞음: 짧은 타격 + 낮은 쿵
    hit:    [0.2, (c, o) => { noise(c, o, 0, 0.09, { type: 'highpass', f0: 1800, f1: 900, gain: 0.7 }); tone(c, o, 0, 0.16, { f0: 150, f1: 55, gain: 0.9 }); }],
    hit_heavy: [0.32, (c, o) => { noise(c, o, 0, 0.14, { type: 'highpass', f0: 1400, f1: 600, gain: 0.8 }); tone(c, o, 0, 0.28, { f0: 120, f1: 40, gain: 1 }); noise(c, o, 0.01, 0.22, { type: 'lowpass', f0: 900, f1: 150, gain: 0.5 }); }],
    // 보스 손을 때림: 단단한 소리
    hit_boss: [0.3, (c, o) => { noise(c, o, 0, 0.12, { f0: 2400, f1: 1200, q: 3, gain: 0.6 }); tone(c, o, 0, 0.25, { type: 'triangle', f0: 220, f1: 90, gain: 0.6 }); }],
    // 주인공이 맞음: 둔탁 + 아래로
    hurt:   [0.35, (c, o) => { tone(c, o, 0, 0.3, { f0: 180, f1: 60, gain: 0.9 }); noise(c, o, 0, 0.2, { type: 'lowpass', f0: 1200, f1: 200, gain: 0.6 }); }],
    // 회피: 바람 휙
    dodge:  [0.3, (c, o) => noise(c, o, 0, 0.28, { f0: 1600, f1: 500, q: 0.8, gain: 0.5, attack: 0.04 })],
    jump:   [0.16, (c, o) => noise(c, o, 0, 0.14, { f0: 500, f1: 1400, q: 0.9, gain: 0.3, attack: 0.02 })],
    land:   [0.14, (c, o) => { tone(c, o, 0, 0.1, { f0: 110, f1: 60, gain: 0.5 }); noise(c, o, 0, 0.08, { type: 'lowpass', f0: 700, f1: 200, gain: 0.3 }); }],
    // 포션: 꿀꺽 + 반짝
    drink:  [0.5, (c, o) => { for (let i = 0; i < 4; i++) tone(c, o, i * 0.11, 0.08, { f0: 300 + i * 40, f1: 500 + i * 60, gain: 0.35 }); }],
    heal:   [0.7, (c, o) => { [880, 1108, 1318, 1760].forEach((f, i) => tone(c, o, i * 0.07, 0.5, { type: 'triangle', f0: f, gain: 0.22 })); }],
    // 몹
    mob_die: [0.45, (c, o) => { tone(c, o, 0, 0.35, { f0: 140, f1: 45, gain: 0.8 }); noise(c, o, 0, 0.3, { type: 'lowpass', f0: 1400, f1: 150, gain: 0.5 }); }],
    arrow:  [0.3, (c, o) => { tone(c, o, 0, 0.18, { type: 'triangle', f0: 420, f1: 300, gain: 0.5 }); noise(c, o, 0.02, 0.22, { f0: 2500, f1: 1200, q: 2, gain: 0.3 }); }],
    explode: [0.7, (c, o) => { noise(c, o, 0, 0.6, { type: 'lowpass', f0: 2400, f1: 100, gain: 1 }); tone(c, o, 0, 0.5, { f0: 90, f1: 30, gain: 0.9 }); }],
    warn:   [0.18, (c, o) => tone(c, o, 0, 0.15, { type: 'triangle', f0: 1300, f1: 1200, gain: 0.25 })],
    // 큰 쿵 (거한 내려찍기, 보스 내려찍기)
    smash:  [0.9, (c, o) => { tone(c, o, 0, 0.8, { f0: 70, f1: 28, gain: 1.2 }); noise(c, o, 0, 0.7, { type: 'lowpass', f0: 1200, f1: 80, gain: 0.9 }); noise(c, o, 0.02, 0.3, { type: 'highpass', f0: 2000, f1: 800, gain: 0.25 }); }],
    // 포효: 낮은 톱니파 + 거친 잡음 (파일로 바꾸는 걸 추천)
    roar:   [1.6, (c, o) => { tone(c, o, 0, 1.5, { type: 'sawtooth', f0: 95, f1: 60, gain: 0.45, attack: 0.15, vib: 9 }); tone(c, o, 0, 1.5, { type: 'sawtooth', f0: 142, f1: 88, gain: 0.25, attack: 0.15, vib: 7 }); noise(c, o, 0, 1.5, { f0: 600, f1: 300, q: 0.7, gain: 0.6, attack: 0.15 }); }],
    // 덩굴이 솟음: 바스락 + 쉭
    vines:  [0.6, (c, o) => { for (let i = 0; i < 6; i++) noise(c, o, i * 0.05, 0.12, { f0: 2500 + i * 200, f1: 1500, q: 3, gain: 0.35 }); noise(c, o, 0, 0.5, { type: 'lowpass', f0: 600, f1: 200, gain: 0.4 }); }],
    thorns: [0.4, (c, o) => { for (let i = 0; i < 4; i++) noise(c, o, i * 0.04, 0.1, { f0: 3000, f1: 1800, q: 4, gain: 0.3 }); tone(c, o, 0, 0.2, { f0: 160, f1: 80, gain: 0.4 }); }],
    // 문 열림: 돌 긁히는 낮은 소리
    gate:   [1.4, (c, o) => { noise(c, o, 0, 1.3, { type: 'lowpass', f0: 400, f1: 150, gain: 0.8, attack: 0.3, curve: 'lin' }); tone(c, o, 0, 1.3, { f0: 55, f1: 45, gain: 0.5, attack: 0.3 }); }],
    // 화면 글자·버튼
    ui:     [0.08, (c, o) => tone(c, o, 0, 0.06, { type: 'triangle', f0: 900, f1: 700, gain: 0.25 })],
    banner: [0.9, (c, o) => { tone(c, o, 0, 0.8, { f0: 110, f1: 100, gain: 0.5, attack: 0.05 }); noise(c, o, 0, 0.6, { type: 'lowpass', f0: 800, f1: 200, gain: 0.3 }); }],
    whoosh: [2.6, (c, o) => noise(c, o, 0, 2.5, { f0: 300, f1: 1800, q: 0.6, gain: 0.6, attack: 1.2 })],
    reward: [1.2, (c, o) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, o, i * 0.09, 0.9, { type: 'triangle', f0: f, gain: 0.25 })); }],
    win:    [2.0, (c, o) => { [[262, 330, 392], [294, 370, 440], [392, 494, 587]].forEach((ch, i) => ch.forEach(f => tone(c, o, i * 0.32, i === 2 ? 1.5 : 0.36, { type: 'sawtooth', f0: f, gain: 0.08, attack: 0.03 }))); }],
    lose:   [1.6, (c, o) => { [392, 349, 311, 262].forEach((f, i) => tone(c, o, i * 0.3, 0.6, { type: 'triangle', f0: f, f1: f * 0.98, gain: 0.25 })); }],
  };

  // 소리마다 크기 (가장 큰 순간 기준, 1 = 최대). 합성음은 만든 뒤 이 크기로 맞춤
  const LEVEL = {
    swing: 0.42, swing2: 0.42, swing3: 0.55, hit: 0.7, hit_heavy: 0.85, hit_boss: 0.7, hurt: 0.8,
    dodge: 0.45, jump: 0.28, land: 0.35, drink: 0.45, heal: 0.5, mob_die: 0.6, arrow: 0.45, explode: 0.85,
    warn: 0.3, smash: 1, roar: 0.9, vines: 0.6, thorns: 0.55, gate: 0.7, ui: 0.3, banner: 0.6,
    whoosh: 0.7, reward: 0.6, win: 0.6, lose: 0.55,
  };
  async function synth(name) {
    const [dur, make] = RECIPE[name];
    const c = new OAC(1, Math.ceil(44100 * dur), 44100);
    const comp = c.createDynamicsCompressor(); comp.connect(c.destination);
    make(c, comp);
    const b = await c.startRendering();
    const d = b.getChannelData(0);
    let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
    if (m > 0) { const k = (LEVEL[name] || 0.6) / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
    return b;
  }
  async function loadFile(url) {
    const r = await fetch(url + '?v=' + (G.VERSION || 0));
    if (!r.ok) throw new Error('없음');
    const data = await r.arrayBuffer();
    return await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
  }

  function init() {
    if (!ok || ctx) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    bgmGain = ctx.createGain(); bgmGain.connect(master);
    applyVolume();
    // 합성음 먼저 만들어 두고, 파일이 있으면 그걸로 바꿈
    for (const name of Object.keys(RECIPE)) synth(name).then(b => { if (b && !buffers[name + '#file']) buffers[name] = b; }).catch(() => {});
    for (const name of FILES) loadFile(`assets/sfx/${name}.mp3`).then(b => { buffers[name] = b; buffers[name + '#file'] = true; }).catch(() => {});
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
    const b = buffers[name]; if (!b) return;
    const now = ctx.currentTime;
    if (lastAt[name] && now - lastAt[name] < 0.03) return;
    lastAt[name] = now;
    const s = ctx.createBufferSource(); s.buffer = b;
    s.playbackRate.value = (o && o.rate) || (1 + (Math.random() - 0.5) * 0.12);   // 매번 살짝 다른 높이 (덜 반복적으로 들림)
    const g = ctx.createGain(); g.gain.value = (o && o.vol != null) ? o.vol : 1;
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
      const b = bgmCache[name] || (bgmCache[name] = await loadFile(BGM[name]));
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

  return { unlock, play, bgm, setVolume, get volume() { return vol(); }, RECIPE };
})();
