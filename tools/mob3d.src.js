// =====================================================================
// mob3d.src.js — 일반 몹 3D → 그림(스프라이트) 굽기용
//
// 게임에서 몹을 매 프레임 3D로 그리면 폰에서 너무 무거움 (몹 6마리에 11fps).
// 그래서 이 파일은 게임에 넣지 않고, tools/bake.html에서 몹의 동작을 미리 한 장씩 그려서
// assets/mobs/<몹>.webp(그림 모음) + .json(각 그림 위치)으로 저장하는 데만 씀 (tools/bake_mobs.py)
// 게임은 js/mobsprite.js가 그 그림을 골라 붙임 → 몹이 많아도 가벼움
//
//   - 모델: assets/mobs/*.glb (Mixamo 뼈대 + 동작)
//   - 무기: 창·활·몽둥이는 코드로 만든 모양. 손 위치를 따라가고, 방향은 무기마다 정한 규칙(WEAPONS)으로 정함
//   - 주인공과 같은 만화풍 명암 + 외곽선, 같은 카메라 각도
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const G = window.G;
const UPM = 112 / 1.8;                  // 1미터 = 게임 단위 (주인공과 같은 비율)
const PITCH = THREE.MathUtils.degToRad(22);
const SW = 300, SH = 320, FOOT = 0.85;  // 칸 크기 (게임 단위), 발 위치 (칸 위에서부터 비율)
const COLS = 4, ROWS = 2;               // 동시에 3D로 그리는 몹 수 = 8 (넘으면 임시 그림)

// 모델 파일
const MODELS = {
  satyr: 'assets/mobs/satyr.glb',
  brute: 'assets/mobs/brute.glb',
};

// 공격 동작 구간: s 준비 시작, i 휘두르기(찌르기) 시작, i2 끝, e 자세 회복 (동작 속 시간, 초)
// 게임의 예고(windup) → 판정(active) → 빈틈(recover) 시간에 맞춰 늘이거나 줄여서 재생
const SEG = {
  Stab:  { s: 0.45, i: 0.95, i2: 1.45, e: 2.2 },
  Swing: { s: 0.25, i: 0.75, i2: 1.25, e: 2.1 },
  Smash: { s: 0.15, i: 0.62, i2: 0.95, e: 1.8 },
  Draw:  { s: 0.15, i: 1.40 },          // 활 당기기: 예고 동안 s → i
  Shoot: { s: 0.40, e: 0.88 },          // 쏘고 반동: 판정+빈틈 동안 s → e
};

// 무기: 손 뼈 기준 위치(미터)·회전(도). 손에 쥔 모양이 어색하면 이 숫자만 조정
const WEAPONS = {
  // 창: 오른손에 쥐고 항상 앞쪽을 향함 (tilt: 아래로 기울기)
  spear: { hand: 'RightHand', mode: 'forward', tilt: -0.12 },
  // 활: 왼손에 쥐고 똑바로 세움 (앞으로 휜 쪽이 바라보는 방향)
  bow:   { hand: 'LeftHand',  mode: 'upright' },
  // 몽둥이: 오른손에 쥐고 팔뚝 방향을 따라감 (+ 앞쪽으로 조금) → 휘두르면 크게 원을 그림
  club:  { hand: 'RightHand', fore: 'RightForeArm', mode: 'arm', ahead: 0.5 },
};
const M = { ready: false, models: {}, WEAPONS, SEG };
let renderer, scene, camera, dpr = 0;
const pool = new Map();     // 몹 → 3D 인스턴스

function grad3(a, b, c) {
  const g = new THREE.DataTexture(new Uint8Array([a, a, a, 255, b, b, b, 255, c, c, c, 255]), 3, 1, THREE.RGBAFormat);
  g.minFilter = g.magFilter = THREE.NearestFilter; g.needsUpdate = true; return g;
}
const GRAD = grad3(90, 170, 255);
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0b0d0a, side: THREE.BackSide });

