"""Original-use certainty must not collapse into fastening or compatibility."""
import unittest

from psop_build_v2.reference_assessment import validate_assessment, REVIEW_SCHEMA
from psop_build_v2.interface_review import review_interfaces
from psop_build_v2.compatibility import build_candidates
from test_interface_policy import modern, binding


def assessed(geometry="axes_aligned"):
    return {"schema": "psop.reference-connection-assessment/1", "configuration_ref": "source",
        "purpose": "identified", "counterpart": "identified", "geometry": geometry, "fastening": "unspecified",
        "summary": "Finite mounting role and peer identified; screw specification remains open.",
        "evidence_refs": ["source:original"], "open_items": [{"kind": "fastening", "note": "Verify screw engagement."}]
        + ([{"kind": "geometry", "note": "Inspect the finite source offset."}] if geometry != "axes_aligned" else [])}


class ReferenceAssessment(unittest.TestCase):
    def fixture(self):
        parts, catalog, policy = modern()
        # Independent source placements, with all four selected members.
        for part in parts:
            part.update(position=[0., 0., 0.], quaternion=[0., 0., 0., 1.])
        connection = binding(catalog, "hypothesis")
        connection.update(configuration_ref="source", reference_assessment=assessed())
        for endpoint, interface in zip(connection["endpoints"], catalog["interfaces"]):
            endpoint["member_refs"] = [m["id"] for m in interface["members"]]
        return connection, catalog, {p["id"]: p for p in parts}, policy

    def test_identified_peer_does_not_assert_fasteners_or_promote_basis(self):
        connection, catalog, parts, _ = self.fixture()
        validate_assessment(connection, {i["id"]: i for i in catalog["interfaces"]}, ["source:original"], parts)
        self.assertEqual(connection["basis"], "hypothesis")
        self.assertEqual(connection["reference_assessment"]["fastening"], "unspecified")

    def test_axis_alignment_requires_source_geometry_and_a_bijection(self):
        for mutation in ("offset", "duplicate", "missing-selection"):
            connection, catalog, parts, _ = self.fixture()
            if mutation == "offset":
                parts[catalog["interfaces"][1]["owner_ref"]]["position"][0] += .003
            elif mutation == "duplicate":
                catalog["interfaces"][1]["members"][1]["position"] = catalog["interfaces"][1]["members"][0]["position"][:]
            else:
                connection["endpoints"][1]["member_refs"] = []
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_assessment(connection, {i["id"]: i for i in catalog["interfaces"]}, ["source:original"], parts)

    def test_unresolved_dimensions_evidence_and_configuration_cannot_be_omitted(self):
        for mutation in ("missing-evidence", "wrong-configuration", "missing-followup", "unknown-dimension"):
            connection, catalog, parts, _ = self.fixture()
            a = connection["reference_assessment"]
            if mutation == "missing-evidence": a["evidence_refs"] = ["absent"]
            elif mutation == "wrong-configuration": a["configuration_ref"] = "other"
            elif mutation == "missing-followup": a["open_items"] = []
            else: a["counterpart"] = "probably"
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate_assessment(connection, {i["id"]: i for i in catalog["interfaces"]}, ["source:original"], parts)

    def test_hypothesis_still_needs_followup_when_an_alternative_pose_is_compatible(self):
        parts, catalog, policy = modern()
        policy["reference_review_schema"] = REVIEW_SCHEMA
        catalog["reference_connections"] = [binding(catalog, "hypothesis")]
        report = build_candidates(parts, catalog, interface_policy=policy)["coverage"]["interface_analysis"]
        row = report["reference_connections"][0]
        self.assertEqual(row["compatibility_status"], "recovered")
        self.assertEqual(row["reference_status"], "reference_hypothesis")
        self.assertTrue(row["followup_required"])
        self.assertEqual(row["followup_reasons"], ["original_use"])
        self.assertEqual(report["hypothesis_followup_count"], 1)
        self.assertFalse(report["reference_assessment_complete"])

    def test_fastening_followup_does_not_falsify_known_compatibility_recovery(self):
        parts, catalog, policy = modern()
        policy["reference_review_schema"] = REVIEW_SCHEMA
        connection = binding(catalog)
        connection["reference_assessment"] = assessed()
        catalog["reference_connections"] = [connection]
        report = build_candidates(parts, catalog, interface_policy=policy)["coverage"]["interface_analysis"]
        self.assertEqual(report["recovered_supported_reference_count"], 1)
        self.assertTrue(report["supported_reference_recovery_complete"])
        self.assertEqual(report["compatibility_followup_count"], 0)
        self.assertEqual(report["reference_followup_count"], 1)
        self.assertEqual(report["reference_followup_by_reason"], {"fastening": 1})

    def test_explicit_assessment_always_enters_new_followup_review(self):
        parts, catalog, policy = modern()
        connection = binding(catalog, "hypothesis")
        connection["reference_assessment"] = assessed("review_required")
        catalog["reference_connections"] = [connection]
        report = build_candidates(parts, catalog, interface_policy=policy)["coverage"]["interface_analysis"]
        self.assertEqual(report["schema"], REVIEW_SCHEMA)
        self.assertEqual(report["reference_connections"][0]["followup_reasons"], ["fastening", "geometry"])

    def test_source_conflict_remains_open_when_new_pose_succeeds(self):
        parts, catalog, policy = modern()
        policy["reference_review_schema"] = REVIEW_SCHEMA
        catalog["reference_connections"] = [binding(catalog, "incompatible")]
        report = build_candidates(parts, catalog, interface_policy=policy)["coverage"]["interface_analysis"]
        row = report["reference_connections"][0]
        self.assertEqual(row["reference_status"], "source_configuration_exclusion")
        self.assertEqual(row["followup_reasons"], ["source_configuration"])
        self.assertEqual(report["reference_followup_count"], 1)

    def test_historical_policy_keeps_its_frozen_review_semantics(self):
        parts, catalog, policy = modern()
        catalog["reference_connections"] = [binding(catalog, "hypothesis")]
        report = build_candidates(parts, catalog, interface_policy=policy)["coverage"]["interface_analysis"]
        self.assertEqual(report["schema"], "psop.interface-analysis-review/1")
        self.assertFalse(report["reference_connections"][0]["followup_required"])


if __name__ == "__main__":
    unittest.main()
