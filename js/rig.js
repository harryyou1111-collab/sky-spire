// =====================================================================
// rig.js — 컷아웃 뼈대 계산과 애니메이션
//
// 각도 규칙: 모든 포즈 각도는 "도(°)", 화면 기준 시계 방향이 +
//   - 아래로 늘어진 팔·다리:  - 이면 앞으로, + 이면 뒤로 흔들림
//   - 위로 선 몸통·머리:      + 이면 앞으로 숙임
//   - 아래쪽 마디(무릎):      + 이면 무릎이 굽음
//   - 아래쪽 마디(팔꿈치):    - 이면 팔꿈치가 굽음
// 캐릭터는 항상 "오른쪽을 보는" 상태로 계산하고, 그릴 때만 좌우 반전합니다.
// =====================================================================
G.Rig = (function () {
  const D2R = Math.PI / 180;

  function rot(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  // 뼈대 정의 만들기. lengths로 파츠 길이를 바꿔 다른 캐릭터(몬스터)에 재사용합니다.
  // 각 뼈: parent(부모), at(부모 기준 붙는 위치: [옆, 길이 방향]), rest(기본 각도), len(길이)
  function humanoid(L) {
    const bones = [
      { name: 'hip',      parent: null,       at: [0, 0],                  rest: 0,             len: 0 },
      { name: 'torso',    parent: 'hip',      at: [0, 0],                  rest: Math.PI,       len: L.torso },
      { name: 'head',     parent: 'torso',    at: [0, L.torso],            rest: 0,             len: L.head },
      { name: 'armB_up',  parent: 'torso',    at: [2, L.torso - 5],        rest: Math.PI,       len: L.armUp },
      { name: 'armB_low', parent: 'armB_up',  at: [0, L.armUp],            rest: 0,             len: L.armLow },
      { name: 'armF_up',  parent: 'torso',    at: [-2, L.torso - 5],       rest: Math.PI,       len: L.armUp },
      { name: 'armF_low', parent: 'armF_up',  at: [0, L.armUp],            rest: 0,             len: L.armLow },
      { name: 'weapon',   parent: 'armF_low', at: [0, L.armLow],           rest: -Math.PI / 2,  len: L.weapon },
      { name: 'legB_up',  parent: 'hip',      at: [-3, 0],                 rest: 0,             len: L.legUp },
      { name: 'legB_low', parent: 'legB_up',  at: [0, L.legUp],            rest: 0,             len: L.legLow },
      { name: 'legF_up',  parent: 'hip',      at: [3, 0],                  rest: 0,             len: L.legUp },
      { name: 'legF_low', parent: 'legF_up',  at: [0, L.legUp],            rest: 0,             len: L.legLow },
    ];
    return { bones, hipHeight: L.legUp + L.legLow, footPad: L.footPad || 4 };
  }

  // 포즈를 넣으면 각 뼈의 위치(o)와 각도(a)를 계산. 좌표는 발 기준(0,0)
  // groundFeet = true 이면 더 낮은 발이 바닥(y=0)에 닿도록 몸 전체를 올리고 내림
  function compute(skel, pose, groundFeet) {
    const out = {};
    for (const b of skel.bones) {
      const deg = pose[b.name] || 0;
      if (!b.parent) {
        out[b.name] = { o: { x: 0, y: -skel.hipHeight + (pose.hipY || 0) }, a: deg * D2R, len: 0 };
        continue;
      }
      const p = out[b.parent];
      const off = rot(b.at[0], b.at[1], p.a);
      out[b.name] = { o: { x: p.o.x + off.x, y: p.o.y + off.y }, a: p.a + b.rest + deg * D2R, len: b.len };
    }
    if (groundFeet) {
      const lowest = Math.max(tipY(out.legB_low), tipY(out.legF_low)) + skel.footPad;
      for (const k in out) out[k].o.y -= lowest;
    }
    return out;
  }

  function tipY(j) { return j.o.y + Math.cos(j.a) * j.len; }

  // 뼈 끝 위치 (예: 검 끝 → 나중에 공격 판정에 사용)
  function tip(j) {
    return { x: j.o.x - Math.sin(j.a) * j.len, y: j.o.y + Math.cos(j.a) * j.len };
  }

  // ---------------- 두 마디 IK (팔을 목표 지점으로 뻗기) ----------------
  // 어깨 S에서 목표 T까지 길이 l1(위팔), l2(아래팔)인 팔이 닿도록 각도를 계산
  // outSign: 팔꿈치를 어느 쪽으로 굽힐지 (+1 = 화면 오른쪽, -1 = 왼쪽)
  // 반환: { a1: 위팔 절대 각도, a2: 아래팔 절대 각도, reached: 목표에 닿았는지 }
  function angleOf(dx, dy) { return Math.atan2(-dx, dy); }   // 뼈 방향 → 각도 (이 파일 규칙)

  function ik2(S, T, l1, l2, outSign) {
    let dx = T.x - S.x, dy = T.y - S.y;
    let D = Math.hypot(dx, dy);
    const maxD = (l1 + l2) * 0.98, minD = Math.abs(l1 - l2) + 1;
    const reached = D <= maxD;
    D = Math.max(minD, Math.min(maxD, D));
    const base = angleOf(dx, dy);
    const cosA = (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    // 두 가지 굽힘 중 팔꿈치가 outSign 쪽으로 나가는 것을 고름
    let best = null;
    for (const sgn of [1, -1]) {
      const a1 = base + sgn * alpha;
      const ex = S.x - Math.sin(a1) * l1;
      if (!best || (ex - S.x) * outSign > best.score) {
        const ey = S.y + Math.cos(a1) * l1;
        const tx = S.x + dx / Math.hypot(dx, dy) * D, ty = S.y + dy / Math.hypot(dx, dy) * D;
        best = { a1, a2: angleOf(tx - ex, ty - ey), score: (ex - S.x) * outSign };
      }
    }
    return { a1: best.a1, a2: best.a2, reached };
  }

  // ---------------- 애니메이션 ----------------
  // clip = { dur: 길이(초), loop: 반복 여부, keys: [{ t: 시간, p: 포즈 }, ...] }
  function smooth(u) { return u * u * (3 - 2 * u); }

  function lerpPose(a, b, u) {
    const r = {};
    for (const k in a) r[k] = a[k];
    for (const k in b) {
      const av = a[k] || 0;
      r[k] = av + (b[k] - av) * u;
    }
    for (const k in a) if (!(k in b)) r[k] = a[k] * (1 - u);
    return r;
  }

  function sample(clip, t) {
    const keys = clip.keys;
    if (keys.length === 1) return Object.assign({}, keys[0].p);
    if (clip.loop) t = ((t % clip.dur) + clip.dur) % clip.dur;
    else if (t >= keys[keys.length - 1].t) return Object.assign({}, keys[keys.length - 1].p);
    for (let i = 0; i < keys.length; i++) {
      const k0 = keys[i];
      const k1 = keys[i + 1] || (clip.loop ? { t: clip.dur, p: keys[0].p } : k0);
      if (t >= k0.t && t < k1.t) {
        return lerpPose(k0.p, k1.p, smooth((t - k0.t) / (k1.t - k0.t)));
      }
    }
    return Object.assign({}, keys[0].p);
  }

  function Animator(clips) {
    this.clips = clips;
    this.name = null;
    this.time = 0;
    this.from = {};       // 섞이기 전 포즈
    this.blendT = 1;
    this.blendDur = G.CFG.anim.blend;
    this.pose = {};
  }
  // blend: 이번 전환에만 쓸 섞는 시간 (공격처럼 빠른 동작은 짧게)
  Animator.prototype.play = function (name, restart, blend) {
    if (this.name === name && !restart) return;
    this.from = this.pose;
    this.blendT = 0;
    this.blendDur = blend != null ? Math.max(0.001, blend) : G.CFG.anim.blend;
    this.name = name;
    this.time = 0;
  };
  Animator.prototype.update = function (dt, speed) {
    this.time += dt * (speed == null ? 1 : speed);
    this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
    const target = sample(this.clips[this.name], this.time);
    this.pose = this.blendT >= 1 ? target : lerpPose(this.from, target, smooth(this.blendT));
  };
  Animator.prototype.done = function () {
    const c = this.clips[this.name];
    return !c.loop && this.time >= c.dur;
  };

  return { humanoid, compute, tip, ik2, Animator };
})();