function init() {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe8d0, 0x1a2418, 0.9));
  const moon = new THREE.DirectionalLight(0xd8ffd0, 1.6); moon.position.set(-2, 4, -3); scene.add(moon);
  const front = new THREE.DirectionalLight(0xfff2dd, 1.1); front.position.set(1.5, 2, 4); scene.add(front);
  camera = new THREE.OrthographicCamera(-SW / 2 / UPM, SW / 2 / UPM, SH * FOOT / UPM, -SH * (1 - FOOT) / UPM, -50, 50);
  camera.position.set(0, Math.sin(PITCH) * 10, Math.cos(PITCH) * 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const loader = new GLTFLoader(), v = '?v=' + (G.VERSION || 0);
  let left = Object.keys(MODELS).length;
  for (const [key, url] of Object.entries(MODELS)) {
    loader.load((G.BAKE_BASE || '') + url + v, gltf => { prepModel(key, gltf); if (--left === 0) M.ready = true; },
      undefined, e => { console.warn('몹 3D 모델을 못 불러옴:', url, e); if (--left === 0) M.ready = true; });
  }
  resize();
}

function resize() {
  const d = Math.min(2, G.viewScale || 1);
  if (d === dpr) return;
  dpr = d;
  renderer.setSize(Math.round(SW * dpr) * COLS, Math.round(SH * dpr) * ROWS, false);
}

// 모델 준비: 키 재기, 만화풍 재질 (모델마다 한 벌을 모든 복사본이 같이 씀)
function prepModel(key, gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const mats = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const old = o.material;
    const mat = new THREE.MeshToonMaterial({ map: old.map || null, color: 0xffffff, gradientMap: GRAD, emissive: 0x000000 });
    mats.push(mat);
    o.material = mat;
    o.geometry.computeBoundingBox();
  });
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  M.models[key] = { root, height: box.max.y - box.min.y, minY: box.min.y, mats, clips };
}

// 외곽선 재질 (모델 키에 비례한 두께)
function outlineFor(geo) {
  const bb = geo.boundingBox, th = Math.max(bb.max.y - bb.min.y, bb.max.z - bb.min.z) * 0.007;
  const key = th.toFixed(6);
  outlineFor.cache = outlineFor.cache || {};
  if (!outlineFor.cache[key]) {
    const line = OUTLINE.clone();
    line.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>',
        '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * ' + key + ';');
    };
    outlineFor.cache[key] = line;
  }
  return outlineFor.cache[key];
}

// ---------- 무기 모양 ----------
function toon(color) { return new THREE.MeshToonMaterial({ color, gradientMap: grad3(110, 190, 255), emissive: 0x000000 }); }
function withLine(mesh, s) {
  const g = new THREE.Group();
  const l = new THREE.Mesh(mesh.geometry, OUTLINE); l.scale.setScalar(s || 1.06);
  l.position.copy(mesh.position); l.rotation.copy(mesh.rotation);
  g.add(mesh, l); return g;
}
function makeWeapon(kind) {
  const g = new THREE.Group();
  const wood = toon(0x6b4a2b), iron = toon(0xb9bec6), bone = toon(0xe0d6bd);
  if (kind === 'spear') {
    // 자루 1.8m, 손에서 앞쪽으로 1.2m (+Y가 앞)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.8, 6), wood); shaft.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 4), iron); tip.position.y = 1.33;
    const bind = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6), bone); bind.position.y = 1.18;
    g.add(withLine(shaft, 1.25), withLine(tip, 1.12), bind);
    g.userData.tip = tip;
  } else if (kind === 'bow') {
    // 활: 손잡이를 중심으로 위아래로 휜 활대 + 시위 (+Y가 위, +X가 앞)
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.1, -0.62, 0), new THREE.Vector3(0.32, 0, 0), new THREE.Vector3(-0.1, 0.62, 0));
    const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.02, 5), wood);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.24, 3), new THREE.MeshBasicMaterial({ color: 0xd8d0b8 }));
    str.position.x = -0.1;
    g.add(withLine(limb, 1.0), str);
    g.userData.string = str;
  } else if (kind === 'club') {
    // 몽둥이: 손잡이에서 굵어지는 나무 + 박힌 뼈 가시 (+Y가 앞)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.04, 1.0, 7), wood); body.position.y = 0.38;
    g.add(withLine(body, 1.1));
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), bone);
      const a = i * 2.4, y = 0.6 + (i % 2) * 0.15;
      sp.position.set(Math.cos(a) * 0.1, y, Math.sin(a) * 0.1);
      sp.lookAt(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4); sp.rotateX(Math.PI / 2);
      g.add(sp);
    }
    g.userData.tip = body;
  }
  return g;
}

