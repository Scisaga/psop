"""Stage boundaries and omission acceptance in the ConnectionReview interpreter."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import connection_analysis as analysis


class ConnectionAnalysis(unittest.TestCase):
    def test_unlocated_review_does_not_invent_a_local_point_or_use_first_structure(self):
        review = {"participants": [{"part_ref": p, "feature_refs": [], "opening_refs": [], "site_refs": []} for p in ("left", "right")]}
        candidates = {"unrelated": {"id": "unrelated", "owner_ref": "left", "related_feature_refs": [], "geometry": {"center": [1., 2., 3.]}}}
        participants = analysis._participants(review, [], candidates, {p: {"name": p} for p in ("left", "right")}, {})
        self.assertTrue(all(p["position_local_m"] is None and p["structure_refs"] == [] for p in participants))

    def test_independent_mechanism_acceptance_rejects_deleted_or_generic_results(self):
        expected = {"expected_review_findings": [{"id": "required-clamp", "part_refs": ["plate", "receiver"], "outcome": "supported_hypothesis", "mechanism": "screw_clamp"}]}
        participants = [{"part_ref": p, "structure_refs": [p + ":wall"], "position_local_m": [0., 0., .001]} for p in ("plate", "receiver")]
        finding = {"id": "finding", "participants": participants, "work_status": "investigated", "evidence_status": "supported_hypothesis",
            "actions": [{"method": "source-section and retained manufacturer mechanism comparison"}], "findings": ["measured plate and receiving walls"],
            "counterevidence": ["no manufactured thread in source"], "alternatives": ["separate insert"], "missing_evidence": ["actual thread and length"],
            "roles": [{"role": p, "status": "unknown", "statement": "scoped"} for p in ("location", "retention", "motion", "limit")],
            "mechanism_candidates": [{"kind": "screw_clamp"}], "hypothesis_refs": ["hypothesis"]}
        hypothesis = {"id": "hypothesis", "participants": participants, "mechanism": {"kind": "screw_clamp"},
            "measurements": [{"name": "diameters", "value": [.0022, .0016]}], "supporting_evidence": [{"source_refs": ["original"]}]}
        result = {"connection_review_findings": [finding], "installation_hypotheses": [hypothesis]}
        self.assertEqual(analysis.independent_acceptance(result, expected)["missing"], [])
        for key in ("connection_review_findings", "installation_hypotheses"):
            altered = deepcopy(result); altered[key] = []
            self.assertEqual(analysis.independent_acceptance(altered, expected)["missing"], ["required-clamp"])
        altered = deepcopy(result); altered["connection_review_findings"] = [{"next_actions": ["inspect CAD later"]}]
        self.assertEqual(analysis.independent_acceptance(altered, expected)["missing"], ["required-clamp"])

    def test_geometry_pair_is_still_only_geometry_even_with_equal_axes(self):
        parts = {p: {"scale": [1., 1., 1.], "quaternion": [0., 0., 0., 1.], "position": [0., 0., 0.]} for p in ("shaft", "plate")}
        candidates = {}
        for ref, kind, radius in (("shaft", "shaft_wall", .008), ("plate", "bore_wall", .0095)):
            candidates[ref] = {"id": ref, "owner_ref": ref, "kind": kind, "geometry": {"type": "cylinder", "origin": [0., 0., 0.], "center": [0., 0., 0.],
                "axis": [0., 1., 0.], "radius_m": radius, "axial_range_m": [-.001, .001]}, "related_feature_refs": [], "measurement": {"coverage": 1.}}
        pairings = analysis.local_pairings(["shaft", "plate"], candidates, parts)
        self.assertEqual(len(pairings), 1)
        self.assertEqual(pairings[0]["status"], "geometry_only")
        self.assertEqual(pairings[0]["geometry_checks"][0]["value"], [.016, .019])

    def test_new_frozen_research_keeps_original_studies_and_explicit_six_outcomes(self):
        old = json.loads((REPO / "device-materials/interface-review/microduck-relations.json").read_text(encoding="utf-8"))
        new = json.loads((REPO / "device-materials/interface-review/microduck-connection-analysis.json").read_text(encoding="utf-8"))
        self.assertEqual(new["relation_studies"], old["relation_studies"])
        self.assertEqual(new["expected_relations"], old["expected_relations"])
        self.assertEqual(new["sources"][:len(old["sources"])], old["sources"])
        hip = "part:microduck:fa9ee2f71faafb88"
        studies = [s for s in new["connection_review_studies"] if hip in {p["part_ref"] for p in s["participants"]}]
        self.assertEqual(len(studies), 6)
        self.assertEqual(sum(s["outcome"] == "supported_hypothesis" for s in studies), 2)
        self.assertTrue(all(s["actions"] and s["counterevidence"] and s["next_actions"] for s in studies))


if __name__ == "__main__":
    unittest.main()
