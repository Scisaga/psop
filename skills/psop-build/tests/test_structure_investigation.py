"""Independent omission checks and preparation-time evidence boundaries."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import investigation, mechanics


class StructureInvestigation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (SKILL / "tests/fixtures/left-shell-z-bore.stl").read_bytes()
        cls.sha = hashlib.sha256(cls.raw).hexdigest()

    def fixture(self, two=False):
        source = {"id": "SRC-GEOMETRY", "digest": self.sha, "url": "sources/geometry.stl"}
        part = {"id": "part:sample:wall-a", "meshKey": "unrelated-mesh-name", "body": "source-body-a", "sourceIds": [source["id"]], "evidenceIds": ["E-RAW"],
            "scale": [1., 1., 1.], "position": [0., 0., 0.], "quaternion": [0., 0., 0., 1.]}
        parts = [part]
        if two:
            parts.append({**deepcopy(part), "id": "part:sample:wall-b", "position": [.1, .2, .3], "body": "source-body-b"})
        scene = {"meta": {"counts": {}}, "parts": parts, "sources": [source], "evidence": []}
        base = {"features": [], "circular_openings": [], "slot_features": [], "mounting_sites": []}
        return base, scene

    def annotation(self):
        return {"schema": investigation.INPUT_SCHEMA, "device_id": "sample", "sources": [{"id": "SRC-GEOMETRY", "sha256": self.sha}],
            "samples": [{"part_ref": "part:sample:wall-a", "geometry_sha256": self.sha, "regions": [], "expected_features": [{
                "id": "independently-located-section", "kind": "circular_opening", "center_local_m": [.0255, -.0095, .04153], "axis_local": [0., 0., 1.],
                "radius_m": .0011, "tolerance_m": .00001, "triangle_witnesses": list(range(180)),
                "annotation_basis": "Raw source triangle-plane section, separate from normal grouping and cylinder discovery", "function_status": "unknown",
                "next_action": "Find a source-revision-specific assembly drawing."}]}]}

    def augment(self, two=False, review=None):
        base, scene = self.fixture(two)
        with TemporaryDirectory() as name:
            root = Path(name)
            (root / "sources").mkdir()
            (root / "sources/geometry.stl").write_bytes(self.raw)
            if review:
                source = root / "review.json"
                source.write_text(json.dumps(review), encoding="utf-8")
                investigation.capture_input(scene, root, source)
            return investigation.augment_analysis(base, scene, root, review), scene

    def test_discovery_does_not_require_a_mounting_selector_or_known_part_name(self):
        data, _ = self.augment()
        candidate = data["structure_candidates"][0]
        self.assertEqual(candidate["kind"], "bore_wall")
        self.assertEqual(candidate["function_status"], "unknown")
        self.assertEqual(candidate["review_status"], "unreviewed")
        self.assertTrue(candidate["missing_evidence"] and candidate["next_actions"] and candidate["stop_reason"])
        self.assertAlmostEqual(candidate["geometry"]["center"][0], .0255, places=7)
        self.assertEqual(data["review_coverage"]["independent_features"]["status"], "not_supplied")
        self.assertFalse(data["review_coverage"]["region_review"]["complete"])
        self.assertEqual(data["mounting_sites"], [])

    def test_geometry_reuse_does_not_merge_distinct_instances_or_motion_contexts(self):
        data, _ = self.augment(two=True)
        self.assertEqual(len(data["part_investigations"]), 2)
        self.assertEqual(data["review_coverage"]["geometry_asset_count"], 1)
        self.assertEqual(len({x["id"] for x in data["structure_candidates"]}), 2)
        self.assertEqual({x["instance_context"]["motion_ownership"] for x in data["part_investigations"]}, {"unresolved"})
        self.assertNotEqual(*[x["instance_context"]["position"] for x in data["part_investigations"]])

    def test_frozen_denominator_exposes_intentional_omission_after_recount(self):
        review = self.annotation()
        data, _ = self.augment(review=review)
        full = investigation.independent_coverage(data["structure_candidates"], review)
        self.assertEqual(full["status"], "pass")
        missing = investigation.independent_coverage([], review)
        self.assertEqual(missing["expected_count"], full["expected_count"])
        self.assertEqual(missing["status"], "incomplete")
        self.assertEqual(missing["missing"][0]["id"], "independently-located-section")
        self.assertEqual(missing["missing"][0]["center_local_m"], [.0255, -.0095, .04153])

    def test_annotation_matches_require_source_position_direction_and_triangle_witness(self):
        review = self.annotation()
        data, _ = self.augment(review=review)
        for field, changed in (("owner_ref", "part:sample:wall-b"), ("geometry_sha256", "0"*64), ("support_triangle_indices", [])):
            candidate = deepcopy(data["structure_candidates"][0]); candidate[field] = changed
            with self.subTest(field=field):
                self.assertEqual(investigation.independent_coverage([candidate], review)["status"], "incomplete")
        for geometry in ({"axis": [1., 0., 0.]}, {"center": [.0255, -.02, .04153]}):
            candidate = deepcopy(data["structure_candidates"][0]); candidate["geometry"].update(geometry)
            self.assertEqual(investigation.independent_coverage([candidate], review)["status"], "incomplete")

    def test_empty_annotation_and_other_feature_kind_cannot_claim_sample_pass(self):
        review = self.annotation(); data, _ = self.augment(review=review)
        review["samples"][0]["expected_features"][0]["kind"] = "snap_hook"
        self.assertEqual(investigation.independent_coverage(data["structure_candidates"], review)["status"], "incomplete")
        review["samples"] = []
        self.assertEqual(investigation.independent_coverage(data["structure_candidates"], review)["status"], "not_supplied")

    def test_inspection_is_separate_from_functional_qualification(self):
        review = self.annotation()
        expected = review["samples"][0]["expected_features"][0]
        expected.update(stop_reason="Source section reviewed; exact assembly drawing unavailable.", missing_evidence="Actual retaining connector is not specified.")
        data, _ = self.augment(review=review)
        item = data["structure_candidates"][0]
        self.assertEqual(item["review_status"], "reviewed")
        self.assertEqual(item["function_status"], "unknown")
        self.assertEqual(data["mounting_sites"], [])
        self.assertTrue(item["measurement"]["coverage"] > .99)
        self.assertEqual(item["next_actions"][0], expected["next_action"])
        self.assertEqual(item["stop_reason"], expected["stop_reason"])
        self.assertEqual(item["missing_evidence"], [expected["missing_evidence"]])

    def test_invalid_source_revision_and_empty_reviewed_region_are_rejected(self):
        review = self.annotation(); review["samples"][0]["geometry_sha256"] = "0"*64
        with self.assertRaisesRegex(ValueError, "SHA"):
            self.augment(review=review)
        review = self.annotation(); review["samples"][0]["regions"] = [{"id": "false-review", "label": "unknown", "triangle_indices": [], "review_status": "reviewed", "evidence": "no mesh inspected"}]
        with self.assertRaisesRegex(ValueError, "requires triangles"):
            self.augment(review=review)

    def test_slot_witnesses_remain_addressable_and_nonuniform_mate_search_is_explicit(self):
        _, scene = self.fixture()
        part, source = scene["parts"][0], scene["sources"][0]
        slot = investigation._candidate(part, source, {"kind": "slot", "geometry": {"type": "capsule_opening", "origin": [.1, .2, .3], "normal": [0., 0., 1.], "support_triangle_indices": [1, 2]}})
        self.assertEqual(slot["support_triangle_indices"], [1, 2])
        self.assertEqual(slot["geometry"]["center"], [.1, .2, .3])
        part["scale"] = [1., 2., 1.]
        investigation._counterparts([slot], scene)
        self.assertTrue(any("scale" in reason for reason in slot["limitations"]))


if __name__ == "__main__":
    unittest.main()
