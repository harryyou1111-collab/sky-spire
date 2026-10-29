// =====================================================================
// intro.js — 보스 등장 연출 (보스방에 처음 들어갈 때 나오는 짧은 장면)
//
// 위아래 검은 띠 → 카메라가 주인공에서 보스 쪽으로 다가감 → 보스가 일어남 → 포효(화면 흔들림·빛)
// → "BOSS · 판" 이름 카드 → 카메라가 돌아오고 전투 시작
//   - 화면을 누르면 건너뜀
//   - 다시 도전할 때는 짧은 버전 (이름 카드만)
//   - 영상 파일 없이 게임 안의 그림·보스 동작으로 만들어서, 보스가 늘어나도 bosses.js 데이터만 있으면 됨
//     보스마다 다르게 하려면 bosses.js의 intro: { rise: 'riseclip', glow: true } 처럼 지정
// =====================================================================
G.BossIntro = (function () {
  const CFG = G.CFG;
  // 시간표 (초)
  const FULL = {
    bars: 0.4,          // 검은 띠가 들어오는 시간
    pan: [0.5, 1.6],    // 카메라: 주인공 → 보스
    rise: [1.1, 2.4],   // 보스가 웅크린 자세에서 일어남
    roar: 2.5,          // 포효 순간 (흔들림·빛)
    card: [2.75, 4.7],  // 이름 카드
    back: [4.1, 4.9],   // 카메라가 원래대로
    end: 5.0,
  };
  const SHORT = { bars: 0.25, card: [0.15, 1.45], end: 1.5 };
  const it = { on: false, t: 0, T: FULL, short: false, roared: false, skipped: false };

  const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
  const span = (t, [a, b]) => ease((t - a) / (b - a));

  function start(short) {
    const B = G.Boss, D = B.def, rise = (D.intro && D.intro.rise) || 'riseclip';
    // 보스마다 시간표를 다르게 할 수 있음 (bosses.js의 intro.full)
    const T = short ? SHORT : Object.assign({}, FULL, (D.intro && D.intro.full) || {});
    Object.assign(it, { on: true, t: 0, short, T, roared: false, skipped: false, carded: false });
    document.body.classList.add('cine');
    B.state.mode = 'intro';
    if (!short && D.poses[rise]) { B.setPose(rise, false, 0, 0); B.state.prev = null; B.state.cur.frame = 0; }
    B.state.introGlow = 0;
  }

  // 화면을 누르면 건너뜀 (이름 카드가 사라지는 부분으로)
  function skip() {
    if (!it.on || it.skipped) return;
    it.skipped = true;
    const T = it.T;
    if (it.t < T.end - 0.45) it.t = T.end - 0.45;
    finishRise();
  }
  addEventListener('pointerdown', () => { if (it.on && it.t > 0.3) skip(); });

  function finishRise() {
    const B = G.Boss;
    B.setPose('idle', false, 0.15); B.state.introGlow = 0;
  }

  // 매 프레임. 끝나면 true
  function update(dt, player) {
    if (!it.on) return true;
    it.t += dt;
    const T = it.T, B = G.Boss, D = B.def;
    if (!it.short && !it.skipped) {
      // 보스가 일어남: 일어나기 영상의 장면을 시간에 맞춰 넘김
      const rise = (D.intro && D.intro.rise) || 'riseclip', P = D.poses[rise];
      if (P && P.clip && it.t < T.rise[1] + 0.05) {
        const seg = D.clips[P.clip].seg.up || [0, 30];
        B.state.cur.frame = Math.round(seg[0] + (seg[1] - seg[0]) * span(it.t, T.rise));
      } else if (B.state.cur.key !== 'idle') B.setPose('idle', false, 0.12);
      // 포효: 화면 흔들림 + 빛 + 먼지
      if (!it.roared && it.t >= T.roar) {
        it.roared = true;
        G.Sound.play(D.roar || 'roar');                // 보스마다 다른 울음 (bosses.js의 roar)
        G.FX.shake(14, 0.7);
        G.BFX.flash(D.baseX, D.baseZ, 160, 420, D.theme.moon, 0.5);
        const dc = D.theme.dust || '90, 80, 60';
        G.BFX.dust(D.baseX - 200, 40, 8, 1.2, dc); G.BFX.dust(D.baseX + 200, 40, 8, 1.2, dc);
        if (D.theme.leaves !== false) G.BFX.leaves(D.baseX, 30, 60, 10);
      }
      // 눈·입 빛: 포효 순간 확 밝아졌다가 서서히 꺼짐
      B.state.introGlow = it.t < T.roar - 0.4 ? 0 : it.t < T.roar ? (it.t - (T.roar - 0.4)) / 0.4 * 0.6 : Math.max(0, 1.3 - (it.t - T.roar) * 0.9);
    }
    if (!it.carded && it.t >= T.card[0]) { it.carded = true; G.Sound.play('banner'); }
    // 주인공은 보스 쪽을 보고 가만히
    player.vx = player.vz = 0; player.facing = 1;
    if (it.t >= T.end) { finish(); return true; }
    return false;
  }

  function finish() {
    it.on = false;
    document.body.classList.remove('cine');
    const B = G.Boss;
    if (B.state.cur.key !== 'idle') B.setPose('idle', false, 0.12);
    B.state.introGlow = 0;
    B.state.mode = 'fight';
    B.state.timer = 1.0;                  // 숨 돌릴 틈
    // 보스 체력 막대가 차오름
    const fill = document.querySelector('#boss-bar .fill');
    if (fill) {
      fill.style.transition = 'none'; fill.style.width = '0%';
      void fill.offsetWidth;
      fill.style.transition = 'width .9s cubic-bezier(.2,.8,.2,1)';
      B.updateUI();
      setTimeout(() => { fill.style.transition = ''; }, 1000);
    }
  }

  // 카메라: { x, y (월드 좌표, 화면 가운데에 올 점), zoom, k (0 = 평소 카메라, 1 = 연출 카메라) }
  //   평소 화면(주인공·보스가 다 보이는)에서 시작해 보스 얼굴 쪽으로 다가갔다가 돌아옴
  function camera(player) {
    if (!it.on || it.short) return null;
    const T = it.T, D = G.Boss.def, F = G.Stage.floorY;
    const u = span(it.t, T.pan), back = it.skipped ? 1 : span(it.t, T.back);
    return { x: D.baseX, y: F(D.baseZ) - 150, zoom: 1.5, k: u * (1 - back) };
  }

  // 화면 위에 그리기 (검은 띠, 이름 카드)
  function draw(ctx, W, H) {
    if (!it.on) return;
    const T = it.T, t = it.t, D = G.Boss.def;
    // 검은 띠
    const inK = ease(t / T.bars), outK = ease((T.end - t) / 0.45);
    const bh = H * 0.12 * Math.min(inK, outK);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
    // 이름 카드
    const [c0, c1] = T.card;
    if (t < c0 || t > c1) return;
    const a = Math.min(ease((t - c0) / 0.25), ease((c1 - t) / 0.4));
    const reveal = ease((t - c0) / 0.45);           // 띠가 왼쪽에서 펼쳐짐
    const cy = H * 0.58;
    ctx.save();
    ctx.globalAlpha = a;
    // 어두운 띠 (가운데 진하고 위아래로 흐려짐), 왼쪽부터 펼쳐짐
    ctx.save();
    ctx.beginPath(); ctx.rect(0, cy - 70, W * reveal, 140); ctx.clip();
    const g = ctx.createLinearGradient(0, cy - 70, 0, cy + 70);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,0,0,.72)'); g.addColorStop(0.7, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, cy - 70, W, 140);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // BOSS (작게, 붉게, 자간 넓게)
    const lift = (1 - ease((t - c0) / 0.5)) * 10;
    ctx.font = '800 15px sans-serif';
    ctx.fillStyle = '#e0573f';
    ctx.fillText('B   O   S   S', W / 2, cy - 38 + lift);
    // 이름 (크게, 금빛). 살짝 크게 시작해서 제자리로
    const sc = 1 + 0.18 * (1 - ease((t - c0) / 0.35));
    ctx.save();
    ctx.translate(W / 2, cy + lift * 0.5); ctx.scale(sc, sc);
    ctx.font = '900 54px serif';
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 14;
    const gg = ctx.createLinearGradient(0, -30, 0, 30);
    gg.addColorStop(0, '#fff2cf'); gg.addColorStop(0.55, '#e8c47a'); gg.addColorStop(1, '#a8783a');
    ctx.fillStyle = gg;
    ctx.fillText(D.name, 0, 0);
    ctx.restore();
    // 이름 양옆 가는 선이 펼쳐짐
    const lw = 150 * ease((t - c0 - 0.15) / 0.5), nameW = 40 + D.name.length * 30;
    ctx.strokeStyle = 'rgba(232, 196, 122, .8)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - nameW, cy); ctx.lineTo(W / 2 - nameW - lw, cy);
    ctx.moveTo(W / 2 + nameW, cy); ctx.lineTo(W / 2 + nameW + lw, cy);
    ctx.stroke();
    // 칭호
    ctx.font = '600 14px sans-serif'; ctx.fillStyle = '#c9c0a8';
    ctx.fillText(`${D.floor || G.Floor.state.n}F  ·  ${D.title}`, W / 2, cy + 40 - lift * 0.5);
    ctx.restore();
  }

  // 연출 중단 (다른 층의 몹 구간으로 넘어갈 때 등): 화면 가림·카메라를 원래대로
  function stop() { it.on = false; document.body.classList.remove('cine'); }

  return { start, update, camera, draw, skip, stop, get on() { return it.on; }, state: it };
})();
