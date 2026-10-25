// =====================================================================
// effects.js — 눈에 보이는 효과만 담당 (판정과 피해는 combat.js)
//   hitstop : 맞는 순간 잠깐 멈춤
//   sparks  : 타격 불꽃
//   trail   : 검 궤적 잔상
//   ghosts  : 대시 잔상
//   texts   : 피해 숫자
// =====================================================================
G.FX = (function () {
  const fx = { hitstop: 0, sparks: [], trail: [], ghosts: [], texts: [] };

  function hitstop(t) { fx.hitstop = Math.max(fx.hitstop, t); }

  function spark(x, y, dir, power) {
    const n = 8 + Math.round(power * 6);
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 1.6 + (dir > 0 ? 0 : Math.PI);
      const s = 200 + Math.random() * 380 * power;
      fx.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.22 + Math.random() * 0.12, age: 0 });
    }
    // 중심 섬광
    fx.sparks.push({ x, y, flash: true, size: 16 + power * 14, life: 0.08, age: 0 });
  }

  function text(x, y, str) { fx.texts.push({ x, y, str, age: 0, life: 0.6 }); }

  // 검 궤적: 칼끝(tip)과 칼날 중간(base)의 월드 좌표를 매 프레임 기록
  function trailPoint(tip, base) { fx.trail.push({ tip, base, age: 0 }); }

  function ghost(snapshot) { fx.ghosts.push(Object.assign({ age: 0, life: 0.18 }, snapshot)); }

  function update(dt) {
    for (const s of fx.sparks) {
      s.age += dt;
      if (!s.flash) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 900 * dt; s.vx *= 0.92; }
    }
    fx.sparks = fx.sparks.filter(s => s.age < s.life);
    fx.trail.forEach(t => { t.age += dt; });
    fx.trail = fx.trail.filter(t => t.age < 0.09);
    fx.ghosts.forEach(g => { g.age += dt; });
    fx.ghosts = fx.ghosts.filter(g => g.age < g.life);
    fx.texts.forEach(t => { t.age += dt; });
    fx.texts = fx.texts.filter(t => t.age < t.life);
  }

  // 캐릭터 뒤에 그릴 것
  function drawBack(ctx, drawGhost) {
    for (const g of fx.ghosts) drawGhost(ctx, g, 0.35 * (1 - g.age / g.life));
  }

  // 캐릭터 앞에 그릴 것
  function drawFront(ctx) {
    // 검 궤적: 오래된 점일수록 투명한 띠
    const tr = fx.trail;
    if (tr.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i];
        const alpha = 0.55 * (1 - b.age / 0.09);
        ctx.fillStyle = `rgba(230, 235, 255, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.base.x, a.base.y); ctx.lineTo(a.tip.x, a.tip.y);
        ctx.lineTo(b.tip.x, b.tip.y); ctx.lineTo(b.base.x, b.base.y);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of fx.sparks) {
      const k = 1 - s.age / s.life;
      if (s.flash) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size);
        g.addColorStop(0, `rgba(255, 250, 220, ${k})`);
        g.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = `rgba(255, 220, 140, ${k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); ctx.stroke();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const t of fx.texts) {
      const k = t.age / t.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = '#000';
      ctx.fillText(t.str, t.x + 1, t.y - k * 30 + 1);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(t.str, t.x, t.y - k * 30);
    }
    ctx.restore();
  }

  return { state: fx, hitstop, spark, text, trailPoint, ghost, update, drawBack, drawFront };
})();
