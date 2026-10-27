// =====================================================================
// mobs.js — 일반 몹: 등장, 추적, 공격 예고 → 공격 → 빈틈, 맞음, 죽음
//
// 몹 데이터는 floors.js (G.MobDefs). 여기는 움직임·판정·그리기
// 그림은 지금 임시 도형 (3D 몹이 생기면 draw만 교체)
//
// 상태 흐름: spawn(등장) → chase(다가감) → windup(예고) → attack(판정) → recover(빈틈) → chase …
//            맞으면 hurt(잠깐 경직, 예고가 끊김), 체력이 다하면 dead(쓰러지며 사라짐)
// =====================================================================
G.Mobs = (function () {
  const S = () => G.Stage, CFG = G.CFG;
  const list = [];
  const arrows = [];
  let power = 1;
  const R = (a, b) => a + Math.random() * (b - a);

  // ---------- 만들기 ----------
  function spawn(type, x, z) {
    const d = G.MobDefs[type];
    const m = {
      type, d, x, z, h: d.float || 0, vx: 0, vz: 0, vh: 0,
      hp: Math.round(d.hp * power), maxHp: Math.round(d.hp * power),
      state: 'spawn', t: 0, cd: R(0.3, 1.0), face: x < CFG.ARENA_W / 2 ? 1 : -1,
      flash: 0, kb: 0, kbx: 0, kbz: 0, seed: R(0, 100), aim: null,
      halfWidth: d.w / 2, halfDepth: 6, onGround: true,
    };
    m.target = G.Combat.addTarget({ x, z, h: m.h, w: d.w, height: d.height, active: true, mob: m,
                                    onHit: (dmg, push) => hurt(m, dmg, push) });
    list.push(m);
    G.BFX.dust(x, z, 5, 0.8, '90, 80, 60');
    if (d.kind !== 'bomber') G.BFX.leaves(x, z, 20, 5);
    return m;
  }

  function clear() {
    for (const m of list) G.Combat.removeTarget(m.target);
    list.length = 0; arrows.length = 0;
  }
  function setPower(p) { power = p || 1; }
  const alive = () => list.filter(m => m.state !== 'dead').length;

  // ---------- 맞음 ----------
  function hurt(m, dmg, push) {
    if (m.state === 'dead') return;
    m.hp -= dmg;
    m.flash = 0.12;
    const px = G.player ? G.player.x : m.x, pz = G.player ? G.player.z : m.z;
    let dx = m.x - px, dz = m.z - pz; const l = Math.hypot(dx, dz) || 1;
    m.kbx = dx / l; m.kbz = dz / l * 0.6; m.kb = dmg >= 15 ? 300 : 200;
    if (m.hp <= 0) {
      m.state = 'dead'; m.t = 0; m.target.active = false;
      G.BFX.dust(m.x, m.z, 6, 1, '90, 80, 60');
      if (m.d.kind === 'bomber') G.BFX.motes(m.x, m.z, m.h, 12);
      else G.BFX.leaves(m.x, m.z, 40, 6);
      return;
    }
    // 예고·공격 중이면 끊기고 잠깐 경직 (플레이어가 먼저 때리면 이김)
    m.state = 'hurt'; m.t = 0;
  }

  // ---------- 매 프레임 ----------
  function update(dt, p) {
    for (const m of list) {
      m.t += dt;
      m.flash = Math.max(0, m.flash - dt);
      m.cd = Math.max(0, m.cd - dt);
      const d = m.d;
      const dx = p.x - m.x, dz = p.z - m.z, dist = Math.hypot(dx, dz);
      let mvx = 0, mvz = 0;

      if (m.state === 'spawn') { if (m.t > 0.6) { m.state = 'chase'; m.t = 0; } }
      else if (m.state === 'chase') {
        if (Math.abs(dx) > 4) m.face = Math.sign(dx);
        if (d.kind === 'ranged') {
          // 궁수: 플레이어와 가로 거리를 range 근처로 유지, 깊이는 맞춤
          const want = p.x - Math.sign(dx || 1) * d.range;
          const ex = want - m.x;
          if (Math.abs(ex) > 30) mvx = Math.sign(ex);
          if (Math.abs(dz) > 10) mvz = Math.sign(dz) * 0.7;
          if (m.cd <= 0 && Math.abs(Math.abs(dx) - d.range) < 90 && !p.dead) startWindup(m, p);
        } else {
          // 근접·폭탄: 플레이어 옆으로 다가감 (정면으로 겹치지 않게 살짝 옆으로)
          const tx = p.x - Math.sign(dx || 1) * d.range * 0.8, tz = p.z;
          const ex = tx - m.x, ez = tz - m.z, el = Math.hypot(ex, ez);
          if (el > 8) { mvx = ex / el; mvz = ez / el * 0.8; }
          if (m.cd <= 0 && dist < d.range + 10 && Math.abs(dz) < 22 && !p.dead) startWindup(m, p);
        }
      } else if (m.state === 'windup') {
        if (d.kind === 'ranged') {   // 조준은 예고 앞부분 동안 따라감
          if (m.t < d.windup * 0.6) m.aim = { x: p.x, z: p.z };
        }
        if (m.t >= d.windup) startAttack(m, p);
      } else if (m.state === 'attack') {
        if (d.kind === 'melee') {
          // 찌르기: 앞으로 내딛으며 창끝 앞쪽에 판정
          mvx = m.face * (d.lunge / d.speed) * Math.max(0, 1 - m.t / d.active);
          const tipX = m.x + m.face * d.reach;
          if (!m.hitDone && !p.dead && Math.abs(p.z - m.z) < d.thick && p.h < 80 &&
              (p.x - m.x) * m.face > -5 && (p.x - m.x) * m.face < d.reach + 10) {
            if (G.Combat.hurtPlayer(p, Math.round(d.dmg * power), m.x, m.z)) m.hitDone = true;
          }
          m.tip = tipX;
        }
        if (m.t >= d.active) { m.state = 'recover'; m.t = 0; }
      } else if (m.state === 'recover') {
        if (m.t >= d.recover) { m.state = 'chase'; m.t = 0; m.cd = d.cooldown * R(0.8, 1.3); }
      } else if (m.state === 'hurt') {
        if (m.t >= 0.28) { m.state = 'chase'; m.t = 0; m.cd = Math.max(m.cd, 0.4); }
      } else if (m.state === 'dead') {
        continue;
      }

      // 이동 + 밀려남
      const spd = d.speed * (m.state === 'chase' ? 1 : m.state === 'attack' ? 1 : 0.15);
      m.vx = mvx * spd + m.kbx * m.kb;
      m.vz = mvz * spd + m.kbz * m.kb;
      m.kb = Math.max(0, m.kb - 1400 * dt);
      if (d.float) {
        m.x = Math.max(15, Math.min(CFG.ARENA_W - 15, m.x + m.vx * dt));
        m.z = Math.max(0, Math.min(CFG.DEPTH, m.z + m.vz * dt));
        m.h = d.float + Math.sin(m.t * 3 + m.seed) * 6;
      } else {
        m.vh -= CFG.GRAVITY * dt;
        m.onGround = G.Stage.move(m, dt);
      }
    }
    // 몹끼리 겹치지 않게 살짝 밀어냄
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.state === 'dead' || b.state === 'dead') continue;
      const dx = b.x - a.x, dz = (b.z - a.z) * 1.6, d = Math.hypot(dx, dz), min = (a.d.w + b.d.w) / 2;
      if (d < min && d > 0.01) { const k = (min - d) / d * 0.5; a.x -= dx * k; b.x += dx * k; a.z -= dz / 1.6 * k; b.z += dz / 1.6 * k; }
    }
    for (const m of list) Object.assign(m.target, { x: m.x, z: m.z, h: m.h - (m.d.float ? m.d.height / 2 : 0) });

    // 화살
    for (const a of arrows) {
      a.x += a.vx * dt; a.z += a.vz * dt; a.life -= dt;
      for (const pl of G.Stage.data.pillars) {   // 기둥에 꽂힘
        const ex = (a.x - pl.x) / pl.rx, ez = (a.z - pl.z) / pl.rz;
        if (ex * ex + ez * ez < 1 && a.h < pl.h) a.life = 0;
      }
      if (!p.dead && Math.hypot(a.x - p.x, (a.z - p.z) * 1.4) < 18 && a.h > p.h && a.h < p.h + CFG.player.height) {
        if (G.Combat.hurtPlayer(p, a.dmg, a.x - a.vx * 0.05, a.z - a.vz * 0.05)) a.life = 0;
      }
    }
    for (let i = arrows.length - 1; i >= 0; i--) if (arrows[i].life <= 0 || arrows[i].x < -50 || arrows[i].x > CFG.ARENA_W + 50) arrows.splice(i, 1);

    // 쓰러진 몹 정리
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.state === 'dead' && m.t > 0.7) { G.Combat.removeTarget(m.target); list.splice(i, 1); }
    }
  }

  function startWindup(m, p) {
    m.state = 'windup'; m.t = 0; m.hitDone = false;
    m.face = Math.sign(p.x - m.x) || m.face;
    m.aim = { x: p.x, z: p.z };
  }

  function startAttack(m, p) {
    const d = m.d;
    m.state = 'attack'; m.t = 0;
    if (d.kind === 'ranged') {
      const ax = m.aim.x - m.x, az = m.aim.z - m.z, l = Math.hypot(ax, az) || 1;
      arrows.push({ x: m.x + m.face * 20, z: m.z, h: d.arrowH, vx: ax / l * d.arrowSpeed, vz: az / l * d.arrowSpeed, life: 2.2, dmg: Math.round(d.dmg * power) });
    } else if (d.kind === 'bomber') {
      // 터짐: 범위 안이면 피해, 몹은 사라짐
      G.BFX.flash(m.x, m.z, m.h, d.blast * 1.4, '180, 255, 140', 0.25);
      G.BFX.motes(m.x, m.z, m.h, 16);
      G.FX.shake(5, 0.18);
      if (!p.dead && Math.hypot(p.x - m.x, (p.z - m.z) * 1.6) < d.blast && p.h < m.h + 40) G.Combat.hurtPlayer(p, Math.round(d.dmg * power), m.x, m.z);
      m.hp = 0; m.state = 'dead'; m.t = 0; m.target.active = false; m.exploded = true;
    }
  }

  // ---------- 그리기 ----------
  function drawMob(ctx, m) {
    const d = m.d, F = S().floorY, y = F(m.z) - m.h;
    const fade = m.state === 'dead' ? Math.max(0, 1 - m.t / 0.7) : m.state === 'spawn' ? Math.min(1, m.t / 0.4) : 1;
    if (fade <= 0) return;
    if (!d.float) G.Render.shadow(ctx, m.x, F(m.z), d.w * 0.7, 0.4 * fade);
    else G.Render.shadow(ctx, m.x, F(m.z), 14, 0.25 * fade);
    ctx.save();
    ctx.globalAlpha = fade;
    if (d.kind === 'bomber') drawWisp(ctx, m, y);
    else drawSatyr(ctx, m, y);
    ctx.restore();
    // 체력 막대 (맞은 적 있을 때만)
    if (m.hp < m.maxHp && m.state !== 'dead') {
      const w = 32, top = y - d.height - 12 - (d.float ? -20 : 0);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(m.x - w / 2, top, w, 4);
      ctx.fillStyle = '#e0604a'; ctx.fillRect(m.x - w / 2, top, w * Math.max(0, m.hp / m.maxHp), 4);
    }
  }

  // 사티로스 (임시 그림): 염소 다리, 짧은 뿔, 천 옷, 창 또는 활
  function drawSatyr(ctx, m, y) {
    const d = m.d, f = m.face, H = d.height, white = m.flash > 0;
    const dead = m.state === 'dead';
    ctx.translate(m.x, y);
    if (dead) ctx.rotate(-f * Math.min(1.4, m.t * 4));
    ctx.scale(f, 1);
    const step = m.state === 'chase' ? Math.sin(m.t * 12 + m.seed) : 0;
    const wind = m.state === 'windup' ? Math.min(1, m.t / d.windup) : 0;
    const lean = m.state === 'attack' ? 0.25 : m.state === 'windup' ? -0.12 * wind : m.state === 'hurt' ? -0.25 : 0;
    const ol = '#120d09', skin = white ? '#fff' : d.color, cloth = white ? '#fff' : d.cloth;
    ctx.lineWidth = 2; ctx.strokeStyle = ol; ctx.lineJoin = 'round';
    // 다리 (염소 다리: 무릎이 뒤로 꺾임)
    for (const s of [-1, 1]) {
      const sw = step * s * 10;
      ctx.beginPath(); ctx.moveTo(-4 * s + 0, -H * 0.42); ctx.lineTo(8 + sw, -H * 0.22); ctx.lineTo(-2 + sw, -H * 0.1); ctx.lineTo(2 + sw * 1.2, 0);
      ctx.strokeStyle = ol; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = white ? '#fff' : '#4a3626'; ctx.lineWidth = 6; ctx.stroke();
    }
    ctx.lineWidth = 2; ctx.strokeStyle = ol;
    ctx.save(); ctx.translate(0, -H * 0.42); ctx.rotate(lean);
    // 몸통 + 옷
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, -H * 0.2, 13, H * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.moveTo(-14, -H * 0.08); ctx.lineTo(14, -H * 0.08); ctx.lineTo(16, H * 0.06); ctx.lineTo(-16, H * 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 머리 + 뿔
    const hy = -H * 0.47;
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(3, hy, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = white ? '#fff' : '#d8c7a3';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-2 + s * 4, hy - 7); ctx.quadraticCurveTo(-10 + s * 2, hy - 18, -12 + s * 3, hy - 6); ctx.lineTo(-6 + s * 4, hy - 5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = m.state === 'windup' ? '#ff5a3a' : '#e8ff9a';   // 눈 (예고 중 빨갛게)
    ctx.beginPath(); ctx.arc(9, hy - 1, 2, 0, Math.PI * 2); ctx.fill();
    // 무기
    if (d.kind === 'melee') {
      const back = wind * 18, thrust = m.state === 'attack' ? 22 : 0;
      ctx.strokeStyle = ol; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-28 - back + thrust, -H * 0.2); ctx.lineTo(48 - back + thrust, -H * 0.24); ctx.stroke();
      ctx.strokeStyle = white ? '#fff' : '#6b4a2b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = white ? '#fff' : '#c9ccd2'; ctx.strokeStyle = ol; ctx.lineWidth = 1.5;
      const tx = 48 - back + thrust, ty = -H * 0.24;
      ctx.beginPath(); ctx.moveTo(tx, ty - 5); ctx.lineTo(tx + 14, ty); ctx.lineTo(tx, ty + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (m.state === 'windup') { ctx.fillStyle = `rgba(255, 90, 60, ${0.5 + 0.5 * Math.sin(m.t * 40)})`; ctx.beginPath(); ctx.arc(tx + 8, ty, 5, 0, Math.PI * 2); ctx.fill(); }
    } else {
      // 활: 당길수록 시위가 뒤로
      const bx = 18, by = -H * 0.26;
      ctx.strokeStyle = ol; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(bx, by, 22, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = white ? '#fff' : '#7a5a2c'; ctx.lineWidth = 2.5; ctx.stroke();
      const pull = wind * 16;
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + 22 * Math.cos(-1.2), by + 22 * Math.sin(-1.2)); ctx.lineTo(bx - pull, by); ctx.lineTo(bx + 22 * Math.cos(1.2), by + 22 * Math.sin(1.2)); ctx.stroke();
      if (m.state === 'windup') { ctx.strokeStyle = '#c9ccd2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - pull, by); ctx.lineTo(bx + 26, by); ctx.stroke(); }
    }
    ctx.restore();
  }

  // 도깨비불 (임시 그림): 초록 불덩이, 터지기 전 부풀며 빠르게 깜빡임
  function drawWisp(ctx, m, y) {
    const d = m.d, wind = m.state === 'windup' ? Math.min(1, m.t / d.windup) : 0;
    const r = 11 + wind * 9 + Math.sin(m.t * 10) * 1.5, blink = wind > 0 ? 0.5 + 0.5 * Math.sin(m.t * (20 + 40 * wind)) : 1;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(m.x, y, 1, m.x, y, r * 2.4);
    const c = m.flash > 0 ? '255, 255, 255' : '150, 255, 120';
    g.addColorStop(0, `rgba(${c}, ${0.9 * blink})`); g.addColorStop(0.4, `rgba(${c}, ${0.45 * blink})`); g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(240, 255, 220, ${0.9 * blink})`;
    ctx.beginPath(); ctx.arc(m.x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
    // 꼬리 불꽃
    for (let i = 1; i <= 3; i++) {
      ctx.fillStyle = `rgba(150, 255, 120, ${0.25 / i})`;
      ctx.beginPath(); ctx.arc(m.x - m.vx * 0.03 * i, y + 4 * i - m.vz * 0.02 * i, r * (0.8 - i * 0.15), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (m.state === 'windup') {   // 터지는 범위 예고
      ctx.strokeStyle = `rgba(255, 120, 80, ${0.4 + 0.4 * wind})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(m.x, S().floorY(m.z), d.blast, d.blast / 1.6, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawArrow(ctx, a) {
    const y = S().floorY(a.z) - a.h, l = Math.hypot(a.vx, a.vz) || 1, ux = a.vx / l, uz = a.vz / l * 0.6;
    G.Render.shadow(ctx, a.x, S().floorY(a.z), 6, 0.25);
    ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.x - ux * 22, y - uz * 22); ctx.lineTo(a.x, y); ctx.stroke();
    ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#d8dce2'; ctx.beginPath(); ctx.arc(a.x, y, 2.4, 0, Math.PI * 2); ctx.fill();
  }

  // 궁수 조준선 (예고): 화살이 날아갈 길을 바닥에 얇게 표시
  function drawAims(ctx) {
    const F = S().floorY;
    for (const m of list) {
      if (m.d.kind !== 'ranged' || m.state !== 'windup' || !m.aim) continue;
      const u = Math.min(1, m.t / m.d.windup), ax = m.aim.x - m.x, az = m.aim.z - m.z, l = Math.hypot(ax, az) || 1;
      ctx.strokeStyle = `rgba(255, 90, 60, ${0.25 + 0.45 * u})`; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(m.x, F(m.z)); ctx.lineTo(m.x + ax / l * 600, F(m.z + az / l * 600)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawables() {
    return [...list.map(m => ({ key: m.z, draw: ctx => drawMob(ctx, m) })),
            ...arrows.map(a => ({ key: a.z, draw: ctx => drawArrow(ctx, a) }))];
  }

  return { list, spawn, clear, setPower, alive, update, drawables, drawAims };
})();
