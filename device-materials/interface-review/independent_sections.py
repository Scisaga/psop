"""Recheck the manually selected Microduck source sections without Build code.

Run from the repository root. The fixed JSON is the reviewed annotation input;
this script checks its raw STL witnesses and section closure, not Build output.
Only the Python standard library is used. No production detector is imported.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import struct
import zipfile


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a):
    length = math.sqrt(dot(a, a))
    return tuple(x / length for x in a)


def triangles(raw):
    count = struct.unpack_from('<I', raw, 80)[0]
    if len(raw) != 84 + count * 50:
        raise ValueError('The annotation expects the original binary STL bytes.')
    return [tuple(struct.unpack_from('<3f', raw, 84 + i * 50 + 12 + j * 12) for j in range(3)) for i in range(count)]


def sections(facets, axis, offset):
    """Intersect source triangles with a plane; join the resulting segments.

    Unlike Build cylinder fitting, this does not group triangle normals or
    search/fill a cylinder patch. Coordinates are welded at 0.1 micrometre.
    """
    edges = []
    for index, triangle in enumerate(facets):
        distances = [dot(p, axis) - offset for p in triangle]
        points = []
        for i, j in ((0, 1), (1, 2), (2, 0)):
            if distances[i] * distances[j] < -1e-20:
                fraction = distances[i] / (distances[i] - distances[j])
                points.append(tuple(triangle[i][k] + fraction * (triangle[j][k] - triangle[i][k]) for k in range(3)))
        if len(points) == 2:
            edges.append((points[0], points[1], index))
    def key(point):
        return tuple(round(x / 1e-7) for x in point)
    adjacent, positions = defaultdict(list), {}
    for index, (a, b, _) in enumerate(edges):
        first, second = key(a), key(b)
        adjacent[first].append((second, index))
        adjacent[second].append((first, index))
        positions[first], positions[second] = a, b
    remaining, contours = set(range(len(edges))), []
    while remaining:
        first = key(edges[min(remaining)][0])
        current, points, witnesses = first, [], []
        while True:
            options = [(p, i) for p, i in adjacent[current] if i in remaining]
            if not options:
                break
            following, index = options[0]
            remaining.remove(index)
            points.append(positions[current])
            witnesses.append(edges[index][2])
            current = following
            if current == first:
                break
        contours.append({'closed': current == first, 'points': points, 'triangles': sorted(witnesses)})
    return contours


def check_feature(facets, feature):
    center, axis = feature['center_local_m'], feature['axis_local']
    contours = sections(facets, axis, dot(center, axis))
    witnesses = set(feature['triangle_witnesses'])
    matches = [c for c in contours if c['closed'] and set(c['triangles']) == witnesses]
    if len(matches) != 1:
        raise ValueError(f"{feature['id']}: raw source section is missing, open, or has different triangle witnesses")
    contour = matches[0]
    residuals = []
    for point in contour['points']:
        relative = sub(point, center)
        radial = sub(relative, tuple(dot(relative, axis) * v for v in axis))
        residuals.append(abs(math.sqrt(dot(radial, radial)) - feature['radius_m']))
    max_error = max(residuals)
    if max_error > feature['tolerance_m']:
        raise ValueError(f"{feature['id']}: independent section radius residual {max_error}")
    radial_normals = []
    for index in witnesses:
        triangle = facets[index]
        normal = unit(cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0])))
        relative = sub(tuple(sum(p[k] for p in triangle) / 3 for k in range(3)), center)
        radial = sub(relative, tuple(dot(relative, axis) * v for v in axis))
        radial_normals.append(dot(normal, unit(radial)))
    if max(radial_normals) > -.95:
        raise ValueError(f"{feature['id']}: source winding does not support an inner wall")
    return {'id': feature['id'], 'source_triangles': len(witnesses), 'closed_section': True,
            'max_radius_residual_m': max_error, 'max_outward_radial_dot': max(radial_normals)}


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=root / 'device-materials/microduck-official-materials.zip')
    parser.add_argument('--annotations', type=Path, default=Path(__file__).with_name('microduck-review.json'))
    args = parser.parse_args()
    annotations = json.loads(args.annotations.read_text(encoding='utf-8'))
    report = []
    with zipfile.ZipFile(args.input) as archive:
        for sample in annotations['samples']:
            raw = archive.read(sample['source_path'])
            if hashlib.sha256(raw).hexdigest() != sample['geometry_sha256']:
                raise ValueError('Source geometry changed: ' + sample['mesh_key'])
            facets = triangles(raw)
            report.extend(check_feature(facets, feature) for feature in sample['expected_features'])
    print(json.dumps({'method': 'independent-source-plane-sections/1', 'passed': len(report), 'features': report}, indent=2))


if __name__ == '__main__':
    main()
