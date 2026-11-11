"""Read-only audit of a retained DKP's original installation interfaces.

Checks the published inventory and source facets, joint bridges, and nearby
round features in the reconciled reference configuration. Geometric proximity
is reported as an observation requiring review, never as a new connection.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import gzip
import hashlib
from itertools import combinations
import json
import math
from pathlib import Path
import struct
import sys

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'skills/psop-build/scripts'))
from psop_build_v2.mechanics import _rotate


def read(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def dot(a, b): return sum(x*y for x, y in zip(a, b))
def sub(a, b): return [x-y for x, y in zip(a, b)]
def norm(a): return math.sqrt(dot(a, a))
def unit(a): return [x/norm(a) for x in a]
def world(part, point): return [x+y for x, y in zip(part['position'], _rotate(point, part['quaternion']))]


def audit(root):
    manifest = read(root/'manifest.json')
    scene = read(root/manifest['entrypoints']['scene'])
    parts = {p['id']: deepcopy(p) for p in scene['parts']}
    for placement in scene.get('reference_alignment', {}).get('placements', []):
        parts[placement['part_ref']]['position'] = placement['position']
    if any(any(abs(s-1)>1e-12 for s in p['scale']) for p in parts.values()):
        raise ValueError('Source-facet audit requires unit source scales')
    interfaces = {i['id']: i for i in scene['assembly']['interfaces']}
    authored = read(root/'sources/SRC-MD-ASSEMBLY-CATALOG.json')
    review = read(REPO/'device-materials/assembly/reference-use-review.json')
    raw_review = read(REPO/'device-materials/assembly/reference-surface-observations.json')
    features, details, sources, errors, rounds = {}, {}, {}, [], []
    captured_digests = {s['digest'] for s in scene['sources']}
    for relative in ['reference-use-review.json', 'reference-surface-observations.json']:
        digest = hashlib.sha256((REPO/'device-materials/assembly'/relative).read_bytes()).hexdigest()
        if digest not in captured_digests:
            errors.append({'kind': 'review_not_bound_to_package', 'path': relative, 'sha256': digest})
    for part in parts.values():
        detail = read(root/scene['assembly']['capability_index']['parts'][part['id']]['path'])
        details[part['id']] = detail
        for feature in detail['features']:
            if feature['owner_ref'] != part['id']:
                errors.append({'kind': 'wrong_feature_owner', 'feature_ref': feature['id']})
            features[feature['id']] = feature
        if part['geometryUrl'] not in sources:
            raw = (root/part['geometryUrl']).read_bytes()
            sources[part['geometryUrl']] = {'raw': raw, 'sha256': hashlib.sha256(raw).hexdigest(),
                                          'triangles': struct.unpack_from('<I', raw, 80)[0]}
    selected, by_pair, by_interface = {}, defaultdict(list), defaultdict(list)
    connections = scene['assembly']['connections']
    overrides = {c['connection_ref']: c for c in scene.get('reference_alignment', {}).get('presentation', {}).get('connections', [])}
    effective_basis = {c['id']: overrides.get(c['id'], {}).get('basis', c['basis']) for c in connections}
    for connection in connections:
        owners = []
        for endpoint in connection['endpoints']:
            interface = interfaces[endpoint['interface_ref']]
            owner = interface['owner_ref']
            owners.append(owner)
            by_interface[interface['id']].append(connection['id'])
            members = [m for m in interface['members'] if not endpoint['member_refs'] or m['id'] in endpoint['member_refs']]
            selected[connection['id'], owner] = {t for m in members for ref in m['feature_refs'] for t in features[ref]['geometry']['triangle_indices']}
        for pair in combinations(sorted(set(owners)), 2):
            by_pair[pair].append(connection['id'])
    interfaces_by_part = defaultdict(list)
    for interface in interfaces.values():
        interfaces_by_part[interface['owner_ref']].append(interface)
    interface_triangles = {}
    for interface in interfaces.values():
        owner = interface['owner_ref']
        indices = set()
        for member in interface['members']:
            for ref in member['feature_refs']:
                feature = features.get(ref)
                if not feature or feature['owner_ref'] != owner:
                    errors.append({'kind': 'invalid_interface_feature', 'interface_ref': interface['id'], 'feature_ref': ref})
                    continue
                indices.update(feature['geometry']['triangle_indices'])
        if not indices or min(indices)<0 or max(indices)>=sources[parts[owner]['geometryUrl']]['triangles']:
            errors.append({'kind': 'invalid_source_facets', 'interface_ref': interface['id']})
        interface_triangles[interface['id']] = indices
    for part in parts.values():
        source = sources[part['geometryUrl']]
        expected = next(s['digest'] for s in scene['sources'] if s['url'] == part['geometryUrl'])
        if expected != source['sha256']:
            errors.append({'kind': 'source_hash_changed', 'owner_ref': part['id']})
        for feature in details[part['id']]['features']:
            g = feature['geometry']
            if feature.get('basis') != 'mesh_measurement' or feature.get('candidate_eligible') is False or g['type'] not in {'cylinder', 'conical_frustum'}:
                continue
            indices = set(g['triangle_indices'])
            axis = unit(g['axis'])
            low, high = g['axial_range_m'] if g['type']=='cylinder' else [0., g['length_m']]
            radii = [g['radius_m']]*2 if g['type']=='cylinder' else [g['radius_start_m'], g['radius_end_m']]
            max_error = 0.
            for index in indices:
                triangle = struct.unpack_from('<12fH', source['raw'], 84+50*index)
                for at in (3, 6, 9):
                    delta = sub(triangle[at:at+3], g['origin'])
                    axial = dot(delta, axis)
                    radial = norm(sub(delta, [axial*v for v in axis]))
                    expected_radius = radii[0]+(radii[1]-radii[0])*(axial-low)/(high-low)
                    max_error = max(max_error, abs(radial-expected_radius))
            fit_limit = feature['measurement']['fit_max_m'] + feature['tolerances']['numerical_m']
            # Discovery represents sufficiently small radial gradients as a
            # cylinder. Its discarded half-span drift is separate from the
            # fitted radial-law residual retained in measurement metadata.
            if g['type']=='cylinder':
                fit_limit += abs(feature['measurement'].get('radius_gradient', 0.))*(high-low)/2
            if max_error > fit_limit:
                errors.append({'kind': 'round_source_fit_mismatch', 'feature_ref': feature['id'], 'max_error_m': max_error, 'declared_limit_m': fit_limit})
            semantic = [{'interface_ref': i['id'], 'fraction': len(indices & interface_triangles[i['id']])/len(indices)}
                        for i in interfaces_by_part[part['id']] if indices & interface_triangles[i['id']]]
            rounds.append({'feature_ref': feature['id'], 'owner_ref': part['id'], 'kind': feature['kind'], 'type': g['type'],
                           'origin': world(part, g['origin']), 'axis': unit(_rotate(axis, part['quaternion'])),
                           'range': [low, high], 'radii': radii, 'triangles': indices, 'source_fit_max_m': max_error, 'source_fit_limit_m': fit_limit,
                           'angular_coverage': feature.get('measurement', {}).get('angular_coverage'), 'semantic_interfaces': semantic})

    def radius_at(feature, point):
        t = dot(sub(point, feature['origin']), feature['axis'])
        a, b = feature['range']
        return feature['radii'][0]+(feature['radii'][1]-feature['radii'][0])*(t-a)/(b-a)

    observations = []
    for a, b in combinations(rounds, 2):
        if a['owner_ref'] == b['owner_ref']: continue
        inner_a, inner_b = 'bore' in a['kind'], 'bore' in b['kind']
        if not inner_a and not inner_b: continue
        cosine = dot(a['axis'], b['axis'])
        if abs(cosine)<math.cos(math.radians(.1)): continue
        delta = sub(b['origin'], a['origin'])
        offset = dot(delta, a['axis'])
        distance = norm(sub(delta, [offset*v for v in a['axis']]))
        if distance > .00025: continue
        blo, bhi = sorted(offset+cosine*t for t in b['range'])
        alo, ahi = a['range']
        overlap = min(ahi, bhi)-max(alo, blo)
        gap = max(0., -overlap)
        if inner_a == inner_b:
            if a['type'] != 'cylinder' or b['type'] != 'cylinder' or gap > .004 or abs(a['radii'][0]-b['radii'][0])>.00055: continue
            kind = 'aligned_bore_observation'
            clearance = None
        else:
            if overlap < .0001: continue
            clearances = []
            for t in [max(alo, blo), min(ahi, bhi)]:
                point = [x+t*v for x, v in zip(a['origin'], a['axis'])]
                ra, rb = radius_at(a, point), radius_at(b, point)
                clearances.append(ra-rb if inner_a else rb-ra)
            if min(clearances)<-.00005 or max(clearances)>.0004: continue
            kind, clearance = 'shaft_bore_observation', [min(clearances), max(clearances)]
        pair = tuple(sorted([a['owner_ref'], b['owner_ref']]))
        linked = []
        for cid in by_pair[pair]:
            cover = [len(f['triangles'] & selected[cid, f['owner_ref']])/len(f['triangles']) for f in (a, b)]
            if min(cover) >= .5:
                linked.append({'connection_ref': cid, 'basis': effective_basis[cid], 'coverage': cover})
        observations.append({'kind': kind, 'owner_refs': [a['owner_ref'], b['owner_ref']], 'feature_refs': [a['feature_ref'], b['feature_ref']],
                             'radii_m': [a['radii'], b['radii']], 'angular_coverage': [a['angular_coverage'], b['angular_coverage']],
                             'axis_distance_m': distance, 'axial_gap_m': gap, 'axial_overlap_m': max(0., overlap), 'radial_clearance_m': clearance,
                             'functional_interfaces': [a['semantic_interfaces'], b['semantic_interfaces']],
                             'same_pair_connection_refs': by_pair[pair], 'facet_matched_connections': linked})

    joints = []
    for joint in scene['joints']:
        bridges = []
        for connection in connections:
            bodies = {parts[interfaces[e['interface_ref']]['owner_ref']]['body'] for e in connection['endpoints']}
            if {joint['parent'], joint['body']} <= bodies:
                bridges.append({'connection_ref': connection['id'], 'basis': effective_basis[connection['id']]})
        joints.append({'joint_ref': joint['id'], 'name': joint['name'], 'parent': joint['parent'], 'body': joint['body'], 'bridges': bridges})
    review_by_part = {r['owner_ref']: r for r in review['parts']}
    inventory = []
    for part in parts.values():
        rows = interfaces_by_part[part['id']]
        r = review_by_part.get(part['id'])
        if not r or set(r['required_interface_refs']) != {i['id'] for i in rows}:
            errors.append({'kind': 'functional_review_interface_coverage', 'owner_ref': part['id']})
        inventory.append({'owner_ref': part['id'], 'name': part['name'], 'mesh_key': part['meshKey'], 'body': part['body'],
                          'interface_count': len(rows), 'interfaces': [{'id': i['id'], 'key': i['key'], 'name': i['name'],
                          'members': len(i['members']), 'connection_refs': by_interface[i['id']]} for i in rows],
                          'open_items': r['open_items'] if r else ['Missing independent part review']})
    return {'schema': 'psop.original-installation-audit/1', 'package_digest': manifest['package_digest'], 'package_version': manifest['package_version'],
            'configuration_ref': scene['reference_alignment']['configuration_ref'],
            'scope': 'All retained source instances and functional interfaces; finite round observations and body-joint bridges in the reconciled configuration. Observations do not establish installation use or retention.',
            'counts': {'parts': len(parts), 'source_meshes': len(sources), 'features': len(features), 'functional_interfaces': len(interfaces),
                       'reference_connections': len(connections), 'reviewed_joints': len(joints), 'round_features_rechecked_against_source': len(rounds),
                       'round_observations': len(observations), 'known_open_items': sum(len(p['open_items']) for p in inventory)},
            'parameters': {'axis_angle_degrees': .1, 'axis_distance_m': .00025, 'bore_channel_gap_m': .004,
                           'bore_radius_difference_m': .00055, 'minimum_radial_overlap_m': .0001, 'radial_clearance_window_m': [-.00005, .0004]},
            'checks': {'integrity_errors': errors, 'all_joints_have_non_excluded_bridge': all(any(b['basis']!='incompatible' for b in j['bridges']) for j in joints),
                       'current_catalog_matches_captured_input': {k: v for k, v in scene['assembly'].items() if k!='capability_index'} == authored['catalog'],
                       'review_pair_coverage': len(raw_review['pair_checks']), 'unconnected_planar_pairs': [d for d in review['surface_pair_dispositions'] if d['status']=='clearance_or_motion_neighbor']},
            'published_dispositions': dict(Counter(d['status'] for p in review['parts'] for d in p['interface_dispositions'])),
            'effective_connection_bases': dict(Counter(effective_basis.values())),
            'source_meshes': [{'path': p, 'sha256': s['sha256'], 'triangles': s['triangles']} for p, s in sorted(sources.items())],
            'parts': inventory, 'joints': joints, 'round_observations': observations,
            'limits': ['Unknown source regions and noncircular structures retain their published evidence; this round audit is not exhaustive shape recognition.',
                       'Coaxiality or adjacency alone cannot establish fixing, actual member selection, screw specification, installation path, or holding.']}


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dkp', type=Path, default=REPO/'build/microduck/source-1.15/microduck-capabilities-9.dkp')
    parser.add_argument('--output', type=Path, default=REPO/'build/original-installation-audit/inventory.json')
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(args.dkp.resolve()):
        parser.error('Audit output must be outside the immutable DKP')
    result = audit(args.dkp.resolve(strict=True))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'counts': result['counts'], 'errors': result['checks']['integrity_errors'],
                      'joint_bridges': result['checks']['all_joints_have_non_excluded_bridge'],
                      'catalog_matches': result['checks']['current_catalog_matches_captured_input']}, ensure_ascii=False))
    raise SystemExit(bool(result['checks']['integrity_errors']))
