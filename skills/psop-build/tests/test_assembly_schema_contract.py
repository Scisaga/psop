"""Canonical shared records reject authority claims and preserve rule dimensions."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
sys.path.insert(0, str(REPO / "packages/assembly"))
from psop_build_v2.package import read_json, validate_shape, canonical, digest
from psop_assembly import query_definition, evaluate


class AssemblySchemaContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = REPO / "packages/assembly"
        cls.fixture = read_json(root / "fixtures/four-hole-modes.json")
        cls.definition_schema = read_json(root / "schema/definition.schema.json")
        cls.query_schema = read_json(root / "schema/query.schema.json")

    def proposal(self, definition, a=("A", "B"), b=("A", "B")):
        return evaluate(definition, {"selected_roles_a": list(a), "selected_roles_b": list(b),
            "member_mapping": [{"role_a": first, "role_b": second} for first, second in zip(a, b)]})

    def validate_proposal(self, proposal):
        validate_shape(proposal, self.query_schema["$defs"]["proposal"], self.query_schema["$defs"])

    def test_real_fixture_query_and_single_proposal_follow_canonical_records(self):
        validate_shape(self.fixture, self.definition_schema)
        result = query_definition(self.fixture)
        validate_shape(result, self.query_schema)
        self.assertTrue(result["proposals"])
        for proposal in result["proposals"]:
            self.validate_proposal(proposal)
            self.assertEqual(proposal["assessments"]["mechanical"]["status"], "unknown")
            self.assertEqual(proposal["assessments"]["completion"]["status"], "unknown")

    def test_no_function_warrant_or_unimplemented_selector_is_a_canonical_definition(self):
        for case in ("bare_geometry", "unknown_selector"):
            definition = deepcopy(self.fixture)
            if case == "bare_geometry":
                definition["interfaces"][0].pop("warrant")
            else:
                definition["interfaces"][0]["modes"][0]["selection"]["invented_operator"] = "assume_all_fit"
            with self.subTest(case=case), self.assertRaises(ValueError):
                validate_shape(definition, self.definition_schema)

    def test_nonfinite_geometry_zero_radius_and_boolean_search_limits_are_rejected(self):
        for case in ("nonfinite", "zero_radius", "boolean_limit"):
            definition = deepcopy(self.fixture)
            if case == "nonfinite":
                definition["logical_holes"][0]["center_m"][0] = float("nan")
            elif case == "zero_radius":
                definition["logical_holes"][0]["radius_m"] = 0
            else:
                definition["query"]["limits"]["max_mappings"] = True
            with self.subTest(case=case), self.assertRaises(ValueError):
                validate_shape(definition, self.definition_schema)

    def test_extra_retaining_claim_cannot_enter_or_leave_the_shared_api(self):
        proposal = self.proposal(self.fixture)
        proposal["retaining"] = True
        with self.assertRaises(ValueError):
            self.validate_proposal(proposal)
        with self.assertRaises(ValueError):
            evaluate(self.fixture, proposal)

    def test_engineering_and_task_selection_failures_do_not_become_mechanical_impossibility(self):
        for dimension in ("engineering", "task"):
            definition = deepcopy(self.fixture)
            for interface in definition["interfaces"]:
                interface["modes"][0]["selection"]["dimension"] = dimension
            proposal = self.proposal(definition, ("A", "C"), ("A", "C"))
            self.validate_proposal(proposal)
            with self.subTest(dimension=dimension):
                self.assertEqual(proposal["assessments"]["geometry"]["status"], "pass")
                self.assertEqual(proposal["assessments"][dimension]["status"], "fail")
                self.assertEqual(proposal["assessments"]["mechanical"]["status"], "unknown")
                self.assertEqual(proposal["assessments"]["mode_eligibility"]["status"], "fail")

    def test_unproven_assessment_is_unknown_and_definition_identity_uses_canonical_bytes(self):
        definition = deepcopy(self.fixture)
        definition["basis"]["refs"].append("来源:孔组夹具")
        definition["context"] = {"assessments": {"engineering": {"status": "pass", "basis_refs": []}}}
        validate_shape(definition, self.definition_schema)
        proposal = self.proposal(definition)
        self.validate_proposal(proposal)
        self.assertEqual(proposal["assessments"]["engineering"]["status"], "unknown")
        self.assertEqual(proposal["definition_digest"], "sha256:" + digest(canonical(definition)))
        changed = deepcopy(definition)
        changed["basis"]["refs"].append("fixture:updated-evidence-scope")
        second = self.proposal(changed)
        self.assertNotEqual(proposal["id"], second["id"])
        self.assertNotEqual(proposal["definition_digest"], second["definition_digest"])

    def test_incompatible_pose_is_a_failed_registration_not_an_underdetermined_success(self):
        proposal = self.proposal(self.fixture, ("A", "B"), ("A", "C"))
        self.validate_proposal(proposal)
        self.assertEqual(proposal["pose"]["status"], "incompatible")
        self.assertEqual(proposal["assessments"]["geometry"]["status"], "fail")


if __name__ == "__main__":
    unittest.main()
