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
  fall: ['Fall', 'Idle', 'idle'],
  land: ['Land', 'Idle', 'idle'],
  dash: ['Dash', 'Run', 'run'],
  atk_side1: ['Slash1', 'Idle'], atk_side2: ['Slash2', 'Idle'], atk_side3: ['Slash3', 'Idle'], atk_down: ['DownSlash', 'Idle'],
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
  scene.add(model);
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  resize();
  H.ready = true;
}

function resize() {
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

function play(state, speed) {
  const a = pick(state);
  if (!a) return;
  a.timeScale = speed || 1;
  if (a === current) return;
  a.reset().play();
  if (current) a.crossFadeFrom(current, 0.15, false);
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
  const st = p.state || 'idle';
  play(st, st === 'run' ? Math.max(0.6, moving / G.CFG.player.maxSpeed) * 1.1 : 1);
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
H.clips = () => Object.keys(actions);
H.update = update; H.draw = draw; H.resize = resize;
H.canvas = () => renderer && renderer.domElement;
G.Hero3D = H;
if (!/[?&]old/.test(location.search)) init();   // 주소 끝에 ?old 를 붙이면 예전 도형 캐릭터
