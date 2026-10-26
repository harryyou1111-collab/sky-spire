// =====================================================================
// hero3d.js — 플레이어 3D 캐릭터 (three.js)
//
// 3D 모델을 작은 화면 밖 캔버스에 그린 뒤, 게임 화면(2D 캔버스)에 그림처럼 붙입니다.
//   - 모델: assets/hero/*.glb (Mixamo 뼈대). 동작 이름은 CLIP_NAMES에서 게임 상태와 연결
//   - 방향: 이동·공격·대시 방향으로 몸을 돌림 (8방향 + 그 사이도 자연스럽게)
//   - 그림체: 만화풍 명암(툰 셰이딩) + 검은 외곽선으로 손그림 배경과 어울리게
// 이 파일은 원본(hero3d.src.js)을 묶어서 만든 것입니다. 직접 고치지 말고 원본을 고친 뒤 다시 묶기.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const G = window.G;

// 게임 상태 → 모델 동작 이름 (모델마다 이름이 다르면 여기만 고치면 됨). 없는 동작은 다음 후보로
const CLIP_NAMES = {
  idle: ['Idle', 'idle'],
  skill: ['Crouch', 'Idle'],
  run: ['Run', 'run'],
  walk: ['Walk', 'walk'],
  jump: ['Jump', 'Idle', 'idle'],
  jump2: ['Jump', 'Idle', 'idle'],
  fall: ['Fall', 'Idle', 'idle'],
  land: ['Land', 'Idle', 'idle'],
  dash: ['Roll', 'Run', 'run'],
  atk_side1: ['Slash1', 'Idle'], atk_side2: ['Slash2', 'Slash1'], atk_side3: ['Slash3', 'Slash1'], atk_down: ['DownSlash', 'Slash3', 'Idle'],
  hurt: ['Hurt', 'Idle'], dead: ['Death', 'Idle'], drink: ['Drink', 'Idle'],
};

const H = {
  ready: false,
  W: 200, H: 260,            // 화면 밖 캔버스 크기 (게임 단위). 실제 픽셀은 화면 배율만큼 크게
  heightUnits: 112,          // 캐릭터 키 = 게임 단위 (지금 플레이어 충돌 높이와 같게)
  yaw: Math.PI / 2,          // 지금 몸 방향 (0 = 화면 쪽, +90° = 오른쪽)
  state: null,
};

let renderer, scene, camera, model, mixer, actions = {}, current = null, unitsPerMeter = 62;

function init() {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();

  // 조명: 위쪽 뒤에서 오는 달빛(초록빛) + 앞쪽 은은한 빛 + 테두리 빛
  scene.add(new THREE.HemisphereLight(0xcfe8d0, 0x1a2418, 0.9));
  const moon = new THREE.DirectionalLight(0xd8ffd0, 1.6); moon.position.set(-2, 4, -3); scene.add(moon);
  const front = new THREE.DirectionalLight(0xfff2dd, 1.1); front.position.set(1.5, 2, 4); scene.add(front);

  // 카메라: 정면에서 살짝 내려다봄 (바닥이 위로 기울어 보이는 이 게임 시점에 맞춤)
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const pitch = THREE.MathUtils.degToRad(22);
  camera.position.set(0, 1 + Math.sin(pitch) * 10, Math.cos(pitch) * 10);
  camera.lookAt(0, 1, 0);

  const url = (G.CFG.hero && G.CFG.hero.model) || 'assets/hero/test_soldier.glb';
  new GLTFLoader().load(url + '?v=' + (G.VERSION || 0), onLoad, undefined, e => console.warn('3D 캐릭터를 못 불러옴:', e));
}

// 만화풍 명암 + 외곽선
function toonify(root) {
  const grad = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const outlines = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const old = o.material;
    o.material = new THREE.MeshToonMaterial({ color: old.color || 0xffffff, map: old.map || null, gradientMap: grad });
    // 외곽선: 같은 뼈대를 쓰는 복사본을 법선 방향으로 살짝 부풀려 뒷면만 검게 그림
    const line = new THREE.MeshBasicMaterial({ color: 0x0b0d0a, side: THREE.BackSide });
    // 외곽선 두께: 모델 키의 0.7% (모델마다 단위가 cm, m로 달라도 같은 굵기)
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox, th = Math.max(bb.max.y - bb.min.y, bb.max.z - bb.min.z) * 0.007;
    line.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>',
        '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * ' + th.toFixed(6) + ';');
    };
    const copy = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, line) : new THREE.Mesh(o.geometry, line);
    if (o.isSkinnedMesh) copy.bind(o.skeleton, o.bindMatrix);
    copy.frustumCulled = false;
    outlines.push([o.parent, copy]);
  });
  outlines.forEach(([p, c]) => p.add(c));
}