// ---------- 몹 하나의 3D 복사본 ----------
function create(m) {
  const key = m.d.model, mdl = M.models[key];
  if (!mdl) return null;
  const obj = cloneSkinned(mdl.root);
  const lines = [];
  obj.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const line = outlineFor(o.geometry);
    const copy = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, line) : new THREE.Mesh(o.geometry, line);
    if (o.isSkinnedMesh) copy.bind(o.skeleton, o.bindMatrix);
    copy.frustumCulled = false;
    lines.push([o.parent, copy]);
  });
  lines.forEach(([p, c]) => p.add(c));
  // 키를 게임 단위에 맞춤
  const k = (m.d.h3d || m.d.height) / UPM / mdl.height;
  const holder = new THREE.Group();
  obj.scale.setScalar(k); obj.position.y = -mdl.minY * k;
  holder.add(obj);
  holder.visible = false;
  scene.add(holder);
  // 무기 (holder에 붙이고 매 프레임 손 위치로 옮김)
  let weapon = null, hand = null, fore = null;
  const wd = m.d.weapon && WEAPONS[m.d.weapon];
  if (wd) {
    obj.traverse(o => {
      if (!o.isBone) return;
      if (new RegExp(wd.hand + '$').test(o.name)) hand = o;
      if (wd.fore && new RegExp(wd.fore + '$').test(o.name)) fore = o;
    });
    if (hand) { weapon = makeWeapon(m.d.weapon); holder.add(weapon); }
  }
  const mixer = new THREE.AnimationMixer(obj);
  const inst = { m, key, mdl, holder, obj, mixer, weapon, wd, hand, fore, actions: {}, cur: null, curName: '', yaw: m.face * Math.PI / 2, slot: -1 };
  for (const [n, c] of Object.entries(mdl.clips)) inst.actions[n] = mixer.clipAction(c);
  return inst;
}

function dispose(inst) {
  scene.remove(inst.holder);
  inst.mixer.stopAllAction();
}

// 동작 고르기: name 동작으로 바꾸고 time이 있으면 그 시점에 멈춰 둠 (없으면 speed로 재생)
function pose(inst, name, time, speed, fade) {
  const a = inst.actions[name] || inst.actions.Idle;
  if (!a) return;
  if (inst.cur !== a) {
    a.reset(); a.setLoop(time == null ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; a.play();
    if (inst.cur) a.crossFadeFrom(inst.cur, fade ?? 0.15, false);
    inst.cur = a; inst.curName = name;
  }
  if (time != null) { a.paused = true; a.time = Math.max(0, Math.min(a.getClip().duration - 0.001, time)); }
  else { a.paused = false; a.timeScale = speed || 1; }
}
const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));

