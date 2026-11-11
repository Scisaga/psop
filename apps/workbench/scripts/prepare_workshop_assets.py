"""Fetch documented display assets and package unchanged payloads as local GLB files."""
import concurrent.futures
import hashlib
import json
import math
import pathlib
import struct
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.runtime/simulate-review/research-workshop/assets'
DEST = ROOT / 'src/assets/workshop/models'
CACHE.mkdir(parents=True, exist_ok=True)
DEST.mkdir(parents=True, exist_ok=True)
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
records = []


def fetch(url, target):
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(url, headers={'User-Agent': 'PSOPWorkbench/1.0'})
        target.write_bytes(OPENER.open(request, timeout=35).read())
    raw = target.read_bytes()
    records.append({'url': url, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
    return raw


def append(binary, raw):
    binary.extend(bytes((-len(binary)) % 4))
    offset = len(binary)
    binary.extend(raw)
    return offset


def glb(document, binary, name):
    binary.extend(bytes((-len(binary)) % 4))
    document['buffers'] = [{'byteLength': len(binary)}]
    raw = json.dumps(document, separators=(',', ':')).encode()
    raw += b' ' * ((-len(raw)) % 4)
    packed = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(raw) + 8 + len(binary))
    packed += struct.pack('<I4s', len(raw), b'JSON') + raw
    packed += struct.pack('<I4s', len(binary), b'BIN\x00') + binary
    (DEST / name).write_bytes(packed)
    return {'file': name, 'bytes': len(packed), 'sha256': hashlib.sha256(packed).hexdigest()}


def polyhaven(asset):
    base = 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/2k/' + asset + '/'
    raw = fetch(base + asset + '_2k.gltf', CACHE / (asset + '.gltf'))
    doc = json.loads(raw)
    binary, offsets = bytearray(), []
    for source in doc['buffers']:
        offsets.append(append(binary, fetch(base + source['uri'], CACHE / asset / source['uri'])))
    for view in doc['bufferViews']:
        view['byteOffset'] = view.get('byteOffset', 0) + offsets[view['buffer']]
        view['buffer'] = 0
    for image in doc['images']:
        uri = image.pop('uri')
        image_url = 'https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/' + asset + '/' + pathlib.PurePosixPath(uri).name
        content = fetch(image_url, CACHE / asset / uri)
        image['bufferView'] = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': append(binary, content), 'byteLength': len(content)})
    doc['asset']['copyright'] = 'CC0-1.0; Poly Haven contributors; https://polyhaven.com/a/' + asset
    doc['asset']['extras'] = {'source': 'https://polyhaven.com/a/' + asset, 'processing': 'Repack only. Original mesh, UVs and 2K images retained.'}
    return glb(doc, binary, asset + '.glb')


def robot():
    base = 'https://cdn.jsdelivr.net/gh/ros-industrial/abb@kinetic-devel/abb_irb120_support/'
    names = ['base_link'] + ['link_' + str(n) for n in range(1, 7)]
    def load(name):
        return fetch(base + 'meshes/irb120_3_58/visual/' + name + '.stl', CACHE / (name + '.stl'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(load, names))
    doc = {'asset': {'version': '2.0', 'generator': 'PSOP static display asset packer',
                     'copyright': 'Apache-2.0; ROS-Industrial abb_irb120_support contributors',
                     'extras': {'source': 'https://github.com/ros-industrial/abb/tree/kinetic-devel/abb_irb120_support',
                                'processing': 'Original CAD-derived visual STL facets. Static display pose from published joint origins; no dynamics.'}},
           'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'ROS Z-up to glTF Y-up', 'rotation': [-math.sqrt(.5), 0, 0, math.sqrt(.5)], 'children': [1]}],
           'meshes': [], 'materials': [
               {'name': 'Painted cast shell', 'pbrMetallicRoughness': {'baseColorFactor': [.49, .55, .58, 1], 'metallicFactor': .45, 'roughnessFactor': .32}},
               {'name': 'Tool flange', 'pbrMetallicRoughness': {'baseColorFactor': [.08, .1, .12, 1], 'metallicFactor': .75, 'roughnessFactor': .3}}],
           'accessors': [], 'bufferViews': []}
    binary = bytearray()
    for n, (name, source) in enumerate(zip(names, sources)):
        count = struct.unpack_from('<I', source, 80)[0]
        if len(source) != 84 + count * 50:
            raise ValueError('Expected binary STL: ' + name)
        positions, normals = [], []
        for i in range(count):
            values = struct.unpack_from('<12f', source, 84 + i * 50)
            positions.extend(values[3:])
            normals.extend(values[:3] * 3)
        attrs = {}
        for key, values in [('POSITION', positions), ('NORMAL', normals)]:
            packed = struct.pack('<' + 'f' * len(values), *values)
            view = len(doc['bufferViews'])
            doc['bufferViews'].append({'buffer': 0, 'byteOffset': append(binary, packed), 'byteLength': len(packed), 'target': 34962})
            accessor = {'bufferView': view, 'componentType': 5126, 'count': count * 3, 'type': 'VEC3'}
            if key == 'POSITION':
                accessor['min'] = [min(values[a::3]) for a in range(3)]
                accessor['max'] = [max(values[a::3]) for a in range(3)]
            attrs[key] = len(doc['accessors'])
            doc['accessors'].append(accessor)
        doc['meshes'].append({'name': name, 'primitives': [{'attributes': attrs, 'material': int(n == 6)}]})
        origins = [[0, 0, 0], [0, 0, 0], [0, 0, .29], [0, 0, .27], [0, 0, .07], [.302, 0, 0], [.072, 0, 0]]
        angles = [0, 0, .4, .85, 0, -.6, 0]
        axes = [[0, 0, 1], [0, 0, 1], [0, 1, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0], [1, 0, 0]]
        angle, axis = angles[n], axes[n]
        node = {'name': name, 'mesh': n, 'translation': origins[n],
                'rotation': [a * math.sin(angle / 2) for a in axis] + [math.cos(angle / 2)]}
        if n < 6:
            node['children'] = [n + 2]
        doc['nodes'].append(node)
    urdf = fetch(base + 'urdf/irb120_3_58_macro.xacro', CACHE / 'abb_urdf.xml')
    package = fetch(base + 'package.xml', CACHE / 'abb_license.xml')
    (DEST / 'abb-irb120-source.xacro').write_bytes(urdf)
    (DEST / 'abb-irb120-package.xml').write_bytes(package)
    license_bytes = fetch('https://www.apache.org/licenses/LICENSE-2.0.txt', CACHE / 'Apache-2.0.txt')
    (DEST / 'Apache-2.0.txt').write_bytes(license_bytes)
    (DEST / 'NOTICE.txt').write_text(
        'ABB IRB 120 display mesh\nSource: ros-industrial/abb, abb_irb120_support 1.3.1 (kinetic-devel)\n'
        'Package authors: Mark Culleton and Kevin Kelly, Trinity College Dublin.\n'
        'Package license: Apache-2.0. Original visual facets retained. Display materials and a fixed pose added by PSOP.\n'
        'The original joint definition and package attribution accompany this asset.\n', encoding='utf8')
    return glb(doc, binary, 'precision-assistant.glb')


if __name__ == '__main__':
    outputs = [polyhaven('desk_lamp_arm_01'), robot()]
    floor_outputs = []
    for filename, resolution, kind in [('smooth-floor-color-4k.jpg', '4k', 'diff'), ('smooth-floor-normal-2k.jpg', '2k', 'nor_gl'), ('smooth-floor-arm-2k.jpg', '2k', 'arm')]:
        url = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/' + resolution + '/smooth_concrete_floor/smooth_concrete_floor_' + kind + '_' + resolution + '.jpg'
        raw = fetch(url, DEST.parent / filename)
        floor_outputs.append({'file': '../' + filename, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'resolution': resolution})
    manifest = {'prepared_on': '2026-11-11', 'models': outputs, 'floor': floor_outputs, 'downloads': sorted(records, key=lambda r: r['url']),
                'license_pages': ['https://polyhaven.com/license', 'https://github.com/ros-industrial/abb/blob/kinetic-devel/abb_irb120_support/package.xml']}
    (DEST / 'source.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    public = ROOT / 'static/licenses/workshop'
    public.mkdir(parents=True, exist_ok=True)
    for name in ['Apache-2.0.txt', 'NOTICE.txt', 'abb-irb120-package.xml']:
        (public / name).write_bytes((DEST / name).read_bytes())
    (public / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'outputs': outputs, 'source_files': len(records)}))
