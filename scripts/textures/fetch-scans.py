#!/usr/bin/env python3
"""下载网上的 CC0 面层贴图（Poly Haven、ambientCG），处理后写入 assets/textures/scans/ 和清单。

用法（仓库根目录）：python3 -I scripts/textures/fetch-scans.py [--cache DIR] [id ...]
需要 Pillow 和 numpy。下载的原始文件放在缓存目录里（默认是系统临时目录下的 yunlan-texture-cache），不进仓库。

处理只做这几样，都记在清单的 processing 里：
  · 取 1K 的 JPG 原图（颜色、OpenGL 法线、个别带粗糙度），按清单缩到需要的边长；
  · rotate：转 90°（木格栅、条形挂板原图是横的，墙上要竖的），法线的方向跟着转；
  · repeat：原图平铺 n×n 再缩回去，让水磨石的石子变小；
  · panels：把连续的石材切成一块块板（每块从原图不同位置取，深浅略有不同），画出板缝，法线上压出缝的凹槽；
  · mean / contrast / desaturate：把颜色贴图的平均色调到清单给的浅中性色、调一下明暗反差和彩度——材质的色调由顶点色和 tint 给，
    贴图只提供纹理细节，这样换贴图不会带偏场景的颜色。
不做生成式合成，不改纹理内容。
"""
import argparse, hashlib, io, json, os, sys, tempfile, urllib.request, zipfile
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = 'assets/textures/scans'
UA = 'yunlan-texture-pipeline/1.0'
QUALITY = {'color': 82, 'normal': 84, 'roughness': 80}
PH_MAP = {'color': 'Diffuse', 'normal': 'nor_gl', 'roughness': 'Rough'}
ACG_SUFFIX = {'color': '_Color.jpg', 'normal': '_NormalGL.jpg', 'roughness': '_Roughness.jpg'}


def fetch(url, cache, name):
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        data = urllib.request.urlopen(req, timeout=180).read()
        with open(path + '.part', 'wb') as f:
            f.write(data)
        os.replace(path + '.part', path)
    with open(path, 'rb') as f:
        return f.read()


def load_polyhaven(spec, cache):
    aid = spec['asset']
    info = json.loads(fetch(f'https://api.polyhaven.com/info/{aid}', cache, f'ph-{aid}-info.json'))
    files = json.loads(fetch(f'https://api.polyhaven.com/files/{aid}', cache, f'ph-{aid}-files.json'))
    images, sources = {}, {}
    for purpose in spec['maps']:
        entry = files[PH_MAP[purpose]]['1k']['jpg']
        data = fetch(entry['url'], cache, f'ph-{aid}-{purpose}.jpg')
        if hashlib.md5(data).hexdigest() != entry['md5']:
            raise SystemExit(f'{aid}/{purpose}: md5 与 Poly Haven 给的不一致')
        images[purpose] = Image.open(io.BytesIO(data)).convert('RGB')
        sources[purpose] = {'sourceUrl': entry['url'], 'sourceMd5': entry['md5'], 'sourceBytes': len(data)}
    meta = {'source': 'Poly Haven', 'name': info['name'], 'sourceUrl': f'https://polyhaven.com/a/{aid}', 'authors': info.get('authors', {}),
            'license': 'CC0-1.0', 'licenseUrl': 'https://polyhaven.com/license',
            'sourceDimensionsMillimeters': [round(v) for v in info.get('dimensions', [])] or None}
    return images, sources, meta


def load_ambientcg(spec, cache):
    aid = spec['asset']
    api = f'https://ambientcg.com/api/v2/full_json?id={aid}&include=dimensionsData'
    info = json.loads(fetch(api, cache, f'acg-{aid}-info.json'))['foundAssets'][0]
    url = f'https://ambientcg.com/get?file={aid}_1K-JPG.zip'
    data = fetch(url, cache, f'acg-{aid}-1k.zip')
    z = zipfile.ZipFile(io.BytesIO(data))
    images, sources = {}, {}
    for purpose in spec['maps']:
        name = next(n for n in z.namelist() if n.endswith(ACG_SUFFIX[purpose]))
        raw = z.read(name)
        images[purpose] = Image.open(io.BytesIO(raw)).convert('RGB')
        sources[purpose] = {'sourceUrl': url, 'sourceFile': name, 'sourceArchiveSha256': hashlib.sha256(data).hexdigest(), 'sourceBytes': len(raw)}
    dims = [info.get('dimensionX') or 0, info.get('dimensionY') or 0]
    meta = {'source': 'ambientCG', 'name': info.get('displayName') or aid, 'sourceUrl': f'https://ambientcg.com/a/{aid}',
            'authors': {'ambientCG (Lennart Demes)': 'All'}, 'license': 'CC0-1.0', 'licenseUrl': 'https://docs.ambientcg.com/license/',
            'sourceDimensionsMillimeters': [d * 10 for d in dims] if all(dims) else None}
    return images, sources, meta


