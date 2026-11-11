"""Read-only review of the CLI artifact; writes only sibling review artifacts."""
import collections
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
result = json.loads((HERE / 'forward-trial-query.json').read_text(encoding='utf-8'))
package = Path(result['package']['path'])
manifest = json.loads((package / 'manifest.json').read_text(encoding='utf-8'))
before = json.loads((HERE / 'forward-trial-package-before.json').read_text(encoding='utf-8-sig'))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

after = [
    {'path': p.relative_to(package).as_posix(), 'size': p.stat().st_size, 'sha256': digest(p)}
    for p in sorted(package.rglob('*')) if p.is_file()
]
(HERE / 'forward-trial-package-after.json').write_text(
    json.dumps(after, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
index_before = {item['path']: item for item in before}
index_after = {item['path']: item for item in after}
changed = sorted(k for k in index_before.keys() | index_after.keys()
                 if index_before.get(k) != index_after.get(k))

sources = {s['id']: s for s in result['geometry_context']['sources']}
evidence = {e['id']: e for e in result['geometry_context']['evidence']}
sites = {s['id']: s for s in result['mounting_sites']}
knowledge = json.loads((package / manifest['inputs']['assembly_knowledge']['path']).read_text(encoding='utf-8'))
assertions = {a['id']: a for key in ('interface_families', 'reference_assemblies') for a in knowledge[key]}
lineage_records = result['functional_interfaces'] + result['reference_mounts']
needed_sources = sorted({ref for r in lineage_records for ref in r['source_refs']})
needed_evidence = sorted({ref for r in lineage_records for ref in r['evidence_refs']})
needed_assertions = sorted({ref for r in lineage_records for ref in r['assertion_refs']})
source_checks = []
for ref in needed_sources:
    source = sources.get(ref)
    if source is None:
        source_checks.append({'source_ref': ref, 'resolved': False})
        continue
    source_path = package / source['url']
    actual_digest = digest(source_path)
    source_checks.append({
        'source_ref': ref, 'resolved': True, 'path': source['url'],
        'declared_sha256': source['digest'], 'actual_sha256': actual_digest,
        'hash_matches': actual_digest == source['digest'],
        'declared_size': source['bytes'], 'actual_size': source_path.stat().st_size,
        'external_url': source.get('externalUrl'),
    })

mounts = []
for mount in result['reference_mounts']:
    pairs = []
    for pair in mount['site_pairs']:
        pairs.append({
            'labels': [sites[ref]['label'] for ref in pair['site_refs']],
            'site_refs': pair['site_refs'], 'hole_refs': pair['hole_refs'],
            'axis_distance_m': pair['axis_distance_m'],
            'axis_angle_rad': pair['axis_angle_rad'], 'axial_gap_m': pair['axial_gap_m'],
        })
    mounts.append({
        'id': mount['id'], 'configuration_ref': mount['configuration_ref'],
        'status': mount['status'], 'mechanism': mount['mechanism'],
        'pairs': pairs, 'connector_roles': mount['connector_roles'],
        'assessment': mount['assessment'], 'source_refs': mount['source_refs'],
        'evidence_refs': mount['evidence_refs'], 'assertion_refs': mount['assertion_refs'],
        'unresolved_requirements': mount['unresolved_requirements'],
    })

site_summary = []
for part in result['geometry_context']['parts']:
    part_sites = [s for s in sites.values() if s['owner_ref'] == part['id']]
    functional = [i for i in result['functional_interfaces'] if i['owner_ref'] == part['id']]
    member_refs = {ref for i in functional for ref in i['member_site_refs']}
    site_summary.append({
        'part_ref': part['id'], 'name': part['name'],
        'all_site_records': len(part_sites),
        'status_counts': dict(collections.Counter(s['status'] for s in part_sites)),
        'functional_member_count': len(member_refs),
        'functional_member_labels': [sites[ref]['label'] for ref in sorted(member_refs)],
        'functional_underlying_hole_count': len({sites[ref]['hole_ref'] for ref in member_refs}),
    })

review = {
    'request': {'part_a': result['query']['part_a'], 'part_b': result['query']['part_b']},
    'method': 'Independent forward trial following the skill, shared semantics, doctor and query help; no implementation read or altered.',
    'command_file': 'forward-trial-command.txt',
    'cli_exit_code': int((HERE / 'forward-trial-query-exit-code.txt').read_text().strip()),
    'stderr_bytes': (HERE / 'forward-trial-query-stderr.txt').stat().st_size,
    'result': {k: result[k] for k in ('ok', 'status', 'basis', 'reason', 'execution_performed', 'assessment', 'scope')},
    'package': result['package'],
    'package_integrity': {'files_checked': len(after), 'unchanged': not changed, 'changed_paths': changed,
                          'manifest_digest_matches_result': manifest['package_digest'] == result['package']['package_digest']},
    'lineage': {
        'source_checks': source_checks,
        'evidence_refs_resolved': all(ref in evidence for ref in needed_evidence),
        'evidence_refs': needed_evidence,
        'assertion_refs_resolved': all(ref in assertions for ref in needed_assertions),
        'assertion_refs': needed_assertions,
        'assertion_provenance': knowledge['provenance'],
        'assembly_input_hash_matches_manifest': digest(package / manifest['inputs']['assembly_knowledge']['path']) == manifest['inputs']['assembly_knowledge']['sha256'],
        'frozen_source_revision': 'cb70b792312d559a4da09064d92009079671815f',
    },
    'site_summary': site_summary,
    'reference_mounts': mounts,
    'interpretation_notes': [
        'The 32 mounting_sites records include geometry-only entry sites; only interface membership identifies the 8 declared servo sites and 2 reference leg sites.',
        'Two entry sites sharing one logical hole do not constitute two separate hole resources.',
        'The user statement and its recorded project interpretation establish the functional claim; frozen source geometry supports the reference mapping. This is not manufacturer certification.',
        'Reference_alignment pass is a static reference check. The query enumerates no new configurations and executes no installation.',
        'Actual fastener entities, engagement, retaining contact, occupied ranges, path, elasticity and engineering acceptance remain unresolved.',
    ],
    'can_claim_assembly_completed': False,
    'completion_reason': 'execution_performed is false, both fastener roles are unbound, and mechanical/engineering/task/completion remain unknown.',
    'limitations': result['limitations'],
    'query_artifact': {'path': 'forward-trial-query.json', 'bytes': (HERE / 'forward-trial-query.json').stat().st_size,
                       'sha256': digest(HERE / 'forward-trial-query.json')},
}
(HERE / 'forward-trial-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({
    'review': str(HERE / 'forward-trial-review.json'),
    'cli_exit_code': review['cli_exit_code'], 'package_unchanged': not changed,
    'package_files_checked': len(after), 'source_hashes_match': all(s.get('hash_matches') for s in source_checks),
    'evidence_refs_resolved': review['lineage']['evidence_refs_resolved'],
    'assertion_refs_resolved': review['lineage']['assertion_refs_resolved'],
    'reference_mount_count': len(mounts), 'can_claim_assembly_completed': False,
}, ensure_ascii=True))