// 칼: sword.png의 윤곽을 따서 얇은 두께를 준 판 모양 (그림이 그대로 입혀짐)
//   SWORD.len: 칼 길이(미터), grip: 그림 속 손잡이 위치(가로 픽셀, 세로 픽셀)
//   rot/pos: 손 뼈 기준 회전(도)·위치 — 손에 쥔 모양이 어색하면 이 숫자만 조정
const SWORD = { img: 'assets/hero/sword.png', shape: 'assets/hero/sword.json', len: 1.25, grip: [1650, 136],
                rot: [0, 0, 180], pos: [0, 0.07, 0.03] };
H.SWORD = SWORD;
let swordGroup = null;
async function attachSword(root) {
  let hand = null;
  root.traverse(o => { if (o.isBone && /RightHand$/i.test(o.name)) hand = o; });
  if (!hand) return;
  const v = '?v=' + (G.VERSION || 0);
  const data = await (await fetch(SWORD.shape + v)).json();
  const tex = await new THREE.TextureLoader().loadAsync(SWORD.img + v);
  tex.colorSpace = THREE.SRGBColorSpace;
  const k = SWORD.len / data.w;                       // 픽셀 → 미터
  const shape = new THREE.Shape(data.pts.map(([x, y]) => new THREE.Vector2((x - SWORD.grip[0]) * k, (SWORD.grip[1] - y) * k)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  geo.translate(0, 0, -0.006);
  // 그림 좌표로 UV 다시 매기기 (앞뒤 모두 그림이 보이게)
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) / k + SWORD.grip[0]) / data.w, 1 - (SWORD.grip[1] - pos.getY(i) / k) / data.h);
  }
  const grad = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: tex, gradientMap: grad, side: THREE.DoubleSide }));
  const line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b0d0a, side: THREE.BackSide }));
  line.scale.setScalar(1.03);
  const g = new THREE.Group();
  g.add(mesh, line);
  const inner = new THREE.Group(); inner.add(g);
  swordGroup = inner;
  placeSword();
  const s = 1 / hand.getWorldScale(new THREE.Vector3()).x;   // 뼈 크기 보정 (모델 단위와 상관없이 미터로)
  const holder = new THREE.Group(); holder.scale.setScalar(s); holder.add(inner);
  hand.add(holder);
}
function placeSword() {
  if (!swordGroup) return;
  const r = SWORD.rot.map(THREE.MathUtils.degToRad);
  swordGroup.rotation.set(r[0], r[1], r[2]);
  swordGroup.position.set(...SWORD.pos);
}
H.placeSword = placeSword;

// 포션병: 왼손에 붙이고, 마시는 동안만 보임 (빨간 물약 + 유리병)
let potion = null;
const POTION = { pos: [0, 0.09, 0.03], rot: [0, 0, 0] };
H.POTION = POTION;
function attachPotion(root) {
  let hand = null;
  root.traverse(o => { if (o.isBone && /LeftHand$/i.test(o.name)) hand = o; });
  if (!hand) return;
  const g = new THREE.Group();
  const glass = new THREE.MeshToonMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.45 });
  const liquid = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), glass);
  const fill = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), liquid);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.05, 8), glass); neck.position.y = 0.06;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8), new THREE.MeshToonMaterial({ color: 0x6b4a2b })); cork.position.y = 0.09;
  g.add(body, fill, neck, cork);
  const s = 1 / hand.getWorldScale(new THREE.Vector3()).x;
  const holder = new THREE.Group(); holder.scale.setScalar(s); holder.add(g);
  g.position.set(...POTION.pos); g.rotation.set(...POTION.rot.map(THREE.MathUtils.degToRad));
  hand.add(holder);
  potion = g; potion.visible = false;
}

function onLoad(gltf) {
  model = gltf.scene;
  // 키를 재서 1미터 = 몇 게임 단위인지 정함
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  model.scale.setScalar(1.8 / h);
  model.position.y = -box.min.y * (1.8 / h);
  unitsPerMeter = H.heightUnits / 1.8;
  toonify(model);
  attachSword(model);
  attachPotion(model);
  scene.add(model);
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  resize();
  H.ready = true;
}

