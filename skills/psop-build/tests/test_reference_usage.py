"""Independent functional coverage cannot be replaced by geometry counts."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from psop_build_v2.reference_usage import validate_reference_uses


class FunctionalUseCoverage(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);(self.root/'sources').mkdir()
        self.scene={'meta':{'deviceId':'synthetic'},'sources':[],'parts':[]}
        self.catalog={'features':[],'interfaces':[],'reference_connections':[],'resources':[]}
        self.review={'schema':'psop.reference-use-review/1','device_id':'synthetic','date':'2026-11-09','basis':'Independent synthetic source regions','scope':'Synthetic finite seating and functional use, not physical qualification','limits':['Unknown real holding'],
            'parts':[],'required_connections':[],'required_surface_regions':[],
            'surface_pair_dispositions':[{'owner_refs':['a','b'],'status':'added_reference_use','reason':'Independently synthesized bracket and seat'}]}
        for name in ['a','b']:
            raw=('independent source '+name).encode();(self.root/'sources'/f'{name}.stl').write_bytes(raw);digest=hashlib.sha256(raw).hexdigest()
            self.scene['sources'].append({'id':name,'digest':digest,'url':f'sources/{name}.stl'})
            self.scene['parts'].append({'id':name,'sourceIds':[name],'position':[0,0,0],'quaternion':[0,0,0,1]})
            self.catalog['features'].append({'id':name+'-face','owner_ref':name,'geometry':{'triangle_indices':[0]}})
            self.catalog['interfaces'].append({'id':name+'-seat','name':'Finite seat '+name,'owner_ref':name,'members':[{'id':name+'-member','feature_refs':[name+'-face']}]})
            self.catalog['resources'].append({'feature_refs':[name+'-face']})
            self.review['parts'].append({'owner_ref':name,'source_ref':name,'source_sha256':digest,'summary':'Finite seating; retaining is separate',
                'required_interface_refs':[name+'-seat'],'open_items':['Actual retention unspecified'] if name=='a' else [],
                'interface_dispositions':[{'interface_ref':name+'-seat','status':'reference_use_recorded','connection_refs':['fit']}]})
            self.review['required_surface_regions'].append({'owner_ref':name,'interface_ref':name+'-seat','triangle_indices':[0],'minimum_coverage':1.})
        relation={'id':'fit','mechanism':'Finite seating, not holding','endpoints':[{'interface_ref':name+'-seat','member_refs':[name+'-member']} for name in ['a','b']]}
        self.catalog['reference_connections']=[deepcopy(relation)];self.review['required_connections']=[deepcopy(relation)]
        self.raw={'observations':[{'owner_refs':['a','b']}],'pair_checks':[{'owner_refs':['a','b']}],
            'configuration_placements':[{'owner_ref':p['id'],'position':p['position'],'quaternion':p['quaternion']} for p in self.scene['parts']],
            'source_locks':{s['url']:s['digest'] for s in self.scene['sources']}}
        self.requirements={};self.seal()

    def seal(self):
        raw=json.dumps(self.raw).encode();(self.root/'sources/raw.json').write_bytes(raw);digest=hashlib.sha256(raw).hexdigest()
        self.review['raw_surface_review_sha256']=digest
        self.scene['sources']=[s for s in self.scene['sources'] if s['id'] not in ['raw','review']]+[{'id':'raw','digest':digest,'url':'sources/raw.json'}]
        encoded=json.dumps(self.review).encode();(self.root/'sources/review.json').write_bytes(encoded);digest=hashlib.sha256(encoded).hexdigest()
        self.scene['sources'].append({'id':'review','digest':digest,'url':'sources/review.json'})
        self.requirements['reference_uses']={'source_ref':'review','sha256':digest}

    def validate(self):return validate_reference_uses(self.catalog,self.scene,self.root,self.requirements)

    def test_reports_functional_use_and_open_items_separately(self):
        report=self.validate();self.assertEqual(report['part_count'],2);self.assertEqual(report['open_item_count'],1)
        self.assertIn('explicit_open_items',report['status']);self.assertNotIn('assembled',report)

    def test_deleting_interface_and_its_relations_cannot_pass_by_recounting(self):
        self.catalog['interfaces'].pop();self.catalog['reference_connections']=[]
        with self.assertRaisesRegex(ValueError,'functional interface|reference relation'):self.validate()

    def test_deleting_a_reference_relation_is_independently_detected(self):
        self.catalog['reference_connections']=[]
        with self.assertRaisesRegex(ValueError,'reference relation'):self.validate()

    def test_member_mapping_cannot_be_changed_with_the_same_counts(self):
        self.catalog['reference_connections'][0]['endpoints'][0]['member_refs']=[]
        with self.assertRaisesRegex(ValueError,'member mapping'):self.validate()

    def test_an_unrelated_real_face_cannot_replace_a_required_seating_region(self):
        self.catalog['features'][0]['geometry']['triangle_indices']=[1]
        with self.assertRaisesRegex(ValueError,'functional surface region'):self.validate()

    def test_every_source_instance_is_required_even_if_the_review_is_resealed(self):
        self.review['parts'].pop();self.seal()
        with self.assertRaisesRegex(ValueError,'every source instance'):self.validate()

    def test_missing_raw_observation_disposition_is_not_an_empty_success(self):
        self.review['surface_pair_dispositions']=[];self.seal()
        with self.assertRaisesRegex(ValueError,'disposition coverage'):self.validate()

    def test_reference_pair_coverage_cannot_be_truncated(self):
        self.raw['pair_checks']=[];self.seal()
        with self.assertRaisesRegex(ValueError,'pair review is incomplete'):self.validate()

    def test_new_reference_placement_requires_another_review(self):
        self.scene['parts'][0]['position']=[0,0,.001]
        with self.assertRaisesRegex(ValueError,'different configuration'):self.validate()

    def test_source_revision_is_bound_to_the_functional_review(self):
        (self.root/'sources/a.stl').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'source revision'):self.validate()

    def test_semantic_alias_does_not_create_another_physical_surface(self):
        self.catalog['features'][0]['replacement_feature_refs']=['a-original']
        self.catalog['features'].append({'id':'a-original','owner_ref':'a','geometry':{'triangle_indices':[0]}})
        self.catalog['resources'].append({'feature_refs':['a-original']})
        with self.assertRaisesRegex(ValueError,'share its witnessed physical resource'):self.validate()
        self.catalog['resources'][0]['feature_refs'].append('a-original');self.validate()

    def test_historical_requirements_do_not_gain_new_functional_claims(self):
        self.assertIsNone(validate_reference_uses(self.catalog,self.scene,self.root,{}))


if __name__=='__main__':unittest.main()
