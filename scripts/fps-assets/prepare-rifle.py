"""零点突围的新步枪（M4A1，nisu，CC0）：从上游的 glTF 版本裁出要用的部件、压缩贴图，写进 assets/models/fps/。
上游文件（固定版本、哈希）记在 assets/models/fps/sources.json 的 rifleDownloads 里；原作的 OpenGameArt 压缩包也在那里（核对用）。
用法：python3 scripts/fps-assets/prepare-rifle.py <放上游文件的目录>
  目录里要有 steel_tide_m4a1.glb（脚本会核对字节数和 SHA-256）。

做的事：
  1. 只留 nisu 原作的零件（枪身、枪管、机匣、弹匣、拉机柄、枪托、前后机械瞄具、消焰器）——
     上游另外拼上去的前握把、消音器、瞄准镜、备用弹匣（Quaternius 的低模，纯色）去掉，连同它们的材质；
  2. 三张 2048 PNG 贴图（颜色、法线、金属度 / 粗糙度）缩到 1024，转成 JPEG（运行时按内存档位再缩到 512）；
     颜色图里几块发白的抛光件压暗一点；
  3. 网格、UV、节点层级（Magazine / ChargingHandle 这些会动的部件、MagazineGripSocket 之类的定位点）原样保留。
"""
from pathlib import Path
from PIL import Image
import sys, struct, json, io, hashlib

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/yunlan-rifle-source')
OUT = ROOT / 'assets/models/fps'
NAME = 'm4a1-mobile.glb'
DROP = {'Foregrip', 'Suppressor', 'OpticMount', 'SpareMagazine'}  # 上游拼上去的非 nisu 零件
SIZE = 1024
QUALITY = {'normal': 94, 'color': 90, 'mr': 90}

meta = json.loads((OUT / 'sources.json').read_text())
rec = next(d for d in meta['rifleDownloads'] if d['sourceFile'] == 'steel_tide_m4a1.glb')
raw = (SOURCE / rec['sourceFile']).read_bytes()
assert len(raw) == rec['bytes'] and hashlib.sha256(raw).hexdigest() == rec['sha256'], '上游文件对不上：' + rec['sourceFile']
magic, version, total = struct.unpack_from('<III', raw)
assert magic == 0x46546C67 and version == 2 and total == len(raw)
jl = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + jl])
off = 20 + jl
bl, bt = struct.unpack_from('<II', raw, off)
binary = raw[off + 8: off + 8 + bl]

# ---- 1. 去掉不要的节点（连同子节点） ----
nodes = doc['nodes']
dead = set()
def kill(i):
    dead.add(i)
    for c in nodes[i].get('children', []): kill(c)
for i, n in enumerate(nodes):
    if n.get('name') in DROP: kill(i)
keep_nodes = [i for i in range(len(nodes)) if i not in dead]
nmap = {o: k for k, o in enumerate(keep_nodes)}
new_nodes = []
for o in keep_nodes:
    n = dict(nodes[o])
    if 'children' in n:
        n['children'] = [nmap[c] for c in n['children'] if c in nmap]
        if not n['children']: del n['children']
    new_nodes.append(n)
for s in doc['scenes']: s['nodes'] = [nmap[c] for c in s['nodes'] if c in nmap]

# ---- 网格、材质、贴图、访问器：只留还用得着的，重新编号 ----
used_mesh = sorted({n['mesh'] for n in new_nodes if 'mesh' in n})
mmap = {o: k for k, o in enumerate(used_mesh)}
for n in new_nodes:
    if 'mesh' in n: n['mesh'] = mmap[n['mesh']]
meshes = [doc['meshes'][o] for o in used_mesh]
used_mat = sorted({p['material'] for m in meshes for p in m['primitives'] if 'material' in p})
matmap = {o: k for k, o in enumerate(used_mat)}
for m in meshes:
    for p in m['primitives']:
        if 'material' in p: p['material'] = matmap[p['material']]