function resize() {
  if (typeof pillarCache !== 'undefined') pillarCache.clear();   // 화면 크기가 바뀌면 기둥 그림도 다시
  const dpr = Math.min(3, G.viewScale || 1);       // 게임 단위 1 = 화면 픽셀 몇 개 (main.js가 알려줌)
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(H.W * dpr), Math.round(H.H * dpr), false);
  const mw = H.W / unitsPerMeter / 2, mh = H.H / unitsPerMeter;
  // 화면 밖 캔버스의 아래쪽 15%에 발이 오게
  camera.left = -mw; camera.right = mw; camera.top = mh * 0.85; camera.bottom = -mh * 0.15;
  camera.position.y = 0 + Math.sin(THREE.MathUtils.degToRad(22)) * 10;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function pick(state) {
  for (const n of CLIP_NAMES[state] || ['Idle']) if (actions[n]) return actions[n];
  return Object.values(actions)[0];
}

// 공격 동작: 게임 공격 단계(준비 startup → 판정 active → 빈틈 recovery)에 동작 구간을 맞춤
//   s: 준비 시작, i: 칼이 휘둘러지기 시작, i2: 휘두르기 끝, e: 자세 회복 (동작 속 시간, 초)
//   게임 단계 시간이 짧으면 그만큼 빠르게 재생됨 → 판정과 칼끝이 항상 같은 순간에 맞음
const ATK = {
  atk_side1: { s: 0.55, i: 0.78, i2: 0.95, e: 1.25 },
  atk_side2: { s: 0.45, i: 0.68, i2: 0.86, e: 1.15 },
  atk_side3: { s: 0.20, i: 0.58, i2: 0.80, e: 1.10 },
  atk_down:  { s: 0.85, i: 1.10, i2: 1.20, e: 1.30 },   // 머리 위로 든 칼을 아래로 내리꽂고, 떨어지는 동안 그 자세 유지
};
H.ATK = ATK;
function atkTime(seg, a) {
  const d = a.def, t = a.t;
  if (t < d.startup) return seg.s + (seg.i - seg.s) * t / d.startup;
  if (t < d.startup + d.active) return seg.i + (seg.i2 - seg.i) * (t - d.startup) / d.active;
  return seg.i2 + (seg.e - seg.i2) * Math.min(1, (t - d.startup - d.active) / d.recovery);
}

// 구르기 재생: 동작 길이(초) ÷ 빠르기 = 보여주는 시간
const ROLL = { time: 0.46, speed: 1.9 };
H.ROLL = ROLL;

// 한 번만 재생하고 마지막 장면에 멈추는 동작 (반복하지 않음)
const ONCE = new Set(['jump', 'jump2', 'fall', 'land', 'dash', 'hurt', 'dead', 'drink', 'skill',
                      'atk_side1', 'atk_side2', 'atk_side3', 'atk_down']);
// 동작이 바뀔 때 섞는 시간 (공격·회피는 빠르게)
const FADE = { atk_side1: 0.05, atk_side2: 0.05, atk_side3: 0.05, atk_down: 0.05, dash: 0.05, jump: 0.08, jump2: 0.05, land: 0.06 };
let lastState = null;
function clipLen(state) { const a = pick(state); return a ? a.getClip().duration : 1; }
function play(state, speed, restart) {
  const a = pick(state);
  if (!a) return;
  a.timeScale = speed || 1;
  if (state === lastState && !restart) return;
  lastState = state;
  const once = ONCE.has(state);
  if (a === current && !once) return;
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = true;
  a.reset().play();
  if (current && current !== a) a.crossFadeFrom(current, FADE[state] ?? 0.15, false);
  current = a;
}

// 몸이 향할 방향: 공격 > 대시 > 이동 > 그대로
function targetYaw(p) {
  let dx = 0, dz = 0;
  if (p.atk) { dx = p.atk.dir.x; dz = p.atk.dir.z; }
  else if (p.dash) { dx = p.dash.dx; dz = p.dash.dz; }
  else if (Math.hypot(p.vx, p.vz) > 15) { dx = p.vx; dz = p.vz; }
  if (dx === 0 && dz === 0) return null;
  return Math.atan2(dx, dz);   // z가 클수록 화면 쪽(앞)
}

