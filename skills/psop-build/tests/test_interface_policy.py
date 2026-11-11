"""Independent interface examples for policy/2 and original-fit recovery."""
from copy import deepcopy
import unittest

from psop_build_v2.compatibility import build_candidates
from psop_build_v2.interface_placement import placements
from psop_build_v2.interface_policy import validate_evidence
from psop_build_v2.interface_review import review_interfaces
from test_complete_interfaces import fixture, SQUARE


def modern(points_a=SQUARE, points_b=SQUARE):
    parts, catalog, policy = fixture(points_a, points_b)
    policy['schema'] = 'psop.interface-matching-policy/2'
    return parts, catalog, policy


def subset(interface_ref, member_refs):
    return {'interface_ref': interface_ref, 'allowed_member_sets': [member_refs],
            'statement': 'The specified mounting group excludes the two spare holes.', 'evidence_ref': 'source:mounting-group'}


def clearance(interface_ref, low=0., high=.0001):
    return {'interface_ref': interface_ref, 'mechanisms': ['cylindrical_insertion'],
            'fit_kind': 'partial_radial_support', 'radial_clearance_m': [low, high],
            'statement': 'A finite partial cradle has a documented nominal radial clearance.', 'evidence_ref': 'source:cradle'}


def binding(catalog, basis='source_fit'):
    return {'id': 'original-fit', 'basis': basis, 'evidence_refs': ['source:original'],
            'endpoints': [{'interface_ref': i['id'], 'member_refs': []} for i in catalog['interfaces'][:2]]}


