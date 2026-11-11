"""Read-only interface support and original/compatible binding review of a DKP."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from psop_build_v2.capability_package import _load_catalog, _read
from psop_build_v2.interface_review import review_interfaces


def review_package(root):
    manifest = _read(root / 'manifest.json')
    scene = _read(root / 'indexes/scene.json')
    catalog = _load_catalog(root, scene)
    authored = root / 'sources/SRC-MD-ASSEMBLY-CATALOG.json'
    policy = _read(authored).get('provenance', {}).get('compatibility_interface_policy', {}) if authored.is_file() else {}
    compatibility = {'candidates': [], 'placement_exclusions': []}
    for entry in _read(root / 'indexes/compatibility.json')['pairs']:
        detail = _read(root / entry['path'])
        if entry['candidate_count'] != len(detail['candidates']):
            raise ValueError('Compatibility index differs from its pair shard')
        for candidate in detail['candidates']:
            compatibility['candidates'].append({'id': candidate['id'], 'interface_matches': [
                {**{key: match[key] for key in ('interface_a_ref', 'interface_b_ref')},
                 'alignment_options': [{'member_pairs': [{key: p[key] for key in ('member_a_ref', 'member_b_ref')} for p in o['member_pairs']]}
                                       for o in match['alignment_options']]}
                for match in candidate.get('interface_matches', [])]})
        for exclusion in detail.get('placement_exclusions', []):
            compatibility['placement_exclusions'].append({
                **{key: exclusion[key] for key in ('interface_a_ref', 'interface_b_ref')},
                'alignment_options': [{'interference': {'status': o.get('interference', {}).get('status', 'not_evaluated')}} for o in exclusion['alignment_options']]})
    return {'package_version': manifest['package_version'], 'package_digest': manifest['package_digest'],
            **review_interfaces(catalog, compatibility, policy)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dkp', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = review_package(args.dkp.resolve(strict=True))
    if args.output:
        destination = args.output.resolve()
        if destination.is_relative_to(args.dkp.resolve()):
            raise ValueError('Review output must be outside the immutable DKP')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in {'interfaces', 'reference_connections'}}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
