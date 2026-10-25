// =====================================================================
// combat.js — 공격 판정과 피해 (보이는 효과는 effects.js)
// 판정은 3가지 방향을 모두 봅니다: 좌우(x), 높이(h), 깊이(z)
// 지금은 훈련용 허수아비만 있습니다. 1-3단계에서 몬스터가 같은 방식으로 맞게 됩니다.
// =====================================================================
G.Combat = (function () {
  const S = () => G.Stage;

  // 공격 판정 범위
  //   앞쪽 : 공격 방향(dir)으로 f0 ~ f1 거리
  //   옆   : 공격 방향과 직각으로 ±reach
  //   높이 : h0 ~ h1
  // 내려찍기는 방향 없이 발밑 원형 범위
  function attackRange(p) {
    const a = p.atk, [fx, y, w, hh] = a.def.hitbox;
    return { dir: a.dir, f0: fx, f1: fx + w, side: G.CFG.attack.reach, h0: p.h - y - hh, h1: p.h - y,
             down: a.kind === 'down', radius: w / 2 + 6 };
  }

  // 대상 t가 범위 r 안에 있는가 (바닥 평면 + 높이)
  function inRange(p, r, t) {
    if (r.h1 < t.h || r.h0 > t.h + t.height) return false;
    const tx = t.x - p.x, tz = t.z - p.z, rad = t.w / 2;
    if (r.down) return Math.hypot(tx, tz) < r.radius + rad;
    const along = tx * r.dir.x + tz * r.dir.z;          // 앞쪽으로 얼마나
    const side = -tx * r.dir.z + tz * r.dir.x;          // 옆으로 얼마나
    return along > r.f0 - rad && along < r.f1 + rad && Math.abs(side) < r.side + rad * 0.5;
  }

  // ---------- 맞을 수 있는 대상 ----------
  // { x, z, h, w, height, active, onHit(dmg) } — onHit이 있으면 맞았을 때 그 함수를 부름 (예: 보스 손)
  // 허수아비는 onHit 없이 화면에 직접 그려지는 연습용 대상
  const targets = [];

  function addTarget(t) { targets.push(t); return t; }
  function removeTarget(t) { const i = targets.indexOf(t); if (i >= 0) targets.splice(i, 1); }

  function addDummy(x, z) {
    targets.push({ x, z, h: 0, w: 40, height: 104, flash: 0, wobble: 0, wobbleV: 0, total: 0, dummy: true });
  }

  // ---------- 플레이어가 맞음 ----------
  // fromX, fromZ: 공격이 온 곳 (그 반대 방향으로 밀려남)
  function hurtPlayer(p, dmg, fromX, fromZ) {
    const c = G.CFG.player;
    if (p.dead || p.iframe > 0) return false;
    p.hp = Math.max(0, p.hp - dmg);
    p.atk = null; p.dash = null;
    if (p.drink > 0) { p.drink = 0; G.FX.text(p.x, S().screenY(p.z, p.h + 150), '포션 놓침', '#ff8a7a'); }
    let dx = p.x - fromX, dz = p.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    if (Math.abs(dx) < 0.2 && Math.abs(dz) < 0.2) dx = -p.facing;
    p.vx = dx * c.knockback; p.vz = dz * c.knockback * 0.6; p.vh = 320;
    p.onGround = false;
    if (Math.abs(dx) > 0.2) p.facing = -Math.sign(dx);   // 맞은 쪽을 바라봄
    p.hurt = c.hurtTime;
    p.iframe = c.hurtIframe;
    G.FX.hitstop(0.08);
    G.FX.shake(6, 0.2);
    G.FX.spark(p.x, S().screenY(p.z, p.h + 60), dx > 0 ? 1 : -1, 0.8);
    G.FX.text(p.x, S().screenY(p.z, p.h + 130), '-' + dmg, '#ff8a7a');
    if (p.hp <= 0) { p.dead = true; G.Game.lose(); }
    G.Game.updateHUD();
    return true;
  }

  // 플레이어 공격이 대상에 맞았는지 검사. 맞으면 true
  function playerAttack(p) {
    const a = p.atk, r = attackRange(p);
    let hitAny = false;
    for (const t of targets) {
      if (t.active === false) continue;
      if (a.hit.has(t)) continue;                       // 한 번 휘두를 때 같은 대상은 한 번만
      if (!inRange(p, r, t)) continue;
      a.hit.add(t);
      hitAny = true;

      const push = Math.abs(a.dir.x) > 0.3 ? Math.sign(a.dir.x) : (Math.random() < 0.5 ? -1 : 1);
      if (t.onHit) t.onHit(a.def.dmg);
      else {
        t.total += a.def.dmg;
        t.flash = 0.1;
        t.wobbleV += push * (a.def.dmg >= 15 ? 9 : 5);
      }

      // 효과는 대상 몸에서 공격 쪽 (화면 좌표)
      const ch = (Math.max(r.h0, t.h) + Math.min(r.h1, t.h + t.height)) / 2;
      const cx = t.x - a.dir.x * t.w * 0.3;
      G.FX.hitstop(a.def.hitstop);
      G.FX.spark(cx, S().screenY(t.z, ch), push, a.def.dmg >= 15 ? 1 : 0.5);
      G.FX.text(t.x, S().screenY(t.z, t.h + t.height) - 6, String(a.def.dmg));
    }
    return hitAny;
  }

  function update(dt) {
    for (const t of targets) {
      if (!t.dummy) continue;
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
    return targets.filter(t => t.dummy).map(t => ({ key: t.z, draw: ctx => drawTarget(ctx, t) }));
  }

  function drawDebug(ctx, p) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7fffb0';
    for (const t of targets) {
      if (t.active === false) continue;
      const y = S().screenY(t.z, t.h);
      ctx.strokeRect(t.x - t.w / 2, y - t.height, t.w, t.height);
    }
    const c = G.CFG.player, py = S().screenY(p.z, p.h);
    ctx.strokeStyle = p.iframe > 0 ? '#5ab4ff' : '#7fffb0';
    ctx.strokeRect(p.x - c.halfWidth, py - c.height, c.halfWidth * 2, c.height);
    if (p.atk && p.atk.phase === 'active') {
      // 공격 범위를 바닥 평면에 사각형으로 표시
      const r = attackRange(p), d = r.dir, s = r.side;
      const pt = (f, o) => [p.x + d.x * f - d.z * o, S().floorY(p.z + d.z * f + d.x * o) - p.h];
      ctx.fillStyle = 'rgba(255, 70, 70, .35)';
      ctx.beginPath();
      [[r.f0, -s], [r.f1, -s], [r.f1, s], [r.f0, s]].forEach(([f, o], i) => {
        const [x, y] = pt(f, o); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  return { targets, addTarget, removeTarget, addDummy, hurtPlayer, playerAttack, update, drawables, drawDebug };
})();