class InterfacePolicy(unittest.TestCase):
    def test_four_holes_use_documented_subgroup_without_requiring_unused_spares(self):
        parts, catalog, policy = modern(points_b=SQUARE+[(.02, .02), (.03, .03)])
        self.assertFalse(build_candidates(parts, catalog, interface_policy=policy)['candidates'])
        selected = [m['id'] for m in catalog['interfaces'][1]['members'][:4]]
        policy['member_selections'] = [subset('b:mount', selected)]
        result = build_candidates(parts, catalog, interface_policy=policy)
        self.assertTrue(result['candidates'])
        for candidate in result['candidates']:
            for match in candidate['interface_matches']:
                self.assertEqual(match['member_count'], 4)
                self.assertEqual(match['source_member_count_b'], 6)
                self.assertEqual(match['selection_b'], 'declared_member_set')
                for option in match['alignment_options']:
                    self.assertEqual({p['member_b_ref'] for p in option['member_pairs']}, set(selected))

    def test_subset_cannot_reduce_required_rotor_or_borrow_another_interface(self):
        for members in [['a:hole:0:member', 'a:hole:1:member'], ['a:hole:0:member', 'b:hole:1:member']]:
            parts, catalog, policy = modern()
            policy['member_selections'] = [subset('a:mount', members)]
            with self.subTest(members=members), self.assertRaisesRegex(ValueError, 'required complete pattern|unique, owned'):
                build_candidates(parts, catalog, interface_policy=policy)

    def test_clearance_is_interface_specific_and_does_not_relax_all_fits(self):
        parts, catalog, policy = modern(SQUARE[:1], SQUARE[:1])
        policy['required_patterns'] = []
        catalog['features'][0]['kind'] = 'shaft_wall'
        catalog['features'][0]['geometry']['radius_m'] = .011
        catalog['features'][1]['geometry']['radius_m'] = .0111
        self.assertFalse(build_candidates(parts, catalog, interface_policy=policy)['candidates'])
        policy['radial_fit_rules'] = [clearance('b:mount')]
        result = build_candidates(parts, catalog, interface_policy=policy)
        self.assertTrue(result['candidates'])
        for candidate in result['candidates']:
            self.assertIn('partial_support_contact_and_encirclement_unverified', candidate['unresolved_conditions'])
            for match in candidate['interface_matches']:
                fit = match['member_pairs'][0]['radial_fit']
                self.assertAlmostEqual(fit['radial_clearance_m'][0], .0001)
                self.assertEqual(fit['rule_interface_refs'], ['b:mount'])
        catalog['features'][1]['geometry']['radius_m'] = .012
        self.assertFalse(build_candidates(parts, catalog, interface_policy=policy)['candidates'])

    def test_both_interfaces_clearance_requirements_apply(self):
        parts, catalog, policy = modern(SQUARE[:1], SQUARE[:1])
        policy['required_patterns'] = []
        catalog['features'][0]['kind'] = 'shaft_wall'
        catalog['features'][1]['geometry']['radius_m'] += .0001
        policy['radial_fit_rules'] = [clearance('a:mount', high=.00001), clearance('b:mount')]
        self.assertFalse(build_candidates(parts, catalog, interface_policy=policy)['candidates'])

    def test_geometric_hypothesis_needs_functional_evidence_and_finite_witnesses(self):
        parts, catalog, policy = modern()
        hypothesis = catalog['interfaces'][1]
        hypothesis['capability_basis'] = 'geometry_hypothesis'
        self.assertFalse(build_candidates(parts, catalog, interface_policy=policy)['candidates'])
        rule = {'interface_ref': 'b:mount', 'member_refs': [m['id'] for m in hypothesis['members']],
                'purpose': 'Four-hole mounting face', 'basis': 'engineering_inference',
                'mechanisms': ['through_fastener'], 'statement': 'Independent mounting-face and hole-pattern review.',
                'evidence_refs': ['source:mounting-face']}
        policy['interface_qualifications'] = [rule]
        with self.assertRaisesRegex(ValueError, 'finite source witnesses'):
            build_candidates(parts, catalog, interface_policy=policy)
        for feature in catalog['features']:
            feature['geometry']['triangle_indices'] = [0, 1]
        before = deepcopy(catalog)
        result = build_candidates(parts, catalog, interface_policy=policy)
        self.assertEqual(catalog, before)
        self.assertEqual(len(result['candidates']), 1)
        self.assertIn('through_fastener', result['candidates'][0]['template_ref'])
        review = result['coverage']['interface_analysis']
        self.assertEqual(review['unqualified_geometry_hypothesis_count'], 0)
        self.assertEqual(review['interfaces'][1]['qualification'], 'evidence_qualified_geometry')
        rule['member_refs'].pop()
        with self.assertRaisesRegex(ValueError, 'every hypothesis member'):
            build_candidates(parts, catalog, interface_policy=policy)

    def test_policy_cannot_cite_nonexistent_evidence(self):
        _, _, policy = modern()
        policy['radial_fit_rules'] = [clearance('b:mount')]
        with self.assertRaisesRegex(ValueError, 'absent evidence'):
            validate_evidence(policy, [policy['evidence_ref']])
        validate_evidence(policy, [policy['evidence_ref'], 'source:cradle'])

    def test_both_finite_wall_segments_survive_until_seating(self):
        parts, catalog, policy = modern(SQUARE[:1], SQUARE[:1])
        policy['required_patterns'] = []
        catalog['features'][0]['kind'] = 'shaft_wall'
        first = catalog['features'][1]
        first['geometry']['axial_range_m'] = [.1, .104]
        other = deepcopy(first)
        other['id'] = 'b:z-later-step'
        other['geometry']['axial_range_m'] = [.2, .208]
        catalog['features'].append(other)
        catalog['interfaces'][1]['members'][0]['feature_refs'].append(other['id'])
        result = build_candidates(parts, catalog, interface_policy=policy)
        features = {f['id']: f for f in catalog['features']}
        candidate = result['candidates'][0]
        option = candidate['interface_matches'][0]['alignment_options'][0]
        self.assertEqual(len(option['member_pair_options'][0]), 2)
        seated = list(placements(option, features, 'cylindrical_insertion'))
        self.assertEqual({o['member_pairs'][0]['feature_b_ref'] for o in seated}, {first['id'], other['id']})
        self.assertGreater(len({tuple(o['registration']['translation_b_to_a']) for o in seated}), 1)


