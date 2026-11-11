"""Independent solid fixtures: holes alone cannot establish compatibility."""
from copy import deepcopy
import hashlib
import gzip
import json
import math
import random
from pathlib import Path
import unittest

from psop_build_v2.mesh_interference import SolidMesh,check_interference,EPSILON_M,MeshInterference
from psop_build_v2.interface_placement import placements
from psop_build_v2.solid_boolean import evaluate as boolean_evaluate


def box(low=(0.,0.,0.),high=(.01,.01,.01)):
    x,y,z=low;a,b,c=high
    v=[(x,y,z),(a,y,z),(a,b,z),(x,b,z),(x,y,c),(a,y,c),(a,b,c),(x,b,c)]
    f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
    return SolidMesh(v,f)


def combine(*meshes):
    vertices=[];faces=[]
    for m in meshes:
        faces.extend([[i+len(vertices) for i in f] for f in m.faces]);vertices.extend(m.vertices)
    return SolidMesh(vertices,faces)


def selected_source_package(repo):
    registry=json.loads((repo/'workspaces/registry.json').read_text(encoding='utf8'))
    workspace=next(w for w in registry['workspaces'] if w['id']=='microduck')
    snapshot=next(s for s in workspace['snapshots'] if s['id']==workspace['selectedSnapshotId'])
    return (repo/'workspaces'/snapshot['path']).resolve()


