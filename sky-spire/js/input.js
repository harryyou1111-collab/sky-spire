// =====================================================================
// input.js — 조이스틱·버튼(와 PC 테스트용 키보드)을 "행동"으로 바꿈
// 게임 코드는 터치를 직접 보지 않고 아래 값만 봅니다.
//   axis.x, axis.y : 조이스틱 방향 (-1 ~ 1). 오른쪽 +x, 아래쪽 +y
//   held[행동]     : 지금 누르고 있는가 (left/right는 조이스틱에서 자동 계산)
//   pressed[행동]  : 이번 물리 계산에서 새로 눌렸는가 (한 번만 true)
// =====================================================================
G.Input = (function () {
  const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dodge'];
  const held = {}, pressed = {};
  ACTIONS.forEach(a => { held[a] = false; pressed[a] = false; });
  const axis = { x: 0, y: 0 };

  const pointers = new Map(); // 손가락 번호 → 버튼 행동
  const keys = new Set();     // 키보드로 누른 행동
  const buttons = {};         // 행동 → 버튼 요소

  // ---------- 조이스틱 ----------
  let zone, base, knob;
  const stick = { id: null, cx: 0, cy: 0, x: 0, y: 0 }; // 중심(cx,cy), 기울기(x,y: -1~1)

  // 손을 떼면 돌아가는 기본 위치 (영역 안 왼쪽 아래)
  function homeStick() {
    const r = zone.getBoundingClientRect();
    placeBase(r.left + 100, r.bottom - 90);
    moveKnob(0, 0);
    base.classList.remove('active');
  }
  function placeBase(x, y) {
    const r = zone.getBoundingClientRect();
    stick.cx = x; stick.cy = y;
    base.style.left = (x - r.left) + 'px';
    base.style.top = (y - r.top) + 'px';
  }
  function moveKnob(px, py) { knob.style.transform = `translate(${px}px, ${py}px)`; }

  function stickDown(e) {
    stick.id = e.pointerId;
    // 화면 가장자리에서 눌러도 조이스틱이 잘리지 않게 안쪽으로 당김
    const r = zone.getBoundingClientRect(), m = 64;
    const x = Math.max(r.left + m, Math.min(r.right - m, e.clientX));
    const y = Math.max(r.top + m, Math.min(r.bottom - m, e.clientY));
    placeBase(x, y);
    base.classList.add('active');
    stickMove(e);
  }
  function stickMove(e) {
    const R = G.CFG.stick.radius;
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; } // 원 밖으로 못 나가게
    moveKnob(dx, dy);
    stick.x = dx / R; stick.y = dy / R;
    refresh();
  }
  function stickUp() {
    stick.id = null; stick.x = 0; stick.y = 0;
    homeStick();
    refresh();
  }

  // 데드존 + "fullAt 이상 밀면 1" 로 다듬기
  function shape(v) {
    const { deadZone, fullAt } = G.CFG.stick;
    const a = Math.abs(v);
    if (a < deadZone) return 0;
    return Math.sign(v) * Math.min(1, (a - deadZone) / (fullAt - deadZone));
  }

  // ---------- 버튼 ----------
  function actionAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest('[data-act]');
    return btn ? btn.dataset.act : null;
  }

  // 조이스틱·버튼·키보드를 합쳐서 axis와 held 다시 계산
  function refresh() {
    let kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    let ky = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    axis.x = kx !== 0 ? kx : shape(stick.x);
    axis.y = ky !== 0 ? ky : shape(stick.y);

    const fromAxis = { left: axis.x < 0, right: axis.x > 0, up: axis.y < -0.5, down: axis.y > 0.5 };
    ACTIONS.forEach(a => {
      let on = keys.has(a) || !!fromAxis[a];
      for (const act of pointers.values()) if (act === a) on = true;
      if (on && !held[a]) pressed[a] = true; // 새로 눌림
      held[a] = on;
      if (buttons[a]) buttons[a].classList.toggle('on', on);
    });
  }

  function onDown(e) {
    if (e.target.closest('#stick-zone')) {
      e.preventDefault();
      if (stick.id === null) stickDown(e);
      return;
    }
    const act = actionAt(e.clientX, e.clientY);
    if (!act) return;
    e.preventDefault();
    pointers.set(e.pointerId, act);
    refresh();
  }
  function onMove(e) {
    if (e.pointerId === stick.id) stickMove(e);
  }
  function onUp(e) {
    if (e.pointerId === stick.id) { stickUp(); return; }
    if (pointers.delete(e.pointerId)) refresh();
  }
  function releaseAll() {
    pointers.clear(); keys.clear();
    if (stick.id !== null) stickUp(); else refresh();
  }

  // PC 테스트용 키보드 (모바일 동작에는 영향 없음)
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyJ: 'attack', KeyK: 'dodge',
  };

  function init() {
    document.querySelectorAll('[data-act]').forEach(b => { buttons[b.dataset.act] = b; });
    zone = document.getElementById('stick-zone');
    base = document.getElementById('stick-base');
    knob = document.getElementById('stick-knob');
    homeStick();
    window.addEventListener('resize', () => { if (stick.id === null) homeStick(); });

    const pad = document.getElementById('controls');
    pad.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // 앱 전환 등으로 손가락 정보를 잃으면 모두 해제 (눌린 채로 남는 문제 방지)
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    window.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => {
      const a = KEYMAP[e.code]; if (!a) return;
      e.preventDefault(); keys.add(a); refresh();
    });
    window.addEventListener('keyup', e => {
      const a = KEYMAP[e.code]; if (!a) return;
      keys.delete(a); refresh();
    });
  }

  // 물리 계산 한 번이 끝날 때마다 호출: "새로 눌림" 표시 지우기
  function endStep() { ACTIONS.forEach(a => { pressed[a] = false; }); }

  return { axis, held, pressed, init, endStep };
})();
