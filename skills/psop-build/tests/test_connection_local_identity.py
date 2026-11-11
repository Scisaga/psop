from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'skills/psop-build/scripts'))
from psop_build_v2 import connection_analysis as analysis


class LocalIdentity(unittest.TestCase):
    def test_endpoint_identity_is_member_and_source_bound_not_pair_or_prose(self):
        p = {'part_ref': 'part:a', 'geometry_sha256': 'source1', 'structure_refs': ['wall:b', 'wall:a'], 'label': '名称'}
        identity = analysis.endpoint_ref(p)
        self.assertEqual(identity, analysis.endpoint_ref({**p, 'label': '改名', 'position_local_m': [3., 4., 5.], 'structure_refs': ['wall:a', 'wall:b']}))
        self.assertNotEqual(identity, analysis.endpoint_ref({**p, 'structure_refs': ['wall:a']}))
        self.assertNotEqual(identity, analysis.endpoint_ref({**p, 'geometry_sha256': 'source2'}))

    def test_pair_index_keeps_all_local_relations_and_competing_explanations(self):
        studies = [{'id': i, 'participants': [{'part_ref': 'a'}, {'part_ref': 'b'}]} for i in ('local-x', 'local-y', 'competing-x')]
        review = {'id': 'review', 'configuration_ref': 'pose1', 'participants': [{'part_ref': 'b'}, {'part_ref': 'a'}]}
        for order in (studies, list(reversed(studies))):
            self.assertEqual([s['id'] for _, s in analysis.review_targets([review], order)], ['competing-x', 'local-x', 'local-y'])
        restricted = deepcopy(studies)
        restricted[0]['configuration_ref'] = 'different-pose'
        self.assertEqual(len(list(analysis.review_targets([review], restricted))), 2)

    def test_revision_classifies_electronics_bom_as_retrieval_and_unlocated_roles_as_unknown(self):
        value = json.loads((ROOT / 'device-materials/interface-review/microduck-connection-sites.json').read_text(encoding='utf8'))
        for study in value['connection_review_studies']:
            for use in study['evidence_uses']:
                if use['usage'] == 'support':
                    self.assertFalse({'SRC-000049', 'SRC-000053', 'SRC-000008', 'SRC-000054'} & set(use['source_refs']))
                self.assertTrue(use['locator'])
            if study['directness'] == 'none':
                self.assertEqual(next(r for r in study['roles'] if r['role'] == 'location')['status'], 'unknown')
                self.assertEqual(study['selected_pairings'], [])
            if study['directness'] == 'indirect':
                self.assertEqual(study['selected_pairings'], [])
                self.assertTrue(study['counterevidence'])
            for participant in study['participants']:
                self.assertEqual(participant['local_endpoint_ref'], analysis.endpoint_ref(participant))

    def test_independent_site_acceptance_rejects_deleted_member_without_deleting_geometry(self):
        fixture = json.loads((Path(__file__).parent / 'fixtures/local-endpoints-v11.json').read_text(encoding='utf8'))
        review = json.loads((ROOT / 'device-materials/interface-review/microduck-connection-sites.json').read_text(encoding='utf8'))
        self.assertEqual(fixture['review']['expected_local_sites'], review['expected_local_sites'])
        result = fixture['analysis']
        self.assertEqual(analysis.local_endpoint_acceptance(result, review), {'expected_count': 8, 'missing': []})
        f = next(f for f in result['connection_review_findings'] if f.get('study_ref') == 'review-926a5beb2c028185')
        p = next(p for p in f['participants'] if p['part_ref'] == 'part:microduck:fa9ee2f71faafb88')
        p['structure_refs'].pop()
        self.assertTrue(analysis.local_endpoint_acceptance(result, review)['missing'])

    def test_claim_evidence_does_not_reuse_unrelated_first_file_assertion(self):
        scene = {'sources': [{'id': 'source'}], 'evidence': [{'id': 'unrelated', 'sourceId': 'source', 'excerpt': 'not this claim', 'lineStart': 99}]}
        uses = [{'usage': 'support', 'claim': 'specific wall geometry', 'source_refs': ['source'], 'locator': 'source triangles 5,6,7'}]
        published = analysis.publish_evidence_uses(uses, 'study', ['a','b'], {'sources': []}, scene)
        self.assertNotIn('unrelated', published[0]['evidence_refs'])
        actual = next(e for e in scene['evidence'] if e['id'] == published[0]['evidence_refs'][0])
        self.assertIn('source triangles 5,6,7', actual['excerpt'])
        self.assertNotIn('lineStart', actual)


if __name__ == '__main__':
    unittest.main()
