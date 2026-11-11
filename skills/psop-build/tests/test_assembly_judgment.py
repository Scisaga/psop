"""Policy /3 retains observed contact while preserving complete-member and dimensional constraints."""
from copy import deepcopy
from pathlib import Path
import unittest
from unittest.mock import patch

from test_interface_policy import modern, clearance
from test_complete_interfaces import SQUARE
from psop_build_v2.compatibility import build_candidates
from psop_build_v2.interface_placement import qualify_placements
from psop_build_v2.solid_boolean import assess

POLICY={'schema':'psop.assembly-policy/1','version':1,'minor_contact_volume_mm3':.01,'unrelated_obstacle_depth_m':.0001}

class AssemblyJudgment(unittest.TestCase):
    def test_v3_keeps_complete_pose_options_with_unchanged_interference_observations(self):
        parts,catalog,policy=modern()
        policy['schema']='psop.interface-matching-policy/3'
        result=build_candidates(parts,catalog,interface_policy=policy)
        policy['whole_part_interference']={'schema':'psop.fixed-interface-placement-policy/2','method':'closed-source-solid-interference/2',
            'seating_method':'finite-interface-boundary-planes/1','clear_fixed_pose_required':False,'numerical_contact_allowance_m':3e-7,
            'statement':'User-authorized design fidelity policy','evidence_ref':'user:policy','assembly_policy':POLICY}
        for status,volume in [('interference',.00305),('interference',67.9),('unresolved',0)]:
            observation={'method':'closed-source-solid-interference/2','status':status,'intersection_volume_m3':volume/1e9}
            with patch('psop_build_v2.interface_placement.MeshInterference.evaluate',return_value=observation):
                qualified=qualify_placements(deepcopy(result),catalog,policy,parts,Path('.'))
            self.assertTrue(qualified['candidates'])
            for candidate in qualified['candidates']:
                for match in candidate['interface_matches']:
                    self.assertEqual(match['member_count'],4)
                    for option in match['alignment_options']:
                        self.assertEqual(option['interference'],observation)
                        self.assertEqual(option['assembly_assessment']['decision'],'allow_with_note')
                        self.assertEqual(option['mechanics']['status'],'not_evaluated')

    def test_declared_interference_fit_accepts_negative_clearance_without_relaxing_wrong_diameters(self):
        parts,catalog,policy=modern(SQUARE[:1],SQUARE[:1]);policy['required_patterns']=[]
        policy['schema']='psop.interface-matching-policy/3'
        catalog['features'][0]['kind']='shaft_wall'
        catalog['features'][0]['geometry']['radius_m']=.00502
        catalog['features'][1]['geometry']['radius_m']=.005
        rule=clearance('b:mount',-.00003,0);rule['fit_kind']='interference_fit';policy['radial_fit_rules']=[rule]
        self.assertTrue(build_candidates(parts,catalog,interface_policy=policy)['candidates'])
        catalog['features'][0]['geometry']['radius_m']=.008
        self.assertFalse(build_candidates(parts,catalog,interface_policy=policy)['candidates'])
        policy['schema']='psop.interface-matching-policy/2'
        with self.assertRaises(ValueError):build_candidates(parts,catalog,interface_policy=policy)

    def test_build_uses_shared_js_policy_and_never_fabricates_geometry_pass(self):
        observation={'status':'unresolved','reason':'source_is_not_closed_oriented_manifold'}
        result=assess(observation,POLICY,'flexible_fit')
        self.assertEqual(result['decision'],'allow_with_note');self.assertEqual(result['mechanics']['status'],'not_evaluated')
        self.assertEqual(observation['status'],'unresolved')
