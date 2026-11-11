"""Evidence-grounded results and refusal cases, independent of device names."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import relationship_investigation as research


class CompletedRelationshipResearch(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix="psop-relationship-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        raw = (SKILL / "tests/fixtures/left-shell-z-bore.stl").read_bytes()
        (self.root / "sources").mkdir()
        (self.root / "sources/fixture.stl").write_bytes(raw)
        sha = hashlib.sha256(raw).hexdigest()
        count = struct.unpack_from("<I", raw, 80)[0]
        vertices = [struct.unpack_from("<3f", raw, 84+i*50+12+j*12) for i in range(count) for j in range(3)]
        minimum, maximum = min(p[2] for p in vertices), max(p[2] for p in vertices)
        center = [.0255, -.0095, (minimum+maximum)/2]
        scale = 8/11
        gap = .0005
        separation = (maximum-minimum)*(1+scale)/2 + gap
        first = {"id": "part:fixture:unfamiliar-a", "name": "arbitrary plate", "meshKey": "not-a-shell-or-servo", "body": "one",
            "sourceIds": ["SRC-RAW"], "evidenceIds": ["E-RAW"], "position": [0., 0., 0.], "quaternion": [0., 0., 0., 1.], "scale": [1., 1., 1.]}
        second = {**deepcopy(first), "id": "part:fixture:unfamiliar-b", "name": "unrelated receiver", "meshKey": "not-a-known-part", "body": "different",
            "position": [center[i]*(1-scale)+(separation if i == 2 else 0) for i in range(3)], "scale": [scale]*3}
        self.scene = {"meta": {"counts": {}}, "parts": [first, second], "sources": [{"id": "SRC-RAW", "digest": sha, "url": "sources/fixture.stl"}],
            "evidence": [{"id": "E-RAW", "sourceId": "SRC-RAW"}]}
        self.base = {"features": [], "circular_openings": [], "slot_features": [], "mounting_sites": [], "mounting_interfaces": [], "interfaces": []}
        annotation = {"id": "raw-section", "kind": "bore_wall", "center_local_m": center, "axis_local": [0., 0., 1.], "radius_m": .0011,
            "tolerance_m": .000002, "triangle_witnesses": list(range(count)), "annotation_basis": "Controlled source fixture inner-wall section", "next_action": "Check the independent receiver/fastener fixture warrant."}
        proof = self.root / "fixture-proof.md"
        proof.write_text("Synthetic clamp research fixture: a separate screw is required; retention is deliberately unverified.\n", encoding="utf8")
        self.review = {"schema": research.INPUT_SCHEMA, "device_id": "fixture", "sources": [{"id": "fixture-mechanism-warrant", "capture_path": proof.name,
            "url": "https://example.invalid/fixture-only", "sha256": hashlib.sha256(proof.read_bytes()).hexdigest()}],
            "samples": [{"part_ref": part["id"], "geometry_sha256": sha, "regions": [], "expected_features": [deepcopy(annotation)]} for part in (first, second)]}
        refs = [first["id"], second["id"]]
        self.study = {"id": "independent-clamp", "title": "Finite two-carrier screw hypothesis", "work_status": "investigated", "outcome": "supported_hypothesis",
            "participants": [{"part_ref": part["id"], "annotation_refs": ["raw-section"], "role": role, "label": role} for part, role in ((first, "clearance"), (second, "receiver"))],
            "actions": [{"method": "Compare the controlled source sections and distinct mechanism warrant", "source_refs": ["SRC-RAW", "fixture-mechanism-warrant"],
                "observation": "2.2/1.6mm complementary sections, finite 0.5mm separation, separate screw required; no actual retention evidence."}],
            "findings": ["Finite complementary source walls and a separate screw mechanism warrant support a bounded hypothesis."],
            "missing_evidence": ["Actual screw, thread contact, preloading, tolerance and load capacity are unverified."],
            "stop_reason": "Controlled geometry and mechanism evidence checked; actual engagement is outside this fixture.",
            "mechanism": {"kind": "screw_clamp", "summary": "A separate screw may clamp the carriers through complementary finite bores."},
            "roles": [{"role": role, "status": "supported_hypothesis" if role == "location" else "unknown", "statement": role + " remains scope-limited", "participant_refs": refs} for role in ("location", "retention", "motion", "limit")],
            "supporting_evidence": [{"claim": "Independent mechanism warrant plus finite complementary sections", "source_refs": ["SRC-RAW", "fixture-mechanism-warrant"]}],
            "counterevidence": ["No manufactured thread or installed screw appears in these source walls."],
            "alternatives": ["An insert or separate nut would require additional evidence."],
            "intermediate_components": [{"kind": "screw", "requirement": "required", "status": "unconfirmed", "statement": "A screw is necessary to the hypothesis, absent from the model."}],
            "geometry_requirements": {"nominal_connector_diameter_m": .002, "axis_tolerance_m": .00015, "max_finite_gap_m": .001}}
        self.review.update(relation_studies=[self.study], expected_relations=[{"id": "independent-clamp-required", "study_ref": self.study["id"], "part_refs": refs,
            "mechanism": "screw_clamp", "basis": "Controlled source dimensions and separate mechanism warrant establish the expected hypothesis, not production candidate counts."}])

    def analyze(self):
        path = self.root / "review.json"
        path.write_text(json.dumps(self.review), encoding="utf8")
        research.capture_input(self.scene, self.root, path, {"fixture-mechanism-warrant": self.root / "fixture-proof.md"})
        return research.augment_analysis(self.base, self.scene, self.root, self.review)

    def test_unfamiliar_parts_produce_a_concrete_traceable_hypothesis_but_no_confirmed_interface(self):
        result = self.analyze()
        self.assertEqual(len(result["installation_hypotheses"]), 1)
        hypothesis = result["installation_hypotheses"][0]
        self.assertEqual(hypothesis["mechanism"]["kind"], "screw_clamp")
        self.assertEqual({p["part_ref"] for p in hypothesis["participants"]}, {p["id"] for p in self.scene["parts"]})
        self.assertAlmostEqual(next(m for m in hypothesis["measurements"] if m["name"] == "有限壁段间隔")["value"][0], .0005, places=7)
        self.assertTrue(all(p["structure_refs"] for p in hypothesis["participants"]))
        self.assertEqual(next(role for role in hypothesis["roles"] if role["role"] == "retention")["status"], "unknown")
        self.assertEqual(result["interfaces"], [])
        self.assertEqual(result["relationship_coverage"]["engineering_confirmed_count"], 0)
        self.assertTrue(all(c["work_status"] == "investigated" for c in result["structure_candidates"]))

    def test_evidence_insufficiency_keeps_geometry_and_an_actual_scoped_record(self):
        self.study["outcome"] = "insufficient"
        self.study["missing_evidence"] = ["The receiver insert needed for this specific source wall is not documented."]
        self.review["expected_relations"] = []
        result = self.analyze()
        self.assertEqual(result["installation_hypotheses"], [])
        self.assertTrue(result["structure_candidates"])
        self.assertEqual(result["investigation_records"][0]["evidence_status"], "insufficient")
        self.assertTrue(all(c["function_status"] == "unknown" for c in result["structure_candidates"]))

    def test_new_counterpart_hypothesis_preserves_the_existing_installation_evidence_scope(self):
        discovered = self.analyze()
        owner = self.scene["parts"][0]["id"]
        wall = next(item for item in discovered["structure_candidates"] if item["owner_ref"] == owner)
        feature = {"id": "feature:already-declared", "owner_ref": owner, "kind": wall["kind"],
            "geometry": wall["geometry"], "support_triangle_indices": wall["support_triangle_indices"], "measurement": wall["measurement"]}
        self.base["features"] = [feature]
        self.base["mounting_sites"] = [{"owner_ref": owner, "status": "user_asserted", "feature_refs": [feature["id"]]}]
        result = research.augment_analysis(self.base, self.scene, self.root, self.review)
        candidate = next(item for item in result["structure_candidates"] if item["owner_ref"] == owner)
        self.assertEqual(candidate["function_status"], "installation_evidence_available")
        self.assertTrue(candidate["hypothesis_refs"])

    def test_generic_next_actions_or_missing_relationship_cannot_satisfy_the_fixed_result_expectation(self):
        result = self.analyze()
        for replacement in ([], [{"next_actions": ["Inspect this device later"]}]):
            altered = {**result, "installation_hypotheses": replacement}
            coverage = research.expectation_coverage(altered, self.review)
            self.assertEqual(coverage["expected_count"], 1)
            self.assertEqual(coverage["located_count"], 0)
            self.assertEqual(coverage["missing"], ["independent-clamp-required"])

    def test_unexecuted_or_untraceable_research_cannot_be_marked_investigated(self):
        self.study["actions"] = []
        with self.assertRaisesRegex(ValueError, "actual checks"):
            research.validate_input(self.review, self.scene)

    def test_corrupted_utf8_research_text_is_rejected_in_all_key_explanations(self):
        for target, key in ((self.study, "title"), (self.study["mechanism"], "summary"),
                            (self.study["participants"][0], "label"), (self.study["roles"][0], "statement"),
                            (self.study["supporting_evidence"][0], "claim")):
            for invalid in ("???????", "\ufffd\ufffd", " "):
                with self.subTest(field=key, invalid=invalid):
                    previous = target[key]
                    target[key] = invalid
                    try:
                        with self.assertRaisesRegex(ValueError, "concrete"):
                            research.validate_input(self.review, self.scene)
                    finally:
                        target[key] = previous

    def test_frozen_device_research_keeps_readable_chinese_titles_and_scoped_findings(self):
        path = SKILL.parents[1] / "device-materials/interface-review/microduck-relations.json"
        review = json.loads(path.read_text(encoding="utf8"))
        titles = {item["id"]: item["title"] for item in review["relation_studies"]}
        self.assertEqual(titles["right-left-shell-closure"], "左右外壳接缝处的螺钉闭壳假设")
        self.assertEqual(titles["right-shell-z-boss"], "右壳 Z 向台阶孔：对端与用途仍未确定")
        for study in review["relation_studies"]:
            for text in (study["title"], *study["findings"], *study["missing_evidence"]):
                self.assertNotIn("???", text)
                self.assertNotIn("\ufffd", text)

    def test_nearby_but_incompatible_finite_source_geometry_does_not_become_an_interface(self):
        self.scene["parts"][1]["position"][0] += .001
        with self.assertRaisesRegex(ValueError, "finite common-configuration"):
            self.analyze()

    def test_source_geometry_without_executed_studies_stays_uninvestigated(self):
        result = research.augment_analysis(self.base, self.scene, self.root, None)
        self.assertTrue(result["structure_candidates"])
        self.assertTrue(all(c["work_status"] == "not_investigated" for c in result["structure_candidates"]))
        self.assertEqual(result["installation_hypotheses"], [])
        self.assertEqual(result["investigation_records"], [])


if __name__ == "__main__":
    unittest.main()
