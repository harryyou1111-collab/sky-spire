// 사용: node merge.mjs out.glb base.glb 이름1=파일1.glb 이름2=파일2.glb@0.7-1.0!flat ...
//   @시작-끝 : 그 구간(초)만 잘라서 사용   !flat : 엉덩이가 원래 높이보다 올라가지 않게 (점프 높이는 게임 물리가 담당)
// base(스킨 포함)의 모델에 각 파일의 동작을 이름을 붙여 합침. 뼈 이름으로 연결
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
const [,, out, basePath, ...pairs] = process.argv;
const io = new NodeIO();
const doc = await io.read(basePath);
const root = doc.getRoot();
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
const buf = root.listBuffers()[0];
// base의 원래 동작 이름 바꾸기
for (const a of root.listAnimations()) a.dispose();
for (const p of pairs) {
  let [name, file] = p.split('=');
  let flat = false, fixed = false, t0 = null, t1 = null;
  if (file.includes('!flat')) { flat = true; file = file.replace('!flat', ''); }
  if (file.includes('!fixed')) { fixed = true; file = file.replace('!fixed', ''); }   // 엉덩이 높이 완전히 고정 (공중 동작)
  if (file.includes('@')) { const [f, r] = file.split('@'); file = f; [t0, t1] = r.split('-').map(Number); }
  const restY = byName.get([...byName.keys()].find(k => /Hips$/.test(k))).getTranslation()[1];
  const src = await io.read(file);
  for (const sa of src.getRoot().listAnimations()) {
    const anim = doc.createAnimation(name);
    for (const ch of sa.listChannels()) {
      const tn = ch.getTargetNode(); if (!tn) continue;
      const target = byName.get(tn.getName()); if (!target) continue;
      const path = ch.getTargetPath();
      // 위치 이동은 엉덩이만 (다른 뼈 위치는 base 그대로 → 비율 깨짐 방지)
      if (path === 'translation' && !/Hips$/.test(tn.getName())) continue;
      if (path === 'scale') continue;
      const ss = ch.getSampler();
      let times = Array.from(ss.getInput().getArray());
      const o = ss.getOutput(), n = o.getElementSize();
      let vals = Array.from(o.getArray());
      if (t0 != null) {   // 구간 자르기 (앞뒤 키프레임 하나씩 포함)
        let i0 = 0, i1 = times.length - 1;
        while (i0 < times.length - 1 && times[i0 + 1] <= t0) i0++;
        while (i1 > 0 && times[i1 - 1] >= t1) i1--;
        times = times.slice(i0, i1 + 1).map(t => Math.max(0, t - t0));
        vals = vals.slice(i0 * n, (i1 + 1) * n);
      }
      const inp = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buf);
      let arr = new Float32Array(vals);
      if (flat && path === 'translation' && /Hips$/.test(tn.getName())) {
        for (let i = 1; i < arr.length; i += 3) arr[i] = Math.min(arr[i], restY);
      }
      if (fixed && path === 'translation' && /Hips$/.test(tn.getName())) {
        for (let i = 1; i < arr.length; i += 3) arr[i] = restY;
      }
      // 제자리로: 엉덩이의 앞뒤·좌우 이동은 없애고(첫 장면 값으로 고정) 위아래 출렁임만 남김. 이동은 게임 코드가 함
      if (path === 'translation' && /Hips$/.test(tn.getName())) {
        const x0 = arr[0], z0 = arr[2];
        for (let i = 0; i < arr.length; i += 3) { arr[i] = x0; arr[i + 2] = z0; }
      }
      const outp = doc.createAccessor().setType(o.getType()).setArray(arr).setBuffer(buf);
      const s = doc.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(ss.getInterpolation());
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(s));
    }
  }
}
await doc.transform(prune(), dedup());
await io.write(out, doc);
console.log('ok', root.listAnimations().map(a => a.getName()));