def rotate90(arr, normal=False):
    """逆时针转 90°；法线贴图的 x、y 分量跟着转（原来朝右的现在朝上）。"""
    out = np.rot90(arr, 1).copy()
    if normal:
        r, g = out[..., 0].copy(), out[..., 1].copy()
        out[..., 0], out[..., 1] = 255.0 - g, r
    return out


def panel_rects(size, p):
    cols, rows, stagger = p['cols'], p['rows'], p.get('stagger', 0)
    w, h = size / cols, size / rows
    for j in range(rows):
        shift = stagger * w if j % 2 else 0
        for i in range(cols + (1 if shift else 0)):
            x0 = i * w - shift
            yield j, i % cols if shift else i, int(round(x0)), int(round(j * h)), int(round(x0 + w)), int(round((j + 1) * h))


def panelise(arr, p, seed, normal=False):
    """把连续的面层切成板：每块从原图不同位置取（原图四方连续，随便挪），每块深浅差一点。"""
    size = arr.shape[0]
    rng = np.random.default_rng(seed)
    out = np.empty_like(arr)
    offsets = {}
    for j, i, x0, y0, x1, y1 in panel_rects(size, p):
        if (j, i) not in offsets:
            offsets[(j, i)] = (int(rng.integers(0, size)), int(rng.integers(0, size)), 1 + (rng.random() * 2 - 1) * p.get('shade', 0))
        dx, dy, shade = offsets[(j, i)]
        src = np.roll(arr, (dy, dx), axis=(0, 1))
        xa, xb = max(0, x0), min(size, x1)
        if xb <= xa:
            continue
        out[y0:y1, xa:xb] = src[y0:y1, xa:xb] * (1 if normal else shade)
    return out