// 게임 상태 → 동작
function choose(inst, dt) {
  const m = inst.m, d = m.d, st = m.state, mv = Math.hypot(m.vx, m.vz);
  const kind = d.kind;
  if (M.debugPose) return pose(inst, M.debugPose[0], M.debugPose[1], 0, 0);   // 개발 확인용: G.Mob3D.debugPose = ['Stab', 1.2]
  if (st === 'dead') return pose(inst, 'Death', m.t * (d.deathSpeed || 1.3), 0, 0.1);
  if (st === 'hurt') return pose(inst, 'Hurt', m.t / 0.28 * 0.55, 0, 0.05);
  if (kind === 'ranged') {
    if (st === 'windup') return pose(inst, 'Draw', lerp(SEG.Draw.s, SEG.Draw.i, m.t / d.windup), 0, 0.1);
    if (st === 'attack' || st === 'recover') {
      const u = st === 'attack' ? m.t / (d.active + d.recover) : (d.active + m.t) / (d.active + d.recover);
      return pose(inst, 'Shoot', lerp(SEG.Shoot.s, SEG.Shoot.e, u), 0, 0.04);
    }
    if (mv > 15) return pose(inst, 'Run', null, mv / d.speed);
    return pose(inst, 'Aim', null, 1, 0.25);
  }
  // 근접 (창병 찌르기 / 거한 휘두르기·내려찍기)
  const atk = kind === 'heavy' ? (m.atkKind === 'smash' ? 'Smash' : 'Swing') : 'Stab';
  const sg = SEG[atk];
  if (st === 'windup') return pose(inst, atk, lerp(sg.s, sg.i, m.t / d.windup), 0, 0.1);
  if (st === 'attack') return pose(inst, atk, lerp(sg.i, sg.i2, m.t / d.active), 0, 0.03);
  if (st === 'recover') return pose(inst, atk, lerp(sg.i2, sg.e, m.t / d.recover), 0, 0.05);
  const moveClip = kind === 'heavy' ? 'Walk' : 'Run';
  if (mv > 15) return pose(inst, moveClip, null, Math.max(0.6, mv / d.speed));
  return pose(inst, kind === 'heavy' ? 'Idle' : 'Guard', null, 1, 0.25);
}

// 무기를 손 위치로 옮기고 방향 맞추기
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _f = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();
function placeWeapon(inst) {
  const w = inst.weapon, wd = inst.wd;
  if (!w) return;
  inst.obj.updateMatrixWorld(true);
  inst.hand.getWorldPosition(_p);
  w.position.copy(_p);
  _f.set(Math.sin(inst.yaw), 0, Math.cos(inst.yaw));       // 몸이 바라보는 쪽
  if (wd.mode === 'forward') {
    _q.copy(_f).addScaledVector(_up, wd.tilt || 0).normalize();
    w.quaternion.setFromUnitVectors(_up, _q);
  } else if (wd.mode === 'upright') {
    const z = new THREE.Vector3().crossVectors(_f, _up);
    _m.makeBasis(_f, _up, z); w.quaternion.setFromRotationMatrix(_m);
  } else if (wd.mode === 'arm' && inst.fore) {
    inst.fore.getWorldPosition(_q);
    _q.subVectors(_p, _q).normalize().addScaledVector(_f, wd.ahead || 0).normalize();
    w.quaternion.setFromUnitVectors(_up, _q);
  }
}