function update(dt, p) {
  if (!H.ready || H.frozen) { if (H.ready) model.rotation.y = H.yaw; return; }
  const t = targetYaw(p);
  if (t != null) {
    let d = t - H.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    H.yaw += d * Math.min(1, dt * (p.dash || p.atk ? 30 : 14));
  }
  model.rotation.y = H.yaw;
  const moving = Math.hypot(p.vx, p.vz);
  let st = p.state || 'idle';
  // 구르기: 게임의 회피(0.17초)는 너무 짧아서, 구르기 동작은 끝까지 보여줌 (ROLL.time초).
  // 회피가 끝난 뒤 그냥 걷거나 서 있으면 구르기를 이어서 재생하고, 공격·점프·맞음 등이 오면 바로 끊음
  let restart = false;
  if (p.dash && p.dash !== H.lastDash) { H.rollT = ROLL.time; restart = true; }   // 새 회피 시작
  H.lastDash = p.dash;
  H.rollT = Math.max(0, (H.rollT || 0) - dt);
  if (H.rollT > 0 && (st === 'idle' || st === 'run' || st === 'land' || st === 'fall')) st = 'dash';
  if (st !== 'dash') H.rollT = 0;
  const speed = st === 'run' ? Math.max(0.6, moving / G.CFG.player.maxSpeed) * 1.1
              : st === 'dash' ? ROLL.speed
              : st === 'hurt' ? clipLen('hurt') / G.CFG.player.hurtTime          // 맞는 동작을 경직 시간에 딱 맞춤
              : st === 'drink' ? clipLen('drink') / G.CFG.potion.drinkTime       // 마시는 동작을 마시는 시간에 맞춤
              : st === 'dead' ? 1.7                                              // 패배 화면(0.9초 뒤)이 뜰 때쯤 땅에 쓰러져 있게
              : 1;
  if (p.atk && p.atk.id !== H.lastAtk) restart = true;     // 새 공격 = 처음부터
  H.lastAtk = p.atk ? p.atk.id : H.lastAtk;
  play(st, speed, restart);
  const seg = p.atk && ATK[st];
  if (seg && current) { current.paused = true; current.time = atkTime(seg, p.atk); }
  if (potion) potion.visible = st === 'drink';
  mixer.update(dt);
}

// 게임 화면에 그리기: (x, y) = 발 위치 (화면 좌표)
function draw(ctx, x, y) {
  if (!H.ready) return false;
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, x - H.W / 2, y - H.H * 0.85, H.W, H.H);
  return true;
}