materials = [doc['materials'][o] for o in used_mat]
def tex_refs(mat):
    out = []
    def walk(x):
        if isinstance(x, dict):
            if 'index' in x and ('texCoord' in x or set(x) <= {'index', 'scale', 'strength', 'texCoord', 'extensions'}): out.append(x)
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(mat); return out
refs = [r for m in materials for r in tex_refs(m)]
used_tex = sorted({r['index'] for r in refs})
tmap = {o: k for k, o in enumerate(used_tex)}
for r in refs: r['index'] = tmap[r['index']]
textures = [doc['textures'][o] for o in used_tex]
used_img = sorted({t['source'] for t in textures})
imap = {o: k for k, o in enumerate(used_img)}
for t in textures: t['source'] = imap[t['source']]
images = [doc['images'][o] for o in used_img]
used_acc = sorted({a for m in meshes for p in m['primitives'] for a in list(p['attributes'].values()) + ([p['indices']] if 'indices' in p else [])})
amap = {o: k for k, o in enumerate(used_acc)}
for m in meshes:
    for p in m['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = amap[p['indices']]
accessors = [doc['accessors'][o] for o in used_acc]

# ---- 2. 贴图：哪张是颜色 / 法线 / 金属度粗糙度 ----
kind_of = {}
for m in materials:
    pbr = m.get('pbrMetallicRoughness', {})
    if 'baseColorTexture' in pbr: kind_of[textures[pbr['baseColorTexture']['index']]['source']] = 'color'
    if 'metallicRoughnessTexture' in pbr: kind_of[textures[pbr['metallicRoughnessTexture']['index']]['source']] = 'mr'
    if 'normalTexture' in m: kind_of[textures[m['normalTexture']['index']]['source']] = 'normal'

# ---- 3. 重新打包二进制：用得着的 bufferView 依次排 ----
views = doc['bufferViews']
used_view = sorted({a['bufferView'] for a in accessors if 'bufferView' in a} | {im['bufferView'] for im in images})
vmap = {o: k for k, o in enumerate(used_view)}
img_by_view = {im['bufferView']: (k, im) for k, im in enumerate(images)}
chunks, new_views, offset, tex_records = [], [], 0, []
for o in used_view:
    v = dict(views[o]); content = binary[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    if o in img_by_view:
        k, im = img_by_view[o]; kind = kind_of.get(k, 'color')
        img = Image.open(io.BytesIO(content)); old = list(img.size)
        img = img.convert('RGB')
        if kind == 'color':
            # 颜色图上有几块亮到 0.55 的「抛光钢」（空仓挂机钮、枪机），在游戏的灯下发白、像塑料：亮度超过 0.45 的压回 0.45 左右
            img = img.point(lambda v: v if v <= 115 else int(115 + (v - 115) * 0.25))
        if max(img.size) > SIZE: img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        dst = io.BytesIO(); img.save(dst, 'JPEG', quality=QUALITY[kind], optimize=True, subsampling=0)
        content = dst.getvalue(); im['mimeType'] = 'image/jpeg'
        tex_records.append({'name': im.get('name', str(k)), 'kind': kind, 'source': old, 'runtime': list(img.size), 'bytes': len(content)})
    v['byteOffset'] = offset; v['byteLength'] = len(content); v['buffer'] = 0
    new_views.append(v); chunks.append(content)
    pad = (-len(content)) % 4; chunks.append(b'\0' * pad); offset += len(content) + pad
for a in accessors:
    if 'bufferView' in a: a['bufferView'] = vmap[a['bufferView']]
for im in images: im['bufferView'] = vmap[im['bufferView']]

doc.update(nodes=new_nodes, meshes=meshes, materials=materials, textures=textures, images=images, accessors=accessors, bufferViews=new_views, buffers=[{'byteLength': offset}])
doc['asset'].setdefault('extras', {})['yunlanAdaptation'] = ('Trimmed to the CC0 nisu M4A1 parts (Quaternius foregrip, suppressor, optic and spare magazine removed); '
    'textures resized to 1024 px and re-encoded as JPEG. Mesh topology, UVs and node hierarchy retained. See sources.json.')
js = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
js += b' ' * ((-len(js)) % 4)
binout = b''.join(chunks)
result = struct.pack('<III', magic, version, 12 + 8 + len(js) + 8 + len(binout)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binout), bt) + binout
(OUT / NAME).write_bytes(result)

def tris(m):
    return sum((accessors[p['indices']]['count'] if 'indices' in p else accessors[p['attributes']['POSITION']]['count']) // 3 for p in m['primitives'])
record = {'file': NAME, 'bytes': len(result), 'sha256': hashlib.sha256(result).hexdigest(), 'sourceFile': rec['sourceFile'], 'sourceBytes': len(raw),
          'sourceSha256': rec['sha256'], 'triangles': sum(tris(m) for m in meshes), 'meshes': len(meshes), 'animations': [],
          'license': 'CC0-1.0', 'author': 'nisu', 'textures': tex_records}
man = json.loads((OUT / 'manifest.json').read_text())
man['files'] = [f for f in man['files'] if f['file'] != NAME] + [record]
(OUT / 'manifest.json').write_text(json.dumps(man, indent=2, ensure_ascii=False) + '\n')
print(NAME, len(result), 'bytes,', record['triangles'], 'triangles,', len(meshes), 'meshes')
for t in tex_records: print(' ', t)