// ---------- 매 프레임: 몹 목록을 받아 칸에 나눠 그림 ----------
function frame(list, dt) {
  if (!M.ready) return;
  resize();
  // 없어진 몹 정리
  for (const [m, inst] of pool) if (!list.includes(m)) { dispose(inst); pool.delete(m); }
  let slot = 0;
  const sw = Math.round(SW * dpr), sh = Math.round(SH * dpr), H = sh * ROWS;
  renderer.setScissorTest(false); renderer.clear();
  renderer.setScissorTest(true);
  for (const m of list) {
    if (!m.d.model) continue;
    let inst = pool.get(m);
    if (!inst) { inst = create(m); if (!inst) continue; pool.set(m, inst); }
    inst.slot = -1;
    if (slot >= COLS * ROWS) continue;
    inst.slot = slot++;
    m._inst = inst;
    // 몸 방향: 바라보는 쪽(좌우) + 앞뒤로 움직이면 살짝 그쪽으로
    const tz = (m.state === 'chase' && Math.abs(m.vz) > 10) ? Math.sign(m.vz) * 0.45 : 0;
    const target = Math.atan2(m.face, tz);
    let dy = Math.atan2(Math.sin(target - inst.yaw), Math.cos(target - inst.yaw));
    inst.yaw += dy * Math.min(1, dt * 12);
    inst.obj.rotation.y = inst.yaw;
    choose(inst, dt);
    inst.mixer.update(dt);
    placeWeapon(inst);
    // 색: 맞으면 하얗게 번쩍, 공격 예고 중엔 붉게 깜빡
    let e = 0, er = 0;
    if (m.flash > 0) e = 0.9;
    else if (m.state === 'windup') er = 0.25 + 0.25 * Math.sin(m.t * 30);
    for (const mat of inst.mdl.mats) mat.emissive.setRGB(e + er, e, e);
    if (inst.weapon) inst.weapon.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setRGB(e + er * 2, e, e); });
    const col = inst.slot % COLS, row = Math.floor(inst.slot / COLS);
    renderer.setViewport(col * sw, H - (row + 1) * sh, sw, sh);
    renderer.setScissor(col * sw, H - (row + 1) * sh, sw, sh);
    inst.holder.visible = true;
    renderer.render(scene, camera);
    inst.holder.visible = false;
  }
  renderer.setScissorTest(false);
}

// 게임 화면에 그리기: (x, y) = 발 위치. 3D로 그렸으면 true
function draw(ctx, m, x, y) {
  const inst = pool.get(m);
  if (!inst || inst.slot < 0) return false;
  const sw = Math.round(SW * dpr), sh = Math.round(SH * dpr);
  const col = inst.slot % COLS, row = Math.floor(inst.slot / COLS);
  ctx.drawImage(renderer.domElement, col * sw, row * sh, sw, sh, x - SW / 2, y - SH * FOOT, SW, SH);
  return true;
}
function has(m) { return M.ready && !!m.d.model && !!M.models[m.d.model]; }

// 굽기용: 걷기·달리기 동작에서 발이 땅을 밀어내는 속도(게임 단위/초) 재기 → 게임에서 이동 속도에 맞춰 재생 (발 미끄러짐 방지)
M.strideSpeed = function (m, clip, dur) {
  const N = 90, feet = [];
  frame([m], 0);
  const inst = m._inst; if (!inst) return 0;
  inst.obj.traverse(o => { if (o.isBone && /(LeftFoot|RightFoot)$/.test(o.name)) feet.push(o); });
  const samples = feet.map(() => []), v = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    M.debugPose = [clip, dur * i / N]; frame([m], 0); inst.obj.updateMatrixWorld(true);
    feet.forEach((f, k) => { f.getWorldPosition(v); samples[k].push([v.x, v.y]); });
  }
  const speeds = [];
  for (const sm of samples) {
    const minY = Math.min(...sm.map(p => p[1]));
    for (let i = 1; i < sm.length; i++) {
      if (sm[i][1] < minY + 0.04 && sm[i - 1][1] < minY + 0.04) speeds.push(Math.abs(sm[i][0] - sm[i - 1][0]) / (dur / N));
    }
  }
  speeds.sort((a, b) => a - b);
  return speeds.length ? speeds[Math.floor(speeds.length / 2)] * UPM : 0;
};
M.frame = frame; M.draw = draw; M.has = has; M.SW = SW; M.SH = SH; M.FOOT = FOOT;
M.canvas = () => renderer && renderer.domElement;
M.clear = () => { for (const inst of pool.values()) dispose(inst); pool.clear(); };
G.Mob3D = M;
if (!/[?&]old/.test(location.search)) init();
