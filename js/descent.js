// =====================================================================
// descent.js — 오프닝: 탑 꼭대기에서 입구까지 카메라가 내려오는 장면
//
// 처음 탑에 오를 때 한 번 나옴 (설정에서 다시 보기 가능). 화면을 누르면 건너뜀
// 그림 한 장(assets/world/tower.jpg, 세로로 긴 탑 전체)을 코드로 움직임 (약 19초):
//   꼭대기 빛에서 천천히 → 점점 빨라지며 구름을 뚫고 내려감 → 입구 문 앞에서 멈춤 → 문으로 다가감(룬이 빛남)
//   → "천공탑" 제목 → 하얗게 번쩍 → 1층
// 문장(LINES)과 카메라 위치(CAM)는 아래 표만 고치면 됨
// 그림 속 위치는 TOWER의 비율(0~1)로 지정 → 그림을 바꾸면 이 숫자만 맞추면 됨
// =====================================================================
G.Descent = (function () {
  const TOWER = {
    src: 'assets/world/tower.jpg',
    peak: [0.5, 0.005],     // 꼭대기 빛
    gate: [0.5, 0.875],     // 입구 문 가운데
  };
  // 카메라: [시간(초), 내려온 정도(0 = 꼭대기, 1 = 맨 아래)]. 사이는 부드럽게 이어짐 (멈칫거리지 않게)
  const CAM = [[0, 0], [2.6, 0.02], [5.6, 0.2], [8.6, 0.55], [11.4, 0.93], [12.6, 1]];
  // 시간표 (초): 문으로 다가감, 하얗게 번쩍, 끝
  const T = { push: [12.2, 14.6], flash: [18.0, 18.6], end: 19.0 };
  // 화면 글자: [시작, 끝, 글자, 종류]  종류 title = 큰 제목, line = 이야기 문장
  const LINES = [
    [0.6, 3.4, '하늘을 꿰뚫고 솟은 탑이 있다', 'line'],
    [3.8, 6.4, '백 개의 층, 백 개의 세계', 'line'],
    [6.8, 9.4, '층마다 신과 괴수가 다음 문을 지킨다', 'line'],
    [9.8, 12.4, '수많은 이들이 올랐으나, 꼭대기에 닿은 자는 없다', 'line'],
    [12.8, 14.6, '그리고 오늘, 한 사람이 홀로 문 앞에 섰다', 'line'],
    [14.4, 18.1, '천공탑', 'title'],   // 제목은 길게 머문 뒤 빛
  ];

  const SFX = [[5.2, 'whoosh', { vol: 0.7 }], [8.2, 'whoosh', { vol: 0.9, rate: 1.15 }], [12.2, 'gate'], [14.4, 'banner'], [18.0, 'smash', { vol: 0.5, rate: 1.4 }]];
  const cv = document.createElement('canvas');
  cv.id = 'descent';
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:14;display:none;touch-action:none';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const img = new Image();
  let run = null;

  const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const span = (t, [a, b]) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  // 카메라 표(CAM) 사이를 부드러운 곡선으로 이음 (속도가 끊기지 않게)
  function camAt(t) {
    const K = CAM, n = K.length;
    if (t <= K[0][0]) return K[0][1];
    if (t >= K[n - 1][0]) return K[n - 1][1];
    let i = 0; while (K[i + 1][0] < t) i++;
    const [t0, p0] = K[i], [t1, p1] = K[i + 1], h = t1 - t0, u = (t - t0) / h;
    const slope = j => (j <= 0 || j >= n - 1) ? 0 : (K[j + 1][1] - K[j - 1][1]) / (K[j + 1][0] - K[j - 1][0]);
    const m0 = slope(i) * h, m1 = slope(i + 1) * h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
  }

  function play(done) {
    if (!img.src) img.src = TOWER.src + '?v=' + (G.VERSION || 0);
    run = { t: 0, done, last: performance.now(), prevCy: null, clouds: [], lines: [], snd: {} };
    G.Sound.bgm('opening');
    for (let i = 0; i < 9; i++) run.clouds.push({ x: Math.random(), y: Math.random() * 3, r: 0.35 + Math.random() * 0.45, a: 0.35 + Math.random() * 0.35 });
    for (let i = 0; i < 40; i++) run.lines.push({ x: Math.random(), y: Math.random(), l: 0.05 + Math.random() * 0.15 });
    cv.style.display = 'block';
    requestAnimationFrame(frame);
  }
  function finish() {
    if (!run) return;
    const d = run.done; run = null;
    cv.style.display = 'none';
    if (!d) G.Sound.bgm('lobby');
    if (d) d();
  }
  // 누르면 건너뜀 (번쩍 장면으로)
  cv.addEventListener('pointerdown', () => { if (run && run.t < T.flash[0]) run.t = T.flash[0]; });

  function frame(now) {
    if (!run) return;
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    run.t += dt;
    const t = run.t;
    // 효과음: [시간, 소리]
    for (const [at, name, o] of SFX) if (t >= at && !run.snd[at]) { run.snd[at] = 1; if (t < at + 0.5) G.Sound.play(name, o); }
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#9cc6f0'; ctx.fillRect(0, 0, W, H);
    if (img.complete && img.naturalWidth) draw(t, dt, W, H);
    if (t >= T.end) { finish(); return; }
    requestAnimationFrame(frame);
  }

  function draw(t, dt, W, H) {
    const iw = img.naturalWidth, ih = img.naturalHeight, s0 = W / iw;
    // 카메라 (그림 좌표): 가운데 cx, cy와 확대 z
    const top = H / 2 / s0, bottom = ih - H / 2 / s0;
    const f = camAt(t), p = ease(span(t, T.push));
    let cy = top + (bottom - top) * f, cx = iw / 2, z = 1 + 0.55 * Math.sin(Math.PI * Math.min(1, f));   // 내려오는 중간엔 탑에 가까이
    // 문으로 다가감
    const gx = TOWER.gate[0] * iw, gy = TOWER.gate[1] * ih;
    z += (1.9 - z) * p;
    cx += (gx - cx) * p; cy += (gy - cy) * p;
    const s = s0 * z;
    // 화면 밖이 보이지 않게
    cy = Math.max(H / 2 / s, Math.min(ih - H / 2 / s, cy));
    const v = run.prevCy == null ? 0 : (cy - run.prevCy) / Math.max(dt, 1e-3) * s;   // 화면에서의 속도 (px/초)
    run.prevCy = cy;
    const fast = Math.min(1, Math.max(0, Math.abs(v) - 120) / 380);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = cv.width / W;
    ctx.setTransform(s * dpr, 0, 0, s * dpr, (W / 2 - cx * s) * dpr, (H / 2 - cy * s) * dpr);
    ctx.drawImage(img, 0, 0);
    // 빠를 때 위아래로 번지는 잔상 (속도감)
    if (fast > 0.05) {
      ctx.globalAlpha = 0.25 * fast;
      ctx.drawImage(img, 0, -v * 0.012 / s);
      ctx.drawImage(img, 0, -v * 0.024 / s);
      ctx.globalAlpha = 1;
    }
    // 꼭대기 빛 (처음에 강하게, 내려가며 옅어짐)
    const pk = 1 - span(t, [2.0, 5.0]);
    if (pk > 0) glow(TOWER.peak[0] * iw, TOWER.peak[1] * ih, 260, `rgba(255, 252, 230, ${0.85 * pk})`);
    // 문의 룬이 빛남
    if (p > 0) glow(gx, gy, 170, `rgba(140, 200, 255, ${0.45 * p * (0.8 + 0.2 * Math.sin(t * 8))})`);
    ctx.restore();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 스쳐 지나가는 구름 (카메라보다 빨리 위로)
    const cloudK = Math.min(1, fast * 1.6);
    if (cloudK > 0) for (const c of run.clouds) {
      c.y -= v / H * 1.7 * dt;
      if (c.y < -0.6) { c.y += 2.4; c.x = Math.random(); }
      const x = c.x * W, y = c.y * H, r = c.r * W * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${c.a * cloudK})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 속도선
    if (fast > 0.15) {
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * fast})`; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const L of run.lines) {
        L.y -= v / H * 2.6 * dt; if (L.y < -0.2) { L.y += 1.4; L.x = Math.random(); }
        const x = L.x * W, y = L.y * H;
        ctx.moveTo(x, y); ctx.lineTo(x, y + L.l * H * fast);
      }
      ctx.stroke();
    }
    // 위아래 검은 띠
    const bh = H * 0.1 * Math.min(1, t / 0.4);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    // 글자
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [a, b, text, kind] of LINES) {
      const k = Math.min(span(t, [a, a + 0.6]), 1 - span(t, [b - 0.6, b]));
      if (k <= 0) continue;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#fff8e6';
      if (kind === 'title') {
        const sc = 1.12 - 0.12 * ease(span(t, [a, a + 1.2]));
        ctx.translate(W / 2, H * 0.44); ctx.scale(sc, sc);
        ctx.font = '900 46px serif';
        ctx.fillText('천 공 탑', 0, 0);
        ctx.font = '600 13px sans-serif'; ctx.fillStyle = '#e8e2d4';
        ctx.fillText('홀 로   오 르 는   자', 0, 40);
      } else {
        // 이야기 문장: 화면 아래쪽, 살짝 떠오르며 나타남 (밝은 구름 위에서도 보이게 뒤를 어둡게)
        const y0 = H * 0.62, bg = ctx.createLinearGradient(0, y0, 0, H);
        bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(0,0,0,.55)');
        ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = bg; ctx.fillRect(0, y0, W, H - y0); ctx.restore();
        ctx.font = '600 17px serif';
        ctx.fillText(text, W / 2, H - H * 0.1 - 34 + (1 - k) * 8);
      }
      ctx.restore();
    }
    // 건너뛰기 안내
    if (t < T.flash[0]) {
      ctx.font = '600 11px sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText('화면을 누르면 건너뛰기', W - 16, H * 0.1 / 2 + 2);
    }
    // 하얗게 번쩍 → 검게 (1층으로)
    const fl = span(t, T.flash);
    if (fl > 0) {
      ctx.fillStyle = fl < 0.5 ? `rgba(255,255,255,${fl * 2})` : `rgba(${255 * (2 - fl * 2)},${255 * (2 - fl * 2)},${255 * (2 - fl * 2)},1)`;
      ctx.fillRect(0, 0, W, H);
    }
    if (t > T.flash[1]) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  }

  function glow(x, y, r, col) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  return { play, get on() { return !!run; }, TOWER, T };
})();
