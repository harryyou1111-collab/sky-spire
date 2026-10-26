// =====================================================================
// bossfx.js — 보스 공격 이펙트 (파편, 먼지, 잎, 번쩍임, 빛 알갱이, 덩굴 그리기)
//
// 좌표는 게임 좌표 (x: 좌우, z: 깊이, h: 높이). 화면 위치 = (x, 바닥선(z) - h)
// boss.js가 공격할 때 여기 함수를 불러서 이펙트를 만들고,
// main.js가 매 프레임 drawTop()으로 캐릭터들 위에 그림
// =====================================================================
G.BFX = (function () {
  const S = () => G.Stage;
  const parts = [];
  let screen = null;                         // 화면 전체 번쩍임 { color, age, life }
  const R = (a, b) => a + Math.random() * (b - a);

  // ---------- 만들기 ----------
  // 돌 파편: 땅을 내리친 곳에서 튀어 오르고 한 번 튕긴 뒤 멈춤
  function debris(x, z, n, power) {
    for (let i = 0; i < n; i++) {
      const a = R(0, Math.PI * 2), sp = R(60, 240) * (power || 1);
      parts.push({ kind: 'rock', x, z, h: R(0, 6), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.4, vh: R(180, 460) * (power || 1),
                   size: R(2.5, 7), rot: R(0, 6), vr: R(-12, 12), age: 0, life: R(0.9, 1.4), bounced: false,
                   color: Math.random() < 0.5 ? '#5d5a52' : '#4a3f33' });
    }
  }
  // 흙먼지: 부풀면서 옅어지는 덩어리
  function dust(x, z, n, spread, color, delay) {
    for (let i = 0; i < n; i++) {
      const a = R(0, Math.PI * 2), sp = R(10, 70) * (spread || 1);
      parts.push({ kind: 'dust', x: x + R(-8, 8), z: z + R(-3, 3), h: R(0, 10), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.3, vh: R(10, 45),
                   size: R(10, 20), grow: R(30, 60), age: -(delay || 0), life: R(0.6, 1.1), color: color || '120, 104, 82' });
    }
  }
  // 나뭇잎: 바람에 날리며 팔랑팔랑 떨어짐
  function leaves(x, z, h, n, dirx, speed) {
    for (let i = 0; i < n; i++) {
      parts.push({ kind: 'leaf', x: x + R(-10, 10), z: z + R(-4, 4), h: h + R(-6, 6),
                   vx: (dirx || R(-1, 1)) * R(60, 160) * (speed || 1), vz: R(-10, 10), vh: R(20, 90),
                   size: R(3, 5.5), rot: R(0, 6), vr: R(-8, 8), age: 0, life: R(1.0, 1.8), ph: R(0, 6),
                   color: ['#5f8a3a', '#7aa04a', '#8b6a3a', '#4c7030'][Math.floor(R(0, 4))] });
    }
  }
  // 빛 알갱이: 한 점으로 빨려 들어감 (to가 있으면) / 위로 떠오름
  function motes(x, z, h, n, to, color) {
    for (let i = 0; i < n; i++) {
      parts.push({ kind: 'mote', x: x + R(-20, 20), z: z + R(-6, 6), h: h + R(-10, 10), vx: R(-10, 10), vz: 0, vh: R(20, 60),
                   size: R(1.5, 3), age: 0, life: R(0.5, 0.9), to, color: color || '170, 255, 140' });
    }
  }
  // 둥근 번쩍임 (내리친 순간)
  function flash(x, z, h, r, color, life) {
    parts.push({ kind: 'flash', x, z, h, r, age: 0, life: life || 0.18, color: color || '255, 250, 220' });
  }
  function screenFlash(color, life) { screen = { color, age: 0, life }; }

  // ---------- 매 프레임 ----------
  function update(dt) {
    for (const p of parts) {
      p.age += dt;
      if (p.age < 0) continue;
      if (p.kind === 'rock') {
        p.vh -= 1100 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.h += p.vh * dt; p.rot += p.vr * dt;
        if (p.h < 0) {
          p.h = 0;
          if (!p.bounced) { p.bounced = true; p.vh = -p.vh * 0.3; p.vx *= 0.5; p.vz *= 0.5; }
          else { p.vh = 0; p.vx *= 0.8; p.vz *= 0.8; p.vr = 0; }
        }
      } else if (p.kind === 'dust') {
        p.x += p.vx * dt; p.z += p.vz * dt; p.h += p.vh * dt; p.vx *= 0.96; p.vh *= 0.97; p.size += p.grow * dt;
      } else if (p.kind === 'leaf') {
        p.vh -= 120 * dt; p.vh = Math.max(p.vh, -40);
        p.x += (p.vx + Math.sin(p.age * 6 + p.ph) * 30) * dt; p.z += p.vz * dt; p.h = Math.max(0, p.h + p.vh * dt);
        p.vx *= 0.985; p.rot += p.vr * dt;
      } else if (p.kind === 'mote') {
        if (p.to) {   // 목표 쪽으로 가속
          const tx = p.to.x - p.x, ty = p.to.h - p.h, d = Math.hypot(tx, ty) || 1;
          p.vx += tx / d * 900 * dt; p.vh += ty / d * 900 * dt;
          p.vx *= 0.9; p.vh *= 0.9;
        }
        p.x += p.vx * dt; p.h += p.vh * dt;
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].age > parts[i].life) parts.splice(i, 1);
    if (screen) { screen.age += dt; if (screen.age > screen.life) screen = null; }
  }

  // ---------- 그리기 (캐릭터들 위에) ----------
  function drawTop(ctx) {
    const F = S().floorY;
    for (const p of parts) {
      if (p.age < 0) continue;
      const u = p.age / p.life, y = F(p.z) - p.h;
      if (p.kind === 'dust') {
        const a = 0.42 * (1 - u) * Math.min(1, p.age / 0.06);
        const g = ctx.createRadialGradient(p.x, y, 1, p.x, y, p.size);
        g.addColorStop(0, `rgba(${p.color}, ${a})`); g.addColorStop(1, `rgba(${p.color}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(p.x, y, p.size, p.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const p of parts) {
      if (p.age < 0) continue;
      const u = p.age / p.life, y = F(p.z) - p.h;
      if (p.kind === 'rock') {
        ctx.save(); ctx.globalAlpha = Math.min(1, (1 - u) * 3);
        ctx.translate(p.x, y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.strokeStyle = '#15120e'; ctx.lineWidth = 1;
        const s = p.size;
        ctx.beginPath(); ctx.moveTo(-s, -s * 0.4); ctx.lineTo(-s * 0.2, -s); ctx.lineTo(s, -s * 0.3); ctx.lineTo(s * 0.6, s * 0.7); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'leaf') {
        ctx.save(); ctx.globalAlpha = Math.min(1, (1 - u) * 2.5);
        ctx.translate(p.x, y); ctx.rotate(p.rot); ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(p.age * 7 + p.ph)));
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'mote') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const a = Math.sin(Math.PI * Math.min(1, u)) * 0.9;
        ctx.fillStyle = `rgba(${p.color}, ${a})`;
        ctx.beginPath(); ctx.arc(p.x, y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'flash') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const r = p.r * (0.6 + 0.6 * u), a = (1 - u);
        const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, r);
        g.addColorStop(0, `rgba(${p.color}, ${0.95 * a})`); g.addColorStop(0.35, `rgba(${p.color}, ${0.45 * a})`); g.addColorStop(1, `rgba(${p.color}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(p.x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    if (screen) {
      const a = 0.35 * (1 - screen.age / screen.life);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${screen.color}, ${a})`;
      ctx.fillRect(-400, -400, G.CFG.ARENA_W + 800, G.CFG.VIEW_H + 800);
      ctx.restore();
    }
  }

  // ---------- 가시덩굴 한 줄기 ----------
  // (x, y): 뿌리 화면 위치, H: 높이, lean: 끝이 기우는 정도, seed: 모양, sway: 흔들림(-1~1), w: 굵기
  function vine(ctx, x, y, H, lean, seed, sway, w) {
    if (H < 2) return;
    let s = seed;
    const rnd = () => (s = (s * 16807 + 11) % 2147483647) / 2147483647;
    const bend = (rnd() - 0.5) * H * 0.6 + sway * H * 0.12;
    const P = t => {   // 2차 곡선 위의 점
      const cx = x + bend, cy = y - H * 0.55, ex = x + lean + sway * H * 0.18, ey = y - H;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      return [a * x + b * cx + c * ex, a * y + b * cy + c * ey];
    };
    const N = 10, L = [], Rt = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = P(t), q = P(Math.min(1, t + 0.02)), r = P(Math.max(0, t - 0.02));
      const dx = q[0] - r[0], dy = q[1] - r[1], d = Math.hypot(dx, dy) || 1;
      const ww = w * (1 - t * 0.92);
      L.push([p[0] - dy / d * ww, p[1] + dx / d * ww]); Rt.push([p[0] + dy / d * ww, p[1] - dx / d * ww]);
    }
    // 몸통 (어두운 초록) + 한쪽 밝은 줄 + 외곽선
    ctx.beginPath();
    L.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    for (let i = Rt.length - 1; i >= 0; i--) ctx.lineTo(Rt[i][0], Rt[i][1]);
    ctx.closePath();
    ctx.fillStyle = '#2f4f22'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#0d150b'; ctx.stroke();
    ctx.beginPath();
    for (let i = 1; i < N; i++) { const a = L[i], b = P(i / N); const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; i > 1 ? ctx.lineTo(m[0], m[1]) : ctx.moveTo(m[0], m[1]); }
    ctx.strokeStyle = 'rgba(140, 190, 90, .55)'; ctx.lineWidth = 1.3; ctx.stroke();
    // 가시
    for (let i = 2; i < N; i++) {
      const side = i % 2 ? L : Rt, b = P(i / N), a = side[i], k = 1 - i / N;
      const ox = a[0] - b[0], oy = a[1] - b[1], d = Math.hypot(ox, oy) || 1;
      const tx = a[0] + ox / d * (4 + 4 * k), ty = a[1] + oy / d * (4 + 4 * k) - 2;
      ctx.fillStyle = '#d9d2a6';
      ctx.beginPath(); ctx.moveTo(a[0] - oy / d * 1.6, a[1] + ox / d * 1.6); ctx.lineTo(tx, ty); ctx.lineTo(a[0] + oy / d * 1.6, a[1] - ox / d * 1.6); ctx.fill();
    }
    // 잎 한두 장
    for (const t of [0.45, 0.7]) {
      if (rnd() < 0.35) continue;
      const p = P(t), dir = rnd() < 0.5 ? -1 : 1;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(dir * 0.9 - 0.3);
      ctx.fillStyle = '#5f8a3a';
      ctx.beginPath(); ctx.ellipse(dir * 6, 0, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function clear() { parts.length = 0; screen = null; }

  return { debris, dust, leaves, motes, flash, screenFlash, update, drawTop, vine, clear };
})();
