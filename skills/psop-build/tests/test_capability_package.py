"""Independent destructive acceptance of the new publication stages."""
from copy import deepcopy
import hashlib
import math
from pathlib import Path
import struct
import tempfile
import unittest

from psop_build_v2.capability_catalog import build_catalog, validate_catalog
from psop_build_v2.capability_package import _prepare_details, _load_catalog, _validate_prepared, _validate_source_registry, _read, _write, ENTRYPOINTS
from psop_build_v2.compatibility import build_candidates


def source_wall():
    faces = []
    count = 24
    for i in range(count):
        a, b = 2*math.pi*i/count, 2*math.pi*(i+1)/count
        points = [(math.cos(a)*.002, math.sin(a)*.002, 0), (math.cos(b)*.002, math.sin(b)*.002, 0),
                  (math.cos(a)*.002, math.sin(a)*.002, .004), (math.cos(b)*.002, math.sin(b)*.002, .004)]
        normal = (-math.cos((a+b)/2), -math.sin((a+b)/2), 0)
        for tri in ((0, 2, 1), (1, 2, 3)):
            faces.append(struct.pack('<12fH', *normal, *(v for j in tri for v in points[j]), 0))
    return bytes(80)+struct.pack('<I', len(faces))+b''.join(faces)


class CapturedSourceRegistry(unittest.TestCase):
    def test_lazy_document_body_retains_exact_provenance(self):
        original = {'id': 'document', 'url': 'sources/document.md', 'digest': 'original-sha', 'text': 'Original document'}
        lazy = {key: value for key, value in original.items() if key != 'text'}
        _validate_source_registry([original], [lazy])
        _validate_source_registry([original], [original])
        for field, replacement in (('digest', 'changed-sha'), ('url', 'sources/other.md'), ('text', 'Changed document')):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'differs from original archive'):
                _validate_source_registry([original], [{**lazy, field: replacement}])
        with self.assertRaisesRegex(ValueError, 'Duplicate captured source identity'):
            _validate_source_registry([original], [lazy, lazy])
        with self.assertRaisesRegex(ValueError, 'differs from original archive'):
            _validate_source_registry([original], [])


