"""Negative/positive interface patterns independent of device coordinates."""
from copy import deepcopy
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from psop_build_v2.compatibility import build_candidates


def fixture(points_a,points_b,selection_a=None,selection_b=None):
    catalog={'features':[],'interfaces':[]}
    for owner,points,selection in [('a',points_a,selection_a),('b',points_b,selection_b)]:
        members=[]
        for n,(x,y) in enumerate(points):
            ref=f'{owner}:hole:{n}'
            catalog['features'].append({'id':ref,'owner_ref':owner,'kind':'bore_wall','geometry':{'type':'cylinder','origin':[x,y,0.],
                'axis':[0.,0.,1.],'radius_m':.001,'axial_range_m':[0.,.004]},'evidence_refs':[]})
            members.append({'id':ref+':member','position':[x,y,0.],'direction':[0.,0.,1.],'feature_refs':[ref]})
        catalog['interfaces'].append({'id':owner+':mount','owner_ref':owner,'members':members,'selection':selection or {'kind':'unspecified'},'evidence_refs':[]})
    policy={'schema':'psop.interface-matching-policy/1','statement':'All four rotor holes must match in one pose.','evidence_ref':'user:complete-pattern',
        'default_hole_selection':'all_members','ordinary_contact_is_compatible':False,'required_patterns':[{'interface_ref':'a:mount','selection':'all_members','member_count':len(points_a)}]}
    return [{'id':'a'},{'id':'b'}],catalog,policy


SQUARE=[(-.006,0.),(0.,-.006),(.006,0.),(0.,.006)]


class CompleteInterfaces(unittest.TestCase):
    def build(self,points_a=SQUARE,points_b=SQUARE,**kwargs):
        parts,catalog,policy=fixture(points_a,points_b,**kwargs)
        return build_candidates(parts,catalog,interface_policy=policy)

    def test_all_four_match_under_one_proper_registration(self):
        result=self.build()
        through=next(c for c in result['candidates'] if 'through_fastener' in c['template_ref'])
        for match in through['interface_matches']:
            self.assertEqual(match['member_count'],4)
            self.assertEqual(match['selection_a'],'all_members')
            self.assertEqual(len(match['alignment_options']),8)
            for option in match['alignment_options']:
                self.assertEqual(len({p['member_a_ref'] for p in option['member_pairs']}),4)
                self.assertEqual(len({p['member_b_ref'] for p in option['member_pairs']}),4)
                r=option['registration']['rotation_b_to_a']
                det=r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])-r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0])
                self.assertAlmostEqual(det,1.)
                self.assertLess(option['registration']['maximum_axis_residual_m'],1e-10)

    def test_three_of_four_or_one_close_hole_does_not_make_an_interface(self):
        for points in [SQUARE[:3],[SQUARE[0]],SQUARE[:3]+[(0.,.007)]]:
            result=self.build(points_b=points)
            self.assertEqual(result['candidates'],[])
            self.assertTrue(result['local_geometry_clues'])
            self.assertEqual(result['coverage']['evaluated_unordered_instance_pairs'],1)
            self.assertTrue(result['coverage']['interface_matching_complete'])

    def test_square_and_rectangle_do_not_pass_via_shared_two_hole_distance(self):
        self.assertEqual(self.build(points_a=[(0.,0.),(.01,0.),(.01,.01),(0.,.01)],
                                    points_b=[(0.,0.),(.01,0.),(.01,.02),(0.,.02)])['candidates'],[])

    def test_translation_phase_and_source_world_pose_do_not_limit_candidate_search(self):
        theta=.53
        moved=[(x*math.cos(theta)-y*math.sin(theta)+.3,x*math.sin(theta)+y*math.cos(theta)-.2) for x,y in SQUARE]
        parts,catalog,policy=fixture(SQUARE,moved)
        expected=build_candidates(parts,catalog,interface_policy=policy)
        self.assertTrue(expected['candidates'])
        for part in parts:part.update(position=[87.,-63.,12.],quaternion=[.5,.5,.5,.5])
        catalog['connections']=[{'basis':'incompatible','endpoints':[]}]
        self.assertEqual(expected,build_candidates(parts,catalog,interface_policy=policy))

    def test_declared_adjacent_pairs_remain_valid_and_diagonals_are_not_synthesized(self):
        points=[(0.,0.),(.01,0.),(.01,.01),(0.,.01)]
        parts,catalog,policy=fixture(points,points[:2],{'kind':'adjacent_pair','allowed_pairs':[['a:hole:0:member','a:hole:1:member']]})
        policy['required_patterns']=[]
        result=build_candidates(parts,catalog,interface_policy=policy)
        self.assertTrue(result['candidates'])
        for candidate in result['candidates']:
            for match in candidate['interface_matches']:
                self.assertEqual(match['member_count'],2)
                self.assertEqual({p['member_a_ref'] for p in match['member_pairs']},{'a:hole:0:member','a:hole:1:member'})
        catalog['interfaces'][1]['members'][1]['position']=[.01,.01,0.]
        catalog['features'][-1]['geometry']['origin']=[.01,.01,0.]
        self.assertEqual(build_candidates(parts,catalog,interface_policy=policy)['candidates'],[])

    def test_two_ends_or_two_interfaces_cannot_supply_missing_members(self):
        parts,catalog,policy=fixture(SQUARE,SQUARE)
        full=catalog['interfaces'].pop()
        for n,members in enumerate([full['members'][:2],full['members'][2:]]):
            other=deepcopy(full);other['id']+=f':side:{n}';other['members']=members;catalog['interfaces'].append(other)
        self.assertEqual(build_candidates(parts,catalog,interface_policy=policy)['candidates'],[])

    def test_required_member_deletion_fails_and_a_single_bore_is_not_a_fastener_mount(self):
        parts,catalog,policy=fixture(SQUARE,SQUARE)
        catalog['interfaces'][0]['members'].pop()
        with self.assertRaisesRegex(ValueError,'Required complete pattern'):
            build_candidates(parts,catalog,interface_policy=policy)
        self.assertEqual(self.build(points_a=SQUARE[:1],points_b=SQUARE[:1])['candidates'],[])

    def test_nominal_radial_fit_is_retained_but_large_unlocated_clearance_is_not(self):
        parts,catalog,policy=fixture(SQUARE[:1],SQUARE[:1]);policy['required_patterns']=[]
        catalog['features'][0]['kind']='shaft_wall'
        self.assertTrue(build_candidates(parts,catalog,interface_policy=policy)['candidates'])
        catalog['features'][1]['geometry']['radius_m']=.01
        result=build_candidates(parts,catalog,interface_policy=policy)
        self.assertFalse(result['candidates']);self.assertTrue(result['local_geometry_clues'])

    def test_legacy_local_geometry_contract_stays_available_without_new_policy(self):
        parts,catalog,policy=fixture(SQUARE,SQUARE[:1])
        self.assertTrue(build_candidates(parts,catalog)['candidates'])
        self.assertFalse(build_candidates(parts,catalog,interface_policy=policy)['candidates'])


if __name__=='__main__':unittest.main()