def joint_mask(size, p):
    """板缝：1 是缝里，0 是板面。"""
    m = np.zeros((size, size), np.float32)
    t = p.get('joint', 2)
    for _, _, x0, y0, x1, y1 in panel_rects(size, p):
        for x in (x0, x1):
            xs = np.arange(x - t // 2, x - t // 2 + t) % size
            m[y0:y1, xs] = 1
        ys = np.arange(y0 - t // 2, y0 - t // 2 + t) % size
        m[ys, :] = 1
    return m


def blur(a, r):
    for _ in range(r):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a


def process(spec, images):
    seed = int(hashlib.sha256(spec['id'].encode()).hexdigest()[:8], 16)
    notes = []
    out = {}
    p = spec.get('panels')
    for purpose, im in images.items():
        a = np.asarray(im, np.float32)
        normal = purpose == 'normal'
        h0, w0 = a.shape[:2]
        if h0 != w0:
            # 原图不是正方形（比如 2:1）：沿短边平铺成正方形，不拉伸；原图四方连续，接得上
            if max(h0, w0) % min(h0, w0):
                raise SystemExit(f"{spec['id']}/{purpose}: {w0}×{h0} 铺不成正方形")
            k = max(h0, w0) // min(h0, w0)
            a = np.tile(a, (k, 1, 1) if h0 < w0 else (1, k, 1))
        if spec.get('rotate') == 90:
            a = rotate90(a, normal)
        n = spec.get('repeat', 1)
        if n > 1:
            # 原图的颗粒太大（水磨石的石子）：平铺 n×n 再缩回原来的边长，颗粒就小了
            size0 = a.shape[0]
            tiled = Image.fromarray(np.clip(np.tile(a, (n, n, 1)), 0, 255).astype(np.uint8), 'RGB').resize((size0, size0), Image.LANCZOS)
            a = np.asarray(tiled, np.float32)
        if p:
            a = panelise(a, p, seed, normal)
            mask = blur(joint_mask(a.shape[0], p), 1)
            if purpose == 'color':
                a = a * (1 - 0.34 * mask[..., None])
            elif normal:
                # 缝是凹槽：按缝的高度场求坡度，加到法线的 x、y 上
                h = blur(joint_mask(a.shape[0], p), 2)
                gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 127 * p.get('depth', 1)
                gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 127 * p.get('depth', 1)
                a[..., 0] = np.clip(a[..., 0] + gx, 0, 255)
                a[..., 1] = np.clip(a[..., 1] - gy, 0, 255)
            elif purpose == 'roughness':
                a = np.clip(a + 60 * mask[..., None], 0, 255)
        if purpose == 'color' and spec.get('mean'):
            target = np.array(spec['mean'], np.float32)
            mean = a.reshape(-1, 3).mean(0)
            d = spec.get('desaturate', 0)
            if d:
                a = a + (a.mean(2, keepdims=True) - a) * d
                mean = a.reshape(-1, 3).mean(0)
            a = target + (a * (target / np.maximum(mean, 1)) - target) * spec.get('contrast', 1)
        size = spec['maps'][purpose]
        im2 = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
        if im2.size != (size, size):
            im2 = im2.resize((size, size), Image.LANCZOS)
        out[purpose] = im2
    if spec.get('rotate') == 90:
        notes.append('rotated 90°')
    if spec.get('repeat', 1) > 1:
        notes.append(f"source tiled {spec['repeat']}×{spec['repeat']} to make the grain finer")
    if p:
        notes.append(f"cut into {p['cols']}×{p['rows']} panels with joints (each panel sampled from a different offset of the seamless source)")
    if spec.get('mean'):
        notes.append(f"colour mean normalised to rgb{tuple(spec['mean'])}, contrast ×{spec.get('contrast', 1)}"
                     + (f", desaturated {spec['desaturate']}" if spec.get('desaturate') else ''))
    notes.append('resized and JPEG-recompressed; no generative synthesis')
    return out, '; '.join(notes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'yunlan-texture-cache'))
    ap.add_argument('ids', nargs='*')
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.chdir(ROOT)
    spec_file = json.load(open('scripts/textures/scans.json'))
    assets, total = [], 0
    for spec in spec_file['sets']:
        if args.ids and spec['id'] not in args.ids:
            continue
        images, sources, meta = (load_polyhaven if spec['source'] == 'polyhaven' else load_ambientcg)(spec, args.cache)
        processed, note = process(spec, images)
        os.makedirs(f"{OUT}/{spec['id']}", exist_ok=True)
        maps = {}
        for purpose, im in processed.items():
            path = f"{OUT}/{spec['id']}/{purpose}.jpg"
            im.save(path, quality=QUALITY[purpose], optimize=True, subsampling=0 if purpose == 'normal' else 2)
            data = open(path, 'rb').read()
            total += len(data)
            maps[purpose] = {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'purpose': purpose,
                             'colorSpace': 'srgb' if purpose == 'color' else 'linear', 'width': im.width, 'height': im.height,
                             'mimeType': 'image/jpeg', 'sourceResolution': '1k', **sources[purpose]}
        assets.append({'id': spec['id'], 'name': meta['name'], 'label': spec['label'], 'use': spec['use'], 'meters': spec['meters'],
                       'source': meta['source'], 'sourceAsset': spec['asset'], 'sourceUrl': meta['sourceUrl'], 'license': meta['license'],
                       'licenseUrl': meta['licenseUrl'], 'authors': meta['authors'],
                       'sourceDimensionsMillimeters': meta['sourceDimensionsMillimeters'], 'processing': note,
                       'meanColor': spec.get('mean'), 'maps': maps})
        print(f"{spec['id']:22s} {meta['source']:10s} {spec['asset']:24s} " + ' '.join(f"{k}={v['bytes'] // 1024}KB" for k, v in maps.items()))
    if args.ids:
        print('只处理了指定的几套，清单没有重写')
        return
    manifest = {'version': 1, 'source': 'Poly Haven, ambientCG', 'license': 'CC0-1.0',
                'licenseLegalCode': 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
                'credit': 'Textures from Poly Haven and ambientCG (CC0). Downloaded once by scripts/textures/fetch-scans.py and self-hosted; no runtime API requests.',
                'totalImageBytes': total, 'assets': assets}
    with open(f'{OUT}/manifest.json', 'w') as f:
        f.write(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(f'{len(assets)} sets, {total / 1048576:.1f} MB')


if __name__ == '__main__':
    main()
