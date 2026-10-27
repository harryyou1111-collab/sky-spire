# =====================================================================
# bake_mobs.py — 몹 3D 동작을 그림(스프라이트)으로 굽기
#
# 사용: sky-spire 폴더에서  python3 -m http.server 8765  를 켜 두고
#       python3 tools/bake_mobs.py
# 결과: assets/mobs/<몹 종류>.webp (그림 모음) + <몹 종류>.json (그림마다 위치·발 기준점)
#
# CLIPS: 몹마다 구울 동작과 구간
#   [동작 이름, 시작(초), 끝(초), 초당 장수, 반복 여부]
#   시작~끝은 게임에서 실제로 쓰는 구간만 (mobsprite.js의 SEG와 같은 숫자)
# =====================================================================
import asyncio, base64, io, json, os, sys
from PIL import Image
from playwright.async_api import async_playwright

SCALE = 1.6          # 게임 단위 1 = 그림 픽셀 1.6개 (폰 화면 배율과 비슷하게. 크면 선명하지만 무거움)
CLIPS = {
  'satyr_spear': [['Guard', 0, 1.75, 10, True], ['Run', 0, 0.917, 15, True], ['Stab', 0.45, 2.2, 15, False],
                  ['Hurt', 0, 0.55, 15, False], ['Death', 0, 2.5, 10, False]],
  'satyr_archer': [['Aim', 0, 3.75, 6, True], ['Run', 0, 0.917, 15, True], ['Draw', 0.15, 1.4, 12, False],
                   ['Shoot', 0.4, 0.88, 15, False], ['Hurt', 0, 0.55, 15, False], ['Death', 0, 2.5, 10, False]],
  'satyr_brute': [['Idle', 0, 1.958, 10, True], ['Walk', 0, 1.417, 12, True], ['Swing', 0.25, 2.1, 15, False],
                  ['Smash', 0.15, 1.8, 15, False], ['Hurt', 0, 0.55, 15, False], ['Death', 0, 2.83, 10, False]],
}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SHEET_W, SHEET_MAX_H = 2048, 4096

GRAB = """async ([type, clip, times, scale]) => {
  G.viewScale = scale;
  const M = G.Mob3D;
  const m = { d: G.MobDefs[type], type, face: 1, state: 'chase', vx: 0, vz: 0, t: 0, flash: 0 };
  const out = [];
  const c2 = document.createElement('canvas'), x2 = c2.getContext('2d', { willReadFrequently: true });
  for (const t of times) {
    M.debugPose = [clip, t];
    M.frame([m], 0);
    const src = M.canvas(), sw = Math.round(M.SW * scale), sh = Math.round(M.SH * scale);
    c2.width = sw; c2.height = sh; x2.clearRect(0, 0, sw, sh); x2.drawImage(src, 0, 0, sw, sh, 0, 0, sw, sh);
    out.push(c2.toDataURL('image/png'));
  }
  M.frame([], 0);
  return { urls: out, sw: Math.round(M.SW * scale), sh: Math.round(M.SH * scale), foot: M.FOOT };
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': 800, 'height': 600})
        pg.on('pageerror', lambda e: print('ERR', e))
        await pg.goto('http://localhost:8765/tools/bake.html')
        await pg.wait_for_function('G.Mob3D && G.Mob3D.ready', timeout=60000)
        only = sys.argv[1:] or list(CLIPS)
        for typ in only:
            frames = []   # (clip index, image, ox, oy)
            meta = {'scale': SCALE, 'clips': {}}
            for ci, (name, t0, t1, fps, loop) in enumerate(CLIPS[typ]):
                n = max(1, round((t1 - t0) * fps) + (0 if loop else 1))
                times = [t0 + i / fps for i in range(n)]
                r = await pg.evaluate(GRAB, [typ, name, times, SCALE])
                fx, fy = r['sw'] / 2, r['sh'] * r['foot']
                lst = []
                for u in r['urls']:
                    im = Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA')
                    bb = im.getchannel('A').point(lambda a: 255 if a > 6 else 0).getbbox() or (0, 0, 1, 1)
                    bb = (max(0, bb[0] - 1), max(0, bb[1] - 1), min(im.width, bb[2] + 1), min(im.height, bb[3] + 1))
                    lst.append((im.crop(bb), bb[0] - fx, bb[1] - fy))
                meta['clips'][name] = {'t0': t0, 'fps': fps, 'loop': loop, 'n': len(lst), 'frames': []}
                frames.append((name, lst))
                print(typ, name, len(lst), 'frames')
            # 선반 쌓기: 키 큰 순서로 줄을 채움, 시트 높이가 넘치면 다음 시트
            items = [(name, i, im, ox, oy) for name, lst in frames for i, (im, ox, oy) in enumerate(lst)]
            order = sorted(range(len(items)), key=lambda k: -items[k][2].height)
            sheets, place = [], {}
            x = y = rowh = 0; cur = []
            for k in order:
                im = items[k][2]
                if x + im.width > SHEET_W: x = 0; y += rowh + 1; rowh = 0
                if y + im.height > SHEET_MAX_H:
                    sheets.append((cur, y + rowh)); cur = []; x = y = rowh = 0
                place[k] = (len(sheets), x, y); cur.append(k)
                x += im.width + 1; rowh = max(rowh, im.height)
            sheets.append((cur, y + rowh))
            meta['sheets'] = []
            for si, (ks, h) in enumerate(sheets):
                sheet = Image.new('RGBA', (SHEET_W, h + 1), (0, 0, 0, 0))
                for k in ks:
                    _, sx, sy = place[k]; sheet.paste(items[k][2], (sx, sy))
                fn = f'{typ}{"" if si == 0 else "_" + str(si)}.webp'
                sheet.save(os.path.join(ROOT, 'assets', 'mobs', fn), 'WEBP', quality=88, alpha_quality=90, method=6)
                meta['sheets'].append(fn)
            for k, (name, i, im, ox, oy) in enumerate(items):
                s, sx, sy = place[k]
                meta['clips'][name]['frames'].append([s, sx, sy, im.width, im.height, round(ox / SCALE, 2), round(oy / SCALE, 2)])
            with open(os.path.join(ROOT, 'assets', 'mobs', typ + '.json'), 'w') as f:
                json.dump(meta, f, separators=(',', ':'))
            print(typ, 'sheets', [(s, Image.open(os.path.join(ROOT, 'assets', 'mobs', s)).size) for s in meta['sheets']])
        await b.close()

asyncio.run(main())
