from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

from psop_build_v2.reference_alignment import reconcile, summary, _minimum_translation, INPUT_PATH, REPORT_PATH
from psop_build_v2.capability_package import _validate_prepared


class ReferenceRepair(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root/'sources').mkdir()
        (self.root/'indexes').mkdir()
        points = [(-.01, -.01, 0), (.01, -.01, 0), (.01, .01, 0), (-.01, .01, 0)]
        def mesh(reverse):
            ts = [(0, 1, 2), (0, 2, 3)]
            if reverse: ts = [tuple(reversed(t)) for t in ts]
            return bytes(80)+struct.pack('<I', 2)+b''.join(struct.pack('<12fH', 0, 0, -1 if reverse else 1,
                *(v for i in tri for v in points[i]), 0) for tri in ts)
        sources = []
        for sid, reverse in [('anchor', True), ('seat', False)]:
            raw = mesh(reverse);(self.root/'sources'/f'{sid}.stl').write_bytes(raw)
            sources.append({'id':sid,'digest':hashlib.sha256(raw).hexdigest()})
        self.scene = {'meta':{'deviceId':'synthetic'},'sources':sources,'evidence':[{'id':'source-drawing'}],
            'parts':[{'id':sid,'position':[0,0,.0002 if sid=='seat' else 0],'quaternion':[0,0,0,1],
                'geometryUrl':f'sources/{sid}.stl'} for sid in ('anchor','seat')],
            'assembly':{'features':[],'interfaces':[],'connections':[],'part_notes':[]}}
        fs=[]
        for owner in ('anchor','seat'):
            fs.append({'id':owner+'-plane','owner_ref':owner,'kind':'planar_patch','geometry_source_ref':owner,
                'geometry':{'type':'plane','origin':[0,0,0],'normal':[0,0,-1 if owner=='anchor' else 1],'triangle_indices':[0,1]}})
            fs.append({'id':owner+'-axis','owner_ref':owner,'kind':'shaft_wall' if owner=='anchor' else 'bore_wall',
                'geometry_source_ref':owner,'geometry':{'type':'cylinder','origin':[0,0,0],'axis':[1,0,0],
                    'radius_m':.005,'axial_range_m':[-.002,.002],'triangle_indices':[0,1]}})
        self.catalog={'features':fs,'interfaces':[],'reference_connections':[]}
        self.request={'schema':'psop.reference-adjustments/1','device_id':'synthetic','title':'Finite mating repair',
            'rationale':'Recover a coherent mating frame from independent faces and axes','maximum_translation_m':.0003,
            'numerical_tolerance_m':2e-8,'source_locks':{s['id']:s['digest'] for s in sources},
            'actions':[{'id':'seat-translation','part_refs':['seat'],'rationale':'Minimum translation, unchanged mesh',
                'evidence_refs':['source-drawing'],'constraints':[
                    {'id':'face','role':'repair','kind':'plane_contact','feature_a_ref':'anchor-plane',
                        'feature_b_ref':'seat-plane','target_gap_m':0,'minimum_overlap_area_m2':.0001},
                    {'id':'axis','role':'neighbor','kind':'cylindrical_fit','feature_a_ref':'anchor-axis',
                        'feature_b_ref':'seat-axis','minimum_axial_overlap_m':.003}]}],
            'presentation':{'part_notes':[],'interfaces':[],'connections':[]}}

    def tearDown(self):self.temp.cleanup()

    def run_repair(self):return reconcile(self.scene,self.catalog,self.root,self.request)

    def test_resolves_small_overlap_by_minimum_translation_without_changing_sources(self):
        before=deepcopy(self.scene);raw=(self.root/'sources/seat.stl').read_bytes()
        report=self.run_repair();a=report['actions'][0]
        self.assertAlmostEqual(a['translation_m'][2],-.0002,places=12)
        self.assertAlmostEqual(a['constraints'][0]['after']['signed_gap_m'],0,places=12)
        self.assertGreater(a['constraints'][0]['after']['finite_overlap_area_m2'],.00039)
        self.assertEqual(before,self.scene);self.assertEqual(raw,(self.root/'sources/seat.stl').read_bytes())
        self.assertFalse(report['geometry_modified'])

    def test_global_rotation_and_translation_do_not_change_the_inferred_correction(self):
        from psop_build_v2 import mechanics as m
        angle=.73;q=[0,math.sin(angle/2),0,math.cos(angle/2)]
        for p in self.scene['parts']:
            p['position']=[x+y for x,y in zip(m._rotate(p['position'],q),[.12,-.07,.5])];p['quaternion']=q
        expected=m._rotate([0,0,-.0002],q)
        for a,b in zip(self.run_repair()['actions'][0]['translation_m'],expected):self.assertAlmostEqual(a,b,places=11)

    def test_large_shift_is_not_silently_accepted_or_clamped(self):
        self.scene['parts'][1]['position'][2]=.002
        with self.assertRaisesRegex(ValueError,'budget'):self.run_repair()

    def test_conflicting_constraints_are_not_averaged_away(self):
        with self.assertRaisesRegex(ValueError,'contradict'):
            _minimum_translation([([0,0,1],.0002),([0,0,1],.0004)],2e-8)

    def test_wrong_diameter_is_not_fixed_by_moving_parts(self):
        self.catalog['features'][3]['geometry']['radius_m']=.0049
        with self.assertRaisesRegex(ValueError,'neighbor constraint'):self.run_repair()

    def test_coaxial_but_disjoint_finite_wall_is_rejected(self):
        self.catalog['features'][3]['geometry']['origin'][0]=.02
        with self.assertRaisesRegex(ValueError,'neighbor constraint'):self.run_repair()

    def test_plane_extension_cannot_fill_absent_material(self):
        p=self.root/'sources/seat.stl';raw=bytearray(p.read_bytes())
        for i in range(2):
            for j in (0,1,2):
                offset=84+i*50+12+j*12;value=struct.unpack_from('<f',raw,offset)[0];struct.pack_into('<f',raw,offset,value+.05)
        p.write_bytes(raw)
        self.catalog['features'][2]['geometry']['origin'][0]=.05
        self.scene['sources'][1]['digest']=self.request['source_locks']['seat']=hashlib.sha256(raw).hexdigest()
        with self.assertRaisesRegex(ValueError,'finite material overlap'):self.run_repair()

    def test_no_automatic_correction_without_neighbor_and_source_evidence(self):
        self.request['actions'][0]['constraints'].pop()
        with self.assertRaisesRegex(ValueError,'neighboring constraints'):self.run_repair()

    def test_changed_source_revision_cannot_reuse_a_repair(self):
        self.request['source_locks']['seat']='0'*64
        with self.assertRaisesRegex(ValueError,'revision changed'):self.run_repair()

    def test_report_cannot_be_forged_by_recounting_or_rewriting_its_summary(self):
        report=self.run_repair();report['actions'][0]['constraints'][0]['after']['signed_gap_m']=.0001
        self.scene['reference_alignment']=summary(report)
        for path,value in [(INPUT_PATH,self.request),(REPORT_PATH,report),('indexes/scene.json',self.scene)]:
            (self.root/path).write_text(json.dumps(value),encoding='utf-8')
        with patch('psop_build_v2.capability_package._load_catalog',return_value=self.catalog):
            with self.assertRaisesRegex(ValueError,'source-locked geometric constraints'):_validate_prepared(self.root)