class FrozenCapabilities(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        raw = source_wall()
        (self.root/'sources').mkdir()
        (self.root/'sources/wall.stl').write_bytes(raw)
        sha = hashlib.sha256(raw).hexdigest()
        self.scene = {'meta': {'counts': {}}, 'sources': [{'id': 'mesh', 'format': 'STL', 'url': 'sources/wall.stl', 'digest': sha}],
            'parts': [{'id': 'part:a', 'name': 'a', 'sourceIds': ['mesh'], 'geometryUrl': 'sources/wall.stl', 'evidenceIds': [], 'kind': 'part'},
                      {'id': 'part:b', 'name': 'b', 'sourceIds': ['mesh'], 'geometryUrl': 'sources/wall.stl', 'evidenceIds': [], 'kind': 'part'}],
            'assembly': {'features': [], 'interfaces': [], 'connections': [], 'part_notes': []}}
        self.requirements = {'schema': 'psop.assembly.requirements/2', 'id': 'independent-analytic-wall', 'date': '2026-11-08',
            'method': 'Analytic 4 mm diameter finite bore, input independently synthesized', 'provenance': [],
            'meshes': [{'source_ref': 'mesh', 'source_sha256': sha, 'mesh_key': 'wall', 'review_basis': ['analytic dimensions'],
                'review_scope': 'full finite inner wall', 'finding_refs': [], 'regions': [{'id': 'wall', 'triangle_indices': list(range(48)),
                'geometry_types': ['cylinder'], 'kind': 'bore_wall', 'minimum_coverage': 1, 'require_entries': True}]}],
            'first_regression_findings': [], 'limits': []}
        self.catalog = build_catalog(self.scene, self.root)
        self.compatibility = build_candidates(self.scene['parts'], self.catalog)
        report = validate_catalog(self.catalog, self.scene, self.root, self.requirements)
        _prepare_details(self.scene, self.catalog, self.compatibility, self.root, self.requirements, report)

    def tearDown(self):
        self.temp.cleanup()

    def test_complete_shards_preserve_distinct_instances_and_pairs(self):
        result = _validate_prepared(self.root)
        self.assertEqual(result['pair_count'], 1)
        self.assertGreater(result['candidate_count'], 0)
        self.assertEqual(len(result['catalog']['features']), 2)
        self.assertEqual(result['catalog']['analysis']['unique_measurements'], 1)

    def test_published_use_explanation_and_unknowns_cannot_disappear_from_part_details(self):
        review = {'owner_ref': 'part:a', 'summary': 'Seated casing; retention unspecified',
            'open_items': ['Real retaining hardware is not supplied'], 'interface_dispositions': []}
        coverage = _read(self.root/ENTRYPOINTS['coverage'])
        coverage['geometry']['reference_uses'] = {'parts': [review]}
        _write(self.root/ENTRYPOINTS['coverage'], coverage)
        index = _read(self.root/ENTRYPOINTS['capabilities'])
        path = self.root/index['parts']['part:a']['path']
        detail = _read(path)
        detail['reference_use_review'] = deepcopy(review)
        _write(path, detail)
        _load_catalog(self.root, self.scene)
        for changed in (None, {**review, 'open_items': []}, {**review, 'summary': 'Fully assembled'}):
            with self.subTest(change=changed):
                detail['reference_use_review'] = changed
                _write(path, detail)
                with self.assertRaisesRegex(ValueError, 'explanation differs'):
                    _load_catalog(self.root, self.scene)

    def test_deleting_a_required_wall_fails_without_relying_on_statistics(self):
        catalog = deepcopy(self.catalog)
        catalog['features'][0]['geometry']['triangle_indices'].pop()
        with self.assertRaisesRegex(ValueError, 'disposition incomplete|required region missing'):
            validate_catalog(catalog, self.scene, self.root, self.requirements)

    def test_deleting_an_entry_fails_even_when_all_source_triangles_survive(self):
        catalog = deepcopy(self.catalog)
        catalog['resources'][0]['entries'].pop()
        with self.assertRaisesRegex(ValueError, 'entry requirement missing|Physical resources, finite entries'):
            validate_catalog(catalog, self.scene, self.root, self.requirements)

    def test_resource_cannot_reference_document_or_evidence(self):
        catalog = deepcopy(self.catalog)
        catalog['resources'][0]['feature_refs'] = ['evidence:looks-like-an-id']
        with self.assertRaisesRegex(ValueError, 'must name owned Feature'):
            validate_catalog(catalog, self.scene, self.root, self.requirements)

    def test_candidate_mapping_deletion_fails_after_recounting(self):
        index = _read(self.root/ENTRYPOINTS['compatibility'])
        record = index['pairs'][0]
        path = self.root/record['path']
        detail = _read(path)
        candidate = next(c for c in detail['candidates'] if c['mapping_family'].get('pairs'))
        candidate['mapping_family']['pairs'].clear()
        candidate['geometric_witness']['primitive_pairs'] = 0
        _write(path, detail)
        with self.assertRaisesRegex(ValueError, 'Candidate witness, mapping'):
            _validate_prepared(self.root)

    def test_missing_mesh_disposition_cannot_be_replaced_by_output_counts(self):
        catalog = deepcopy(self.catalog)
        catalog['instance_reviews'].pop()
        catalog['analysis']['unique_measurements'] = 0
        with self.assertRaisesRegex(ValueError, 'review disposition is incomplete'):
            validate_catalog(catalog, self.scene, self.root, self.requirements)

    def test_candidate_must_not_contain_a_solved_placement(self):
        index = _read(self.root/ENTRYPOINTS['compatibility'])
        path = self.root/index['pairs'][0]['path']
        detail = _read(path)
        detail['candidates'][0]['pose'] = {'position': [0, 0, 0]}
        _write(path, detail)
        with self.assertRaisesRegex(ValueError, 'must not claim a solved assembly'):
            _validate_prepared(self.root)


if __name__ == '__main__':
    unittest.main()