class SolidInterferenceTest(unittest.TestCase):
    def test_disjoint_bounds_and_opposed_face_edge_point_contacts_are_clear(self):
        a=box()
        for t in [(.02,0.,0.),(.01,0.,0.),(.01,.01,0.),(.01,.01,.01)]:
            with self.subTest(t=t):self.assertEqual(check_interference(a,box(),t)['status'],'clear')

    def test_large_aligned_overlap_and_coincident_solids_are_rejected(self):
        a=box()
        for t in [(.003,0.,0.),(.003,.002,0.),(0.,0.,0.),(-.004,.002,.001)]:
            with self.subTest(t=t):self.assertEqual(check_interference(a,box(),t)['status'],'interference')

    def test_transverse_rotated_overlap_is_rejected(self):
        theta=.31;r=((math.cos(theta),-math.sin(theta),0),(math.sin(theta),math.cos(theta),0),(0,0,1))
        result=check_interference(box(),box().rotated(r),(.003,.001,.002))
        self.assertEqual(result['status'],'interference')
        self.assertEqual(result['witness']['kind'],'transverse_source_surfaces')

    def test_containment_without_any_surface_crossing_is_rejected(self):
        outer=box();inner=box((.002,.002,.002),(.004,.004,.004))
        for a,b in [(outer,inner),(inner,outer)]:
            result=check_interference(a,b);self.assertEqual(result['status'],'interference')
            self.assertEqual(result['witness']['kind'],'contained_source_material')

    def test_bounding_box_overlap_does_not_reject_disconnected_solids_or_cavities(self):
        a=combine(box(),box((.02,0.,0.),(.03,.01,.01)))
        self.assertEqual(check_interference(a,box((.012,.002,.002),(.018,.008,.008)))['status'],'clear')
        outer=box();cavity=box((.002,.002,.002),(.008,.008,.008));cavity=SolidMesh(cavity.vertices,[f[::-1] for f in cavity.faces]);hollow=combine(outer,cavity)
        self.assertEqual(check_interference(hollow,box((.003,.003,.003),(.007,.007,.007)))['status'],'clear')
        self.assertEqual(check_interference(hollow,box((.001,.003,.003),(.004,.007,.007)))['status'],'interference')

    def test_closed_component_hidden_inside_another_is_checked(self):
        a=combine(box((.03,0.,0.),(.04,.01,.01)),box((.002,.002,.002),(.004,.004,.004)))
        self.assertEqual(check_interference(a,box())['status'],'interference')

    def test_open_and_inconsistently_oriented_input_cannot_pass(self):
        a=box()
        for f in [a.faces[:-1],[a.faces[0][::-1]]+a.faces[1:]]:
            self.assertEqual(check_interference(a,SolidMesh(a.vertices,f),(.05,0,0))['status'],'unresolved')

    def test_numerical_contact_allowance_does_not_hide_physical_overlap(self):
        a=box()
        self.assertEqual(check_interference(a,box(),(.01+EPSILON_M/2,0,0))['status'],'clear')
        self.assertEqual(check_interference(a,box(),(.01-1e-4,0,0))['status'],'interference')

    def test_random_oriented_boxes_agree_with_independent_separating_axes(self):
        rng=random.Random(17691);a=box((-.005,-.005,-.005),(.005,.005,.005));identity=[(1,0,0),(0,1,0),(0,0,1)]
        native={'sha256':hashlib.sha256(json.dumps([a.vertices,a.faces]).encode()).hexdigest(),'vertices':a.vertices,'faces':a.faces}
        def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
        def dot(a,b):return sum(x*y for x,y in zip(a,b))
        for _ in range(200):
            z,x,y=[rng.uniform(-math.pi,math.pi) for _ in range(3)]
            cz,sz,cx,sx,cy,sy=math.cos(z),math.sin(z),math.cos(x),math.sin(x),math.cos(y),math.sin(y)
            r=((cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx),(sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx),(-sy,cy*sx,cy*cx))
            b=a.rotated(r);t=tuple(rng.uniform(-.014,.014) for _ in range(3));bv=[tuple(v[k]+t[k] for k in range(3)) for v in b.vertices]
            axes=identity+list(zip(*r))+[cross(i,j) for i in identity for j in zip(*r)]
            expected=True
            for axis in axes:
                n=math.sqrt(dot(axis,axis))
                if n<1e-10:continue
                av=[dot(v,axis)/n for v in a.vertices];bb=[dot(v,axis)/n for v in bv]
                if min(max(av),max(bb))-max(min(av),min(bb))<=0:expected=False;break
            self.assertEqual(check_interference(a,b,t)['status'],'interference' if expected else 'clear')
            self.assertEqual(boolean_evaluate(native,native,r,t)['status'],'interference' if expected else 'clear')

    def test_source_edge_coincidences_cannot_hide_whole_solid_overlap(self):
        repo=Path(__file__).resolve().parents[3];root=selected_source_package(repo)
        fixture=json.loads((repo/'device-materials/assembly/tests/fixtures/solid-interference-cases.json').read_text())
        scene=json.loads((root/'indexes/scene.json').read_text(encoding='utf8'));context=MeshInterference(scene['parts'],root)
        for case in fixture['cases']:
            result=context.evaluate(*case['owner_refs'],case['rotation_b_to_a'],case['translation_b_to_a'])
            self.assertEqual(result['status'],'interference')
            self.assertGreater(result['intersection_volume_m3'],8e-9)

    def test_curved_bearing_precision_contacts_are_not_false_body_collisions(self):
        repo=Path(__file__).resolve().parents[3];root=selected_source_package(repo)
        fixture=json.loads((repo/'device-materials/assembly/tests/fixtures/solid-interference-cases.json').read_text())
        scene=json.loads((root/'indexes/scene.json').read_text(encoding='utf8'));context=MeshInterference(scene['parts'],root)
        for case in fixture['numerical_contacts']:
            result=context.evaluate(*case['owner_refs'],case['rotation_b_to_a'],case['translation_b_to_a'])
            self.assertEqual(result['status'],'clear')
            self.assertLess(result['intersection_volume_m3'],1e-13)
            self.assertEqual(result['precision_ball_radius_m'],EPSILON_M/2)

    def test_actual_leg_housing_match_is_rejected_and_rotor_has_clear_seats(self):
        root=Path(__file__).resolve().parents[3]/'build/microduck/source-1.15/microduck-capabilities-9.dkp'
        if not root.exists():self.skipTest('Published source regression fixture unavailable')
        scene=json.loads((root/'indexes/scene.json').read_text(encoding='utf8'));index=json.loads((root/'indexes/capabilities.json').read_text())
        detail=json.loads(gzip.decompress((root/'details/pairs/4b913c61038bb4bd5b37.json.gz').read_bytes()));features={}
        for owner in detail['owner_refs']:
            part=json.loads(gzip.decompress((root/index['parts'][owner]['path']).read_bytes()));features.update({f['id']:f for f in part['features']})
        context=MeshInterference(scene['parts'],root);before=deepcopy(detail)
        if detail.get('placement_exclusions') is not None:
            for candidate in detail['candidates']:
                self.assertTrue(candidate['interface_matches'])
                for match in candidate['interface_matches']:
                    self.assertEqual(match['member_count'],4)
                    for option in match['alignment_options']:
                        reg=option['registration'];self.assertEqual(context.evaluate(*detail['owner_refs'],reg['rotation_b_to_a'],reg['translation_b_to_a'])['status'],'clear')
            rejected=[e for e in detail['placement_exclusions'] if 'housing' in e['interface_a_ref']]
            self.assertTrue(rejected)
            for entry in rejected:
                for option in entry['alignment_options']:
                    reg=option['registration'];self.assertEqual(context.evaluate(*detail['owner_refs'],reg['rotation_b_to_a'],reg['translation_b_to_a'])['status'],'interference')
            self.assertEqual(detail,before)
            return
        for match in detail['candidates'][0]['interface_matches']:
            states=[]
            for source in match['alignment_options']:
                for option in placements(source,features,'screw_reception'):
                    r=option['registration'];states.append(context.evaluate(*detail['owner_refs'],r['rotation_b_to_a'],r['translation_b_to_a'])['status'])
                    self.assertEqual(option['seating']['display_gap_m'],0.)
            if 'housing' in match['interface_a_ref']:self.assertTrue(states);self.assertEqual(set(states),{'interference'})
            else:self.assertIn('clear',states);self.assertIn('interference',states)
        self.assertEqual(detail,before)


if __name__=='__main__':unittest.main()
