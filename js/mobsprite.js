// =====================================================================
// mobsprite.js — 일반 몹 그림 (3D로 미리 구워 둔 그림을 골라 붙임)
//
// 몹을 매 프레임 3D로 그리면 폰에서 너무 무거워서, 동작을 미리 그림으로 구워 둠
//   그림: assets/mobs/<몹 종류>.webp + .json  (만드는 법: tools/bake_mobs.py)
//   오른쪽을 보는 그림만 있고, 왼쪽은 좌우로 뒤집어서 그림
// 게임 상태(chase, windup, attack …) → 어떤 동작의 몇 초 장면인지는 아래 choose()가 정함
// =====================================================================
G.MobSprite = (function () {
  const sets = {};      // 몹 종류 → { meta, imgs, ready }

  // 공격 동작 구간 (동작 속 시간, 초): s 준비 시작, i 찌르기·휘두르기 시작, i2 끝, e 자세 회복
  // 게임의 예고(windup) → 판정(active) → 빈틈(recover) 시간에 맞춰 늘이거나 줄여서 보여줌
  const SEG = {
    Stab:  { s: 0.45, i: 0.95, i2: 1.45, e: 2.2 },
    Swing: { s: 0.25, i: 0.75, i2: 1.25, e: 2.1 },
    Smash: { s: 0.15, i: 0.62, i2: 0.95, e: 1.8 },
    Draw:  { s: 0.15, i: 1.40 },
    Shoot: { s: 0.40, e: 0.88 },
  };

  function load(type) {
    if (sets[type]) return sets[type];
    const v = '?v=' + (G.VERSION || 0), s = { ready: false, imgs: [] };
    sets[type] = s;
    fetch('assets/mobs/' + type + '.json' + v).then(r => r.ok ? r.json() : null).then(meta => {
      if (!meta) return;
      s.meta = meta;
      let left = meta.sheets.length;
      s.imgs = meta.sheets.map(fn => {
        const im = new Image();
        im.onload = () => { if (--left === 0) s.ready = true; };
        im.src = 'assets/mobs/' + fn + v;
        return im;
      });
    }).catch(() => {});
    return s;
  }
  // 층에 나오는 몹 그림을 미리 불러 둠
  function preload(types) { for (const t of types) if (G.MobDefs[t] && G.MobDefs[t].model) load(t); }

  const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));

  // 게임 상태 → [동작 이름, 동작 속 시간]
  function choose(m) {
    const d = m.d, st = m.state, at = m.at || 0;
    if (st === 'dead') return ['Death', m.t * (d.deathSpeed || 1.3)];
    if (st === 'hurt') return ['Hurt', m.t / 0.28 * 0.55];
    if (d.kind === 'ranged') {
      if (st === 'windup') return ['Draw', lerp(SEG.Draw.s, SEG.Draw.i, m.t / d.windup)];
      if (st === 'attack' || st === 'recover') {
        const u = st === 'attack' ? m.t / (d.active + d.recover) : (d.active + m.t) / (d.active + d.recover);
        return ['Shoot', lerp(SEG.Shoot.s, SEG.Shoot.e, u)];
      }
      return m.moving ? ['Run', null] : ['Aim', at];
    }
    const atk = d.kind === 'heavy' ? (m.atkKind === 'smash' ? 'Smash' : 'Swing') : 'Stab', sg = SEG[atk];
    if (st === 'windup') return [atk, lerp(sg.s, sg.i, m.t / d.windup)];
    if (st === 'attack') return [atk, lerp(sg.i, sg.i2, m.t / d.active)];
    if (st === 'recover') return [atk, lerp(sg.i2, sg.e, m.t / d.recover)];
    if (m.moving) return [d.kind === 'heavy' ? 'Walk' : 'Run', null];
    return [d.kind === 'heavy' ? 'Idle' : 'Guard', at];
  }

  // 동작 + 시간 → 그림 한 장
  //   t가 null이면 걷기·달리기: 움직인 거리 ÷ 동작 속도(굽을 때 잰 발걸음 속도)로 장면을 정함
  function frameOf(s, name, t, m) {
    const c = s.meta.clips[name] || Object.values(s.meta.clips)[0];
    if (t == null) t = c.speed ? (m.dist || 0) / c.speed : (m.at || 0);
    let i = Math.floor((t - c.t0) * c.fps + 1e-4);
    i = c.loop ? ((i % c.n) + c.n) % c.n : Math.max(0, Math.min(c.n - 1, i));
    return c.frames[i];
  }

  // 색 입히기용 작은 캔버스 (맞으면 하얗게, 공격 예고 중엔 붉게)
  const tint = document.createElement('canvas'), tctx = tint.getContext('2d');

  // (x, y) = 발 위치. 그렸으면 true
  function draw(ctx, m, x, y) {
    const s = sets[m.type];
    if (!s || !s.ready) return false;
    const [name, t] = choose(m);
    const f = frameOf(s, name, t, m);
    const [si, sx, sy, sw, sh, ox, oy] = f, k = 1 / s.meta.scale;
    const img = s.imgs[si], dw = sw * k, dh = sh * k;
    let col = null, a = 0;
    if (m.flash > 0) { col = '255,255,255'; a = 0.85; }
    else if (m.state === 'windup') { col = '255,40,20'; a = 0.2 + 0.12 * Math.sin(m.t * 30); }
    let src = img, rx = sx, ry = sy;
    if (col) {
      if (tint.width < sw || tint.height < sh) { tint.width = Math.max(tint.width, sw); tint.height = Math.max(tint.height, sh); }
      tctx.globalCompositeOperation = 'copy';
      tctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = `rgba(${col},${a})`; tctx.fillRect(0, 0, sw, sh);
      src = tint; rx = 0; ry = 0;
    }
    ctx.save();
    ctx.translate(x, y);
    if (m.face < 0) ctx.scale(-1, 1);
    ctx.drawImage(src, rx, ry, sw, sh, ox, oy, dw, dh);
    ctx.restore();
    return true;
  }
  function has(m) { const s = sets[m.type]; return !!(s && s.ready); }

  return { load, preload, draw, has, SEG, sets };
})();
