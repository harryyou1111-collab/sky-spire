// =====================================================================
// combat.js — 공격 판정과 피해 (보이는 효과는 effects.js)
// 지금은 훈련용 허수아비만 있습니다. 1-3단계에서 몬스터가 같은 방식으로 맞게 됩니다.
// =====================================================================
G.Combat = (function () {

  // 공격 판정 상자를 월드 좌표로 (바라보는 방향에 따라 좌우 반전)
  function hitboxWorld(p, hb) {
    const [fx, y, w, h] = hb;
    return { x: p.facing > 0 ? p.x + fx : p.x - fx - w, y: p.y + y, w, h };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- 훈련용 허수아비 ----------
  const targets = [];

  function addDummy(x) {
    targets.push({ x, y: G.CFG.GROUND_Y, w: 40, h: 104, flash: 0, wobble: 0, wobbleV: 0, total: 0 });
  }

  function hurtbox(t) { return { x: t.x - t.w / 2, y: t.y - t.h, w: t.w, h: t.h }; }

  // 플레이어 공격이 대상에 맞았는지 검사. 맞으면 true
  function playerAttack(p) {
    const a = p.atk;
    let hitAny = false;
    const box = hitboxWorld(p, a.def.hitbox);
    for (const t of targets) {
      if (a.hit.has(t)) continue;          // 한 번 휘두를 때 같은 대상은 한 번만
      const hb = hurtbox(t);
      if (!overlap(box, hb)) continue;
      a.hit.add(t);
      hitAny = true;

      t.total += a.def.dmg;
      t.flash = 0.1;
      t.wobbleV += (a.kind === 'up' ? -1 : p.facing) * (a.def.dmg >= 15 ? 9 : 5);

      // 효과는 두 상자가 겹친 곳의 가운데에서
      const cx = (Math.max(box.x, hb.x) + Math.min(box.x + box.w, hb.x + hb.w)) / 2;
      const cy = (Math.max(box.y, hb.y) + Math.min(box.y + box.h, hb.y + hb.h)) / 2;
      G.FX.hitstop(a.def.hitstop);
      G.FX.spark(cx, cy, p.facing, a.def.dmg >= 15 ? 1 : 0.5);
      G.FX.text(t.x, t.y - t.h - 6, String(a.def.dmg));
    }
    return hitAny;
  }

  function update(dt) {
    for (const t of targets) {
      t.flash = Math.max(0, t.flash - dt);
      // 용수철처럼 흔들리다 멈춤
      t.wobbleV += -t.wobble * 120 * dt;
      t.wobbleV *= Math.pow(0.02, dt);
      t.wobble += t.wobbleV * dt;
    }
  }

  function drawTargets(ctx) {
    for (const t of targets) {
      G.Render.shadow(ctx, t.x, t.y, 18, 0.4);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.wobble * 0.08);
      const hit = t.flash > 0;
      ctx.fillStyle = hit ? '#fff' : '#5a4330';             // 기둥
      ctx.fillRect(-4, -t.h, 8, t.h);
      ctx.fillStyle = hit ? '#fff' : '#b39a5c';             // 짚 몸통
      ctx.beginPath(); ctx.ellipse(0, -t.h * 0.58, 17, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -t.h + 8, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hit ? '#fff' : '#7a3a2a';             // 과녁 표시
      ctx.beginPath(); ctx.arc(0, -t.h * 0.58, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hit ? '#fff' : '#5a4330';             // 팔
      ctx.fillRect(-24, -t.h * 0.78, 48, 5);
      ctx.restore();
    }
  }

  function drawDebug(ctx, p) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7fffb0';
    for (const t of targets) { const h = hurtbox(t); ctx.strokeRect(h.x, h.y, h.w, h.h); }
    ctx.strokeStyle = p.iframe > 0 ? '#5ab4ff' : '#7fffb0';
    const c = G.CFG.player;
    ctx.strokeRect(p.x - c.halfWidth, p.y - c.height, c.halfWidth * 2, c.height);
    if (p.atk && p.atk.phase === 'active') {
      const b = hitboxWorld(p, p.atk.def.hitbox);
      ctx.fillStyle = 'rgba(255, 70, 70, .35)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
  }

  return { targets, addDummy, playerAttack, update, drawTargets, drawDebug };
})();