class OriginalCompatibilityReview(unittest.TestCase):
    def test_new_coverage_cannot_be_tampered_or_recounted_during_freeze(self):
        from test_capability_package import FrozenCapabilities
        from psop_build_v2.capability_package import _prepare_details, _validate_prepared, _read, _write, ENTRYPOINTS
        source = FrozenCapabilities()
        source.setUp()
        self.addCleanup(source.tearDown)
        _, _, policy = modern()
        policy['required_patterns'] = []
        policy['reference_review_schema'] = 'psop.interface-analysis-review/2'
        scene = source.scene
        scene['evidence'] = [{'id': policy['evidence_ref']}]
        authored = {'catalog': {k: v for k, v in scene['assembly'].items() if k != 'capability_index'},
                    'provenance': {'compatibility_interface_policy': policy}}
        _write(source.root/'sources/SRC-MD-ASSEMBLY-CATALOG.json', authored)
        result = build_candidates(scene['parts'], source.catalog, interface_policy=policy)
        report = _read(source.root/ENTRYPOINTS['coverage'])['geometry']
        _prepare_details(scene, source.catalog, result, source.root, source.requirements, report)
        _validate_prepared(source.root)
        coverage = _read(source.root/ENTRYPOINTS['coverage'])
        self.assertEqual(coverage['candidate_coverage']['interface_analysis']['schema'], 'psop.interface-analysis-review/2')
        coverage['candidate_coverage']['interface_analysis']['reference_followup_count'] = 999
        _write(source.root/ENTRYPOINTS['coverage'], coverage)
        with self.assertRaisesRegex(ValueError, 'full template coverage differs'):
            _validate_prepared(source.root)

    def test_owner_pair_alone_cannot_recover_a_different_original_interface(self):
        parts, catalog, policy = modern()
        result = build_candidates(parts, catalog, interface_policy=policy)
        extra = deepcopy(catalog['interfaces'][0])
        extra['id'] = 'a:another-mount'
        catalog['interfaces'].append(extra)
        connection = binding(catalog)
        connection['endpoints'][0]['interface_ref'] = extra['id']
        catalog['reference_connections'] = [connection]
        review = review_interfaces(catalog, result, policy)
        self.assertEqual(review['supported_reference_count'], 1)
        self.assertEqual(review['recovered_supported_reference_count'], 0)
        self.assertTrue(review['reference_connections'][0]['followup_required'])

    def test_original_selected_members_must_be_recovered(self):
        parts, catalog, policy = modern(points_b=SQUARE+[(.02, .02), (.03, .03)])
        policy['member_selections'] = [subset('b:mount', [m['id'] for m in catalog['interfaces'][1]['members'][:4]])]
        catalog['reference_connections'] = [binding(catalog)]
        result = build_candidates(parts, catalog, interface_policy=policy)
        self.assertEqual(result['coverage']['interface_analysis']['recovered_supported_reference_count'], 1)
        catalog['reference_connections'][0]['endpoints'][1]['member_refs'] = ['b:hole:4:member']
        review = review_interfaces(catalog, result, policy)
        self.assertEqual(review['reference_connections'][0]['compatibility_status'], 'different_member_selection')
        self.assertEqual(review['reference_followup_count'], 1)

    def test_unhandled_planes_are_visible_and_cannot_claim_full_interface_matching(self):
        parts, catalog, policy = modern()
        extra = deepcopy(catalog['features'][0])
        extra.update(id='a:stop', kind='planar_patch', geometry={'type': 'plane', 'origin': [0., 0., 0.], 'normal': [0., 0., 1.]})
        catalog['features'].append(extra)
        member = deepcopy(catalog['interfaces'][0]['members'][0])
        member.update(id='a:stop:member', feature_refs=[extra['id']])
        catalog['interfaces'][0]['members'].append(member)
        policy['required_patterns'] = []
        result = build_candidates(parts, catalog, interface_policy=policy)
        self.assertTrue(result['coverage']['interface_pattern_search_complete'])
        self.assertFalse(result['coverage']['interface_matching_complete'])
        row = result['coverage']['interface_analysis']['interfaces'][0]
        self.assertEqual(row['support_status'], 'radial_constraints_only')
        self.assertIn(member['id'], row['additional_constraint_member_refs'])

    def test_reference_hypothesis_or_source_exclusion_is_not_confirmed_by_new_pose(self):
        parts, catalog, policy = modern()
        catalog['reference_connections'] = [binding(catalog, 'hypothesis')]
        result = build_candidates(parts, catalog, interface_policy=policy)
        review = result['coverage']['interface_analysis']
        self.assertEqual(review['supported_reference_count'], 0)
        self.assertEqual(review['reference_connections'][0]['reference_status'], 'reference_hypothesis')
        catalog['reference_connections'][0]['basis'] = 'incompatible'
        review = review_interfaces(catalog, result, policy)
        self.assertEqual(review['reference_connections'][0]['reference_status'], 'source_configuration_exclusion')
        self.assertFalse(review['reference_connections'][0]['followup_required'])


if __name__ == '__main__':
    unittest.main()
