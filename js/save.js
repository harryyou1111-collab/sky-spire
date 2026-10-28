// =====================================================================
// save.js — 자동 저장 (이 기기의 브라우저에 저장. 다른 기기와는 공유 안 됨)
//
// 저장하는 것: 깬 층(횟수·최고 기록), 최고층, 장착 장비·스킬, 가진 장비·스킬, 기록
// 저장 형식이 바뀌면 ver를 올리고 load()에서 예전 형식을 새 형식으로 옮겨 줌
// =====================================================================
G.Save = (function () {
  const KEY = 'skyspire.save';
  const blank = () => ({
    ver: 1,
    best: 0,                                // 깬 가장 높은 층
    cleared: {},                            // 층 번호 → { count: 깬 횟수, time: 최고 기록(초) }
    equip: { weapon: null, charm: null },   // 장착 장비 (null = 기본)
    skills: [null, null],                   // 스킬 2칸
    owned: { equip: [], skills: [] },       // 가진 장비·스킬 (보스 보상)
    stats: { deaths: 0, playTime: 0 },
    seenOpening: false,                     // 오프닝(탑 꼭대기 → 입구)을 봤는지
    seenCine: {},                           // 본 보스 시네마틱 (보스 이름 → true)
    fails: {},                              // 층별로 진 횟수 (보스 대사용)
    settings: { sfx: 0.8, bgm: 0.7 },       // 음량 (효과음, 배경음)
  });
  let data = load();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.ver === 1) return Object.assign(blank(), s);
    } catch (e) { /* 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 그냥 새로 */ }
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 저장 실패해도 게임은 계속 */ }
  }

  // 층 클리어: 횟수 +1, 기록이 더 빠르면 갱신, 최고층 갱신. 처음 깼으면 true
  function clearFloor(n, time) {
    const c = data.cleared[n] || { count: 0, time: null };
    const first = c.count === 0;
    c.count++;
    if (time != null && (c.time == null || time < c.time)) c.time = Math.round(time * 10) / 10;
    data.cleared[n] = c;
    data.best = Math.max(data.best, n);
    save();
    return first;
  }
  function addDeath(n) {
    data.stats.deaths++;
    if (n) { data.fails = data.fails || {}; data.fails[n] = (data.fails[n] || 0) + 1; }
    save();
    return n ? data.fails[n] : 0;
  }
  function addPlayTime(sec) { data.stats.playTime += sec; }
  function reset() { data = blank(); save(); }

  return { get data() { return data; }, save, clearFloor, addDeath, addPlayTime, reset };
})();
