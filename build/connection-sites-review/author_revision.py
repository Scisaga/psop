"""Versioned evidence-use revision; finite source results are retained verbatim.

This authoring step is outside deterministic Build. It rechecks the independently
selected source sections, then classifies the existing research's actual uses.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'skills/psop-build/scripts'))
sys.path.insert(0, str(ROOT / 'device-materials/interface-review'))
from psop_build_v2.connection_analysis import endpoint_ref, local_pairings
from review_connection_sources import run


def author():
    _, _, source_checks = run()
    here = ROOT / 'device-materials/interface-review'
    original = here / 'microduck-connection-analysis.json'
    value = json.loads(original.read_text(encoding='utf8'))
    scene = json.loads((ROOT / 'build/microduck/source-1.11/microduck-connection-analysis.dkp/indexes/scene.json').read_text(encoding='utf8'))
    candidates = {c['id']: c for c in scene['analysis']['structure_candidates']}
    parts = {p['id']: p for p in scene['parts']}
    value['schema'] = 'psop.interface-investigation/1.3'
    value['revision'] = 'local-endpoints-evidence-uses.1'
    value['parent_investigation_sha256'] = hashlib.sha256(original.read_bytes()).hexdigest()
    value['evidence_revisions'] = {}
    # Acceptance selections come from the independent raw-section fixture,
    # not from the producer's generated site list or coverage counts.
    value['expected_local_sites'] = []
    for hip, studies in [
        ('part:microduck:fa9ee2f71faafb88', ['review-926a5beb2c028185','review-e42fab2d8700637e','review-c2e8a8093a4b8563','review-27d56794bd7c8a86']),
        ('part:microduck:c7eeeac0a640d191', ['review-bdf54f836e5af91a','review-51d1c3b9f9c96dde','review-3a42fc267d7917bb','review-aa00aab586e98383']),
    ]:
        fixture = [
            ('X-four', 'bore_wall', [1,0,0], .0024, [[.038975,0,-.006],[.038975,-.006,0],[.038975,.006,0],[.038975,0,.006]]),
            ('Y-four', 'bore_wall', [0,1,0], .0024, [[.0235,-.018025,0],[.0175,-.018025,-.006],[.0175,-.018025,.006],[.0115,-.018025,0]]),
            ('X-journal', 'shaft_wall', [1,0,0], .016, [[.039475,0,0]]),
            ('Y-journal', 'shaft_wall', [0,1,0], .016, [[.0175,-.017525,0]]),
        ]
        for study_id, (label, kind, axis, diameter, centers) in zip(studies, fixture):
            value['expected_local_sites'].append({'id': hip + ':' + label, 'study_ref': study_id, 'part_ref': hip,
                'geometry_sha256': next(s['digest'] for s in scene['sources'] if s['id'] == parts[hip]['sourceIds'][-1]),
                'kind': kind, 'axis_local': axis, 'diameter_m': diameter, 'member_centers_local_m': centers, 'tolerance_m': .000002,
                'basis': 'Independent closed source sections and outward journal winding; see source-checks.json and review_connection_sources.py.'})
    for study in value['relation_studies']:
        if study['outcome'] == 'supported_hypothesis':
            value['evidence_revisions']['installation-hypothesis:' + study['id']] = {
                'counterevidence': [], 'missing_evidence': study['counterevidence']}
    for study in value['connection_review_studies']:
        refs = [p['part_ref'] for p in study['participants']]
        reviews = [r for r in scene['analysis']['connection_reviews']
                   if {p['part_ref'] for p in r['participants']} == set(refs)
                   and (not study.get('review_ref') or r['id'] == study['review_ref'])
                   and (not study.get('configuration_ref') or r['configuration_ref'] == study['configuration_ref'])]
        if len(reviews) != 1:
            raise ValueError('Specify review_ref and configuration_ref for ambiguous study ' + study['id'])
        review = reviews[0]
        study['review_ref'] = review['id']
        study['configuration_ref'] = review['configuration_ref']
        for participant in study['participants']:
            participant['local_endpoint_ref'] = endpoint_ref(participant)
        mechanism = study['mechanism_candidates'][0]['kind']
        study['directness'] = 'indirect' if mechanism == 'indirect_bearing_support' else 'none' if mechanism == 'indirect_mechanism_context' else 'direct'
        own_refs = {p['part_ref']: set(p['structure_refs']) for p in study['participants']}
        pairs = local_pairings(refs, candidates, parts)
        chosen = [p for p in pairs if all(any(r in own_refs[ref] for r in p['structure_refs']) for ref in refs)]
        study['selected_pairings'] = [p['structure_refs'] for p in chosen] if study['directness'] == 'direct' else []
        study['excluded_pairings'] = [p['structure_refs'] for p in chosen] if study['directness'] == 'indirect' else []
        if study['directness'] == 'none':
            next(r for r in study['roles'] if r['role'] == 'location')['status'] = 'unknown'
        # Missing modeled threads, exact fits and retaining documents are gaps.
        # Only the measured incompatible shaft/bore is a contradictory result.
        previous = study['counterevidence']
        if study['directness'] != 'indirect':
            study['counterevidence'] = []
            study['missing_evidence'] = list(dict.fromkeys(study['missing_evidence'] + previous))
        uses = []
        for participant in study['participants']:
            cs = [candidates[r] for r in participant['structure_refs']]
            triangles = sorted({i for c in cs for i in c['support_triangle_indices']})
            source_id = parts[participant['part_ref']]['sourceIds'][-1]
            uses.append({'usage': 'support' if study['directness'] == 'direct' else 'counterevidence' if study['directness'] == 'indirect' else 'retrieval',
                'claim': ('有限源几何支持本次局部成员、尺寸与共同构型比较；不证明保持。' if study['directness'] == 'direct' else '本次有限范围与尺寸比较不支持所述两件直接径向配合。' if study['directness'] == 'indirect' else '已检查的具体源区域；没有建立直接互补结构。'),
                'source_refs': [source_id], 'locator': 'Part ' + participant['part_ref'] + '; STL source triangle indices: ' + ','.join(map(str, triangles))})
        if study['outcome'] == 'supported_hypothesis':
            uses.append({'usage': 'support', 'claim': '厂商通用图支持穿板螺钉进入接收结构的机制，不证明 Microduck 实际选孔数量、螺纹、长度或活动区。',
                'source_refs': ['SRC-MD-XL330-ASSEMBLY-DRAWING', 'SRC-MD-XL330-HORN-SCREW'], 'locator': 'ROBOTIS 图中的 front/back frame 螺钉与 idler/horn 分体装配示意'})
        uses.append({'usage': 'retrieval', 'claim': '查阅版本说明、材料说明、HAT 说明与板级 BOM，未取得本机械关系的紧固件、保持或活动区依据。',
            'source_refs': ['SRC-000008','SRC-000055','SRC-000054','SRC-000049','SRC-000053'], 'locator': '完整文件检索记录；板级 BOM 未包含所需机械装配声明'})
        study['evidence_uses'] = uses
    for expected in value['expected_review_findings']:
        studies = [s for s in value['connection_review_studies']
                   if {p['part_ref'] for p in s['participants']} == set(expected['part_refs'])
                   and (not expected.get('study_ref') or s['id'] == expected['study_ref'])]
        if len(studies) != 1:
            raise ValueError('Acceptance must specify study_ref when a Part pair has multiple studies')
        study = studies[0]
        expected['study_ref'] = study['id']
    destination = here / 'microduck-connection-sites.json'
    destination.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    (ROOT / 'build/connection-sites-review/source-checks.json').write_text(json.dumps(source_checks, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    print(json.dumps({'input': str(destination), 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'studies': len(value['connection_review_studies']), 'source_checks': source_checks}, ensure_ascii=False)[:1600])


if __name__ == '__main__':
    author()