// 개발 확인용: 특정 동작의 특정 시점에 멈춰 보기 (G.Hero3D.debugPose('Run', 0.3))
function debugPose(name, t) {
  const a = actions[name]; if (!a) return false;
  mixer.stopAllAction(); a.reset().play(); a.time = t; a.paused = true; current = a; mixer.update(0);
  H.frozen = true; return a.getClip().duration;
}
H.debugPose = debugPose;
H.showPotion = () => { if (potion) potion.visible = true; };
H.clips = () => Object.keys(actions);
// =====================================================================
// 3D 기둥: 부서진 이끼 기둥을 3D로 만들어 한 번 그려 두고(그림으로 저장), 게임에서는 그 그림을 씀
//   게임 좌표의 기둥 { rx: 가로 반지름, rz: 깊이 반지름(화면에서 납작한 정도), h: 높이 } 를
//   같은 각도로 내려다보는 3D로 바꿔서, 윗면 타원과 높이가 게임 판정과 정확히 일치
// =====================================================================
const PITCH = THREE.MathUtils.degToRad(22);
const pillarCache = new Map();
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function buildPillar(p, seed) {
  const r = rand(seed || 7);
  const Rx = p.rx, Rz = p.rz / Math.sin(PITCH), Hh = p.h / Math.cos(PITCH);
  const grp = new THREE.Group();
  const stone = new THREE.Color(0x6e6c66), stoneDark = new THREE.Color(0x3e3f3b), moss = new THREE.Color(0x56703a), mossDark = new THREE.Color(0x36472a);
  const grad = new THREE.DataTexture(new Uint8Array([55, 55, 55, 255, 140, 140, 140, 255, 235, 235, 235, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  // 부서진 윗면: 한쪽으로 기울어진 단면 + 잔물결
  const tx = r() * 2 - 1, tz = r() * 2 - 1, ph = r() * 6.28;
  function piece(radTop, radBot, height, y0, jagged, flutes, mossy) {
    const seg = 32, hs = 8;
    const g = new THREE.CylinderGeometry(radTop, radBot, height, seg, hs, false);
    g.translate(0, y0 + height / 2, 0);
    const pos = g.attributes.position, col = [];
    const jag = Array.from({ length: seg + 1 }, () => r());
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x), rad = Math.hypot(x, z);
      // 세로 홈 (기둥 느낌)
      if (flutes && rad > 0.5 * radBot) { const f = 1 - 0.05 * Math.max(0, Math.cos(ang * 12)); x *= f; z *= f; }
      // 부서진 윗면: 위쪽 가장자리를 들쭉날쭉하게 깎음
      const top = y0 + height;
      const isTop = y > top - 1e-3;
      if (jagged && isTop) {
        const ux = x / radTop, uz = z / radTop;
        const cut = height * (0.06 + 0.12 * ((tx * ux + tz * uz) * 0.5 + 0.5) + 0.05 * Math.sin(ang * 5 + ph) * Math.hypot(ux, uz));
        y -= cut;
      }
      pos.setXYZ(i, x * Rx, y * Hh, z * Rz);
      // 색: 위를 볼수록·높을수록 이끼, 아래는 돌. 얼룩은 무작위
      const up = (y - y0) / height;
      const n = 0.5 + 0.25 * Math.sin(x * 9 + z * 5.3 + y * 7) + 0.25 * Math.sin(x * 23.1 - z * 17.7 + y * 3.1);   // 부드러운 얼룩 (점마다 무작위면 별무늬가 생김)
      const c = stone.clone().lerp(stoneDark, n * 0.6);
      const mossAmt = mossy ? Math.min(1, Math.max(0, (up - 0.72) * 2.4 + (n - 0.5) * 0.9 + (isTop ? 0.45 : 0))) : 0;
      c.lerp(n > 0.5 ? moss : mossDark, mossAmt);
      if (mossy && isTop) c.copy(moss).lerp(mossDark, 0.35);   // 윗면은 한 가지 색 (점마다 다르면 가운데로 모이는 줄무늬가 생김)
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // 법선은 원래 원기둥 것을 씀 (다시 계산하면 윗면에 별 모양 줄무늬가 생김). 옆면은 눌린 비율만큼 보정
    const nor = g.attributes.normal;
    for (let i = 0; i < nor.count; i++) {
      const v = new THREE.Vector3(nor.getX(i) / Rx, nor.getY(i) / Hh, nor.getZ(i) / Rz).normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
    }
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad }));
    const line = new THREE.MeshBasicMaterial({ color: 0x0b0d0a, side: THREE.BackSide });
    line.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * 1.1;'); };
    grp.add(m, new THREE.Mesh(g, line));
  }
  piece(1, 1, 0.88, 0.12, true, true, true);     // 몸통 (윗면 부서짐, 위쪽에 이끼)
  piece(1.12, 1.16, 0.12, 0, false, false, false);  // 받침
  return grp;
}
let propScene = null, propCam = null;
function pillarImg(p) {
  if (!H.ready) return null;
  const key = [p.rx, p.rz, p.h, p.x].join(',');
  if (pillarCache.has(key)) return pillarCache.get(key);
  if (!propScene) {
    propScene = new THREE.Scene();
    propScene.add(new THREE.HemisphereLight(0xcfe8d0, 0x1a2418, 0.75));
    const moon = new THREE.DirectionalLight(0xd8ffd0, 1.3); moon.position.set(-2, 4, -3); propScene.add(moon);
    const front = new THREE.DirectionalLight(0xfff2dd, 0.7); front.position.set(1.5, 2, 4); propScene.add(front);
    propCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
  }
  const obj = buildPillar(p, Math.round(p.x * 13 + p.z * 7) + 1);
  propScene.add(obj);
  // 화면에서 차지하는 영역 (게임 단위): 가로 ±(rx+여유), 세로 바닥선 아래 rz+여유 ~ 위로 h+rz+여유
  const m = 6, w = 2 * (p.rx * 1.16 + m), up = p.h + p.rz + m, down = p.rz * 1.16 + m;
  propCam.left = -w / 2; propCam.right = w / 2; propCam.top = up; propCam.bottom = -down;
  propCam.position.set(0, Math.sin(PITCH) * 1000, Math.cos(PITCH) * 1000);
  propCam.lookAt(0, 0, 0);
  propCam.updateProjectionMatrix();
  const dpr = Math.min(3, G.viewScale || 1);
  const W = Math.ceil(w * dpr), Hpx = Math.ceil((up + down) * dpr);
  const keep = renderer.getSize(new THREE.Vector2());
  renderer.setSize(W, Hpx, false);
  renderer.render(propScene, propCam);
  const c = document.createElement('canvas'); c.width = W; c.height = Hpx;
  c.getContext('2d').drawImage(renderer.domElement, 0, 0);
  renderer.setSize(keep.x, keep.y, false);
  propScene.remove(obj);
  const img = { canvas: c, w, h: up + down, up };     // 그릴 때: (x - w/2, 바닥선 - up) 위치에 w × h 크기
  pillarCache.set(key, img);
  return img;
}
H.pillarImg = pillarImg;
H.clearProps = () => pillarCache.clear();

H.update = update; H.draw = draw; H.resize = resize;
H.canvas = () => renderer && renderer.domElement;
G.Hero3D = H;
if (!/[?&]old/.test(location.search)) init();   // 주소 끝에 ?old 를 붙이면 예전 도형 캐릭터
