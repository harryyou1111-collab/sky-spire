// =====================================================================
// combat.js — 공격 판정과 피해 (보이는 효과는 effects.js)
// 판정은 3가지 방향을 모두 봅니다: 좌우(x), 높이(h), 깊이(z)
// 지금은 훈련용 허수아비만 있습니다. 1-3단계에서 몬스터가 같은 방식으로 맞게 됩니다.
// =====================================================================
G.Combat = (function () {
  const S = () => G.Stage;

  // 공격 판정을 x 범위 + 높이 범위로 (바라보는 방향에 따라 좌우 반전)
  // config의 hitbox는 화면 기준([앞, 위아래(-가 위), 가로, 세로])이라 높이로 바꿈
  function attackRange(p) {
    const [fx, y, w, hh] = p.atk.def.hitbox;
    const x0 = p.facing > 0 ? p.x + fx : p.x - fx - w;
    return { x0, x1: x0 + w, h0: p.h - y - hh, h1: p.h - y };
  }

  // ---------- 훈련용 허수아비 ----------
  const targets = [];

  function addDummy(x, z) {
    targets.push({ x, z, h: 0, w: 40, height: 104, flash: 0, wobble: 0, wobbleV: 0, total: 0 });
  }

  // 플레이어 공격이 대상에 맞았는지 검사. 맞으면 true
  function playerAttack(p) {
    const a = p.atk, r = attackRange(p), reach = G.CFG.attack.reach;
    let hitAny = false;
    for (const t of targets) {
      if (a.hit.has(t)) continue;                       // 한 번 휘두를 때 같은 대상은 한 번만
      if (Math.abs(t.z - p.z) > reach) continue;        // 깊이가 다르면 빗나감
      const tx0 = t.x - t.w / 2, tx1 = t.x + t.w / 2;
      if (r.x1 < tx0 || r.x0 > tx1) continue;
      if (r.h1 < t.h || r.h0 > t.h + t.height) continue;
      a.hit.add(t);
      hitAny = true;

      t.total += a.def.dmg;
      t.flash = 0.1;
      t.wobbleV += p.facing * (a.def.dmg >= 15 ? 9 : 5);

      // 효과는 겹친 곳 가운데 (화면 좌표)
      const cx = (Math.max(r.x0, tx0) + Math.min(r.x1, tx1)) / 2;
      const ch = (Math.max(r.h0, t.h) + Math.min(r.h1, t.h + t.height)) / 2;
      G.FX.hitstop(a.def.hitstop);
      G.FX.spark(cx, S().screenY(t.z, ch), p.facing, a.def.dmg >= 15 ? 1 : 0.5);
      G.FX.text(t.x, S().screenY(t.z, t.h + t.height) - 6, String(a.def.dmg));
    }
    return hitAny;
  }

  function update(dt) {
    for (const t of targets) {
      t.flash = Math.max(0, t.flash - dt);
      t.wobbleV += -t.wobble * 120 * dt;       // 용수철처럼 흔들리다 멈춤
      t.wobbleV *= Math.pow(0.02, dt);
      t.wobble += t.wobbleV * dt;
    }
  }

  function drawTarget(ctx, t) {
    const y = S().screenY(t.z, t.h);
    G.Render.shadow(ctx, t.x, y, 18, 0.4);
    ctx.save();
    ctx.translate(t.x, y);
    ctx.rotate(t.wobble * 0.08);
    const hit = t.flash > 0, H = t.height;
    ctx.fillStyle = hit ? '#fff' : '#5a4330';             // 기둥
    ctx.fillRect(-4, -H, 8, H);
    ctx.fillStyle = hit ? '#fff' : '#b39a5c';             // 짚 몸통
    ctx.beginPath(); ctx.ellipse(0, -H * 0.58, 17, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -H + 8, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : '#7a3a2a';             // 과녁 표시
    ctx.beginPath(); ctx.arc(0, -H * 0.58, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : '#5a4330';             // 팔
    ctx.fillRect(-24, -H * 0.78, 48, 5);
    ctx.restore();
  }

  function drawables() {
    return targets.map(t => ({ key: t.z, draw: ctx => drawTarget(ctx, t) }));
  }

  function drawDebug(ctx, p) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7fffb0';
    for (const t of targets) {
      const y = S().screenY(t.z, t.h);
      ctx.strokeRect(t.x - t.w / 2, y - t.height, t.w, t.height);
    }
    const c = G.CFG.player, py = S().screenY(p.z, p.h);
    ctx.strokeStyle = p.iframe > 0 ? '#5ab4ff' : '#7fffb0';
    ctx.strokeRect(p.x - c.halfWidth, py - c.height, c.halfWidth * 2, c.height);
    if (p.atk && p.atk.phase === 'active') {
      const r = attackRange(p), fy = S().floorY(p.z);
      ctx.fillStyle = 'rgba(255, 70, 70, .35)';
      ctx.fillRect(r.x0, fy - r.h1, r.x1 - r.x0, r.h1 - r.h0);
    }
    ctx.restore();
  }

  return { targets, addDummy, playerAttack, update, drawables, drawDebug };
})();