class ActualHeadRepair(unittest.TestCase):
    def test_coupled_head_repair_preserves_all_declared_neighbors(self):
        repo=Path(__file__).resolve().parents[3]
        root=repo/'build/microduck/source-1.15/microduck-capabilities-9.dkp'
        # The retained release includes the original repair and seven additional
        # independently reviewed head-cradle neighbors.
        request_path=root/'sources/SRC-REFERENCE-ADJUSTMENTS.json'
        if not root.exists() or not request_path.exists():self.skipTest('Published source fixture unavailable')
        from psop_build_v2.capability_package import _load_catalog
        scene=json.loads((root/'indexes/scene.json').read_text(encoding='utf-8'));request=json.loads(request_path.read_text(encoding='utf-8'))
        catalog=_load_catalog(root,scene);before=deepcopy(scene['parts']);report=reconcile(scene,catalog,root,request)
        action=report['actions'][0]
        self.assertEqual(len(action['placements']),2)
        self.assertAlmostEqual(action['translation_m'][2],-.0002,places=8)
        self.assertEqual(len(action['constraints']),20)
        self.assertTrue(all(c['passed'] for c in action['constraints']))
        radial={c['id']:c for c in action['constraints'] if c['kind']=='cylindrical_fit' and c['id'].startswith('head-roll')}
        self.assertEqual(set(radial),{'head-roll-minus','head-roll-plus'})
        for c in radial.values():self.assertGreater(c['after']['radial_clearance_m'],.000099)
        self.assertEqual(before,scene['parts'])
        request['actions'][0]['part_refs'].pop()
        with self.assertRaisesRegex(ValueError,'anchored part|neighbor constraint|contradict'):reconcile(scene,catalog,root,request)


if __name__=='__main__':unittest.main()
