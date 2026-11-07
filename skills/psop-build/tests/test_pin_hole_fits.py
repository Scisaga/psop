"""Source-pose cone/bore measurements and alternative-use authority boundaries."""
from copy import deepcopy
import json
import math
from pathlib import Path
import sys
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import connection_review, package


def fixture():
    owners = ["part:synthetic:pin-carrier", "part:synthetic:housing"]
    parts = [{"id": owner, "position": [0., 0., 0.], "quaternion": [0., 0., 0., 1.], "scale": [1., 1., 1.],
              "sourceIds": ["SRC-" + str(i)], "evidenceIds": ["evidence:" + str(i)]} for i, owner in enumerate(owners)]
    features, sites = [], []
    for i, x in enumerate((-.008, .008)):
        pin_ref, hole_ref = "feature:pin:" + str(i), "feature:hole:" + str(i)
        features.extend([
            {"id": pin_ref, "owner_ref": owners[0], "kind": "shaft_wall", "geometry": {"type": "conical_frustum", "origin": [x, 0., -.003], "axis": [0., 0., 1.],
             "radius_start_m": .0010572228, "radius_end_m": .0007951844, "length_m": .005}},
            {"id": hole_ref, "owner_ref": owners[1], "kind": "bore_wall", "geometry": {"type": "cylinder", "origin": [x, 0., .0115], "axis": [0., 0., 1.],
             "radius_m": .001, "axial_range_m": [-.0115, .0115]}}])
        sites.extend([
            {"id": "site:pin:" + str(i), "owner_ref": owners[0], "site_kind": "integral_pin", "role": "mounting_feature", "position": [x, 0., .002], "entry_direction": [0., 0., 1.], "feature_refs": [pin_ref]},
            {"id": "site:hole:" + str(i), "owner_ref": owners[1], "role": "housing_mount", "position": [x, 0., 0.], "entry_direction": [0., 0., 1.], "feature_refs": [hole_ref]}])
    review = {"id": "review:synthetic:pair", "configuration_ref": "configuration:synthetic:source-qpos0", "participants": [{"part_ref": owner} for owner in owners],
              "basis": ["source_bounds", "coaxial_axis_opening", "integral_pin_function_hypothesis"], "reference_mount_refs": [],
              "role_paths": [{"role": "location", "status": "hypothesis", "description": "old combined location", "component_refs": [], "evidence_refs": ["evidence:general"]},
                             {"role": "retention", "status": "unresolved", "description": "old illustrative binding", "component_refs": ["supplement:axis"], "evidence_refs": ["evidence:general"]}],
              "alternatives": [{"id": "axis-option", "label": "General example", "status": "unverified", "component_refs": ["supplement:axis"], "requirements": ["device evidence"]}]}
    base = {"features": features, "mounting_sites": sites, "connection_reviews": [review], "supplemental_components": [
        {"id": "supplement:axis", "review_ref": review["id"], "parameter_basis": "manufacturer_general_with_illustrative_dimensions"}],
        "analysis": {"limitations": ["Synthetic measurement fixture"]}}
    scene = {"parts": parts, "sources": [{"id": "SRC-0"}, {"id": "SRC-1"}], "evidence": [{"id": "evidence:0"}, {"id": "evidence:1"}]}
    return base, scene


def corrected():
    base, scene = fixture()
    data = connection_review.correct_pin_hole_analysis(base, scene)
    data.update(schema=package.PROFILE, configurations=[{"id": "configuration:synthetic:source-qpos0"}])
    return data, scene


class PinHousingFit(unittest.TestCase):
    def test_actual_overlap_and_diameters_are_finite_not_a_pressfit_assertion(self):
        data, scene = corrected()
        self.assertEqual(len(data["pin_hole_fits"]), 1)
        fit = data["pin_hole_fits"][0]
        self.assertEqual(fit["grouping"], {"kind": "reference_pair", "selection_status": "unknown"})
        self.assertAlmostEqual(fit["measurements"]["pin_spacing_m"], .016)
        self.assertAlmostEqual(fit["measurements"]["hole_spacing_m"], .016)
        for pair in fit["pairs"]:
            m = pair["measurements"]
            self.assertAlmostEqual(m["insertion_length_m"], .002)
            self.assertAlmostEqual(m["hole_diameter_m"], .002)
            self.assertAlmostEqual(m["pin_diameter_at_entry_m"], .0018, places=8)
            self.assertAlmostEqual(m["pin_diameter_at_overlap_end_m"], .0015903688)
            self.assertGreater(m["radial_clearance_at_entry_m"], 0.)
            self.assertGreater(m["radial_clearance_at_overlap_end_m"], 0.)
            self.assertEqual(pair["geometry"]["overlap_start"][2], 0.)
            self.assertAlmostEqual(pair["geometry"]["overlap_end"][2], .002)
        self.assertTrue(all(v == "unknown" for k, v in fit["assessments"].items() if k != "location"))
        package.validate_pin_hole_fits(data, scene)

    def test_full_common_reference_rotation_and_translation_are_used(self):
        base, scene = fixture()
        for part in scene["parts"]:
            part["position"] = [.1, .2, .3]
            part["quaternion"] = [math.sqrt(.5), 0., 0., math.sqrt(.5)]
        result = connection_review.correct_pin_hole_analysis(base, scene)
        fit = result["pin_hole_fits"][0]
        self.assertAlmostEqual(fit["pairs"][0]["measurements"]["insertion_length_m"], .002)
        self.assertAlmostEqual(fit["pairs"][0]["geometry"]["pin_axis"][1], -1.)

    def test_uniform_source_scaling_changes_overlap_and_diameters_together(self):
        base, scene = fixture()
        for part in scene["parts"]:
            part["scale"] = [3., 3., 3.]
        fit = connection_review.correct_pin_hole_analysis(base, scene)["pin_hole_fits"][0]
        self.assertAlmostEqual(fit["measurements"]["pin_spacing_m"], .048)
        for pair in fit["pairs"]:
            self.assertAlmostEqual(pair["measurements"]["insertion_length_m"], .006)
            self.assertAlmostEqual(pair["measurements"]["hole_diameter_m"], .006)

    def test_unrelated_neighbor_is_not_given_pin_roles_or_a_pair_record(self):
        base, scene = fixture()
        scene["parts"][1]["position"][0] = .02
        result = connection_review.correct_pin_hole_analysis(base, scene)
        self.assertEqual(result["pin_hole_fits"], [])
        self.assertEqual(result["connection_reviews"][0]["role_paths"][0]["status"], "unresolved")

    def test_unqualified_geometry_pin_does_not_acquire_an_installation_role_from_alignment(self):
        base, scene = fixture()
        for site in base["mounting_sites"]:
            if site.get("site_kind") == "integral_pin":
                site["role"] = "unqualified"
        self.assertEqual(connection_review.correct_pin_hole_analysis(base, scene)["pin_hole_fits"], [])

    def test_alternative_schematic_is_removed_from_role_and_frozen_input_is_unchanged(self):
        base, scene = fixture()
        original = deepcopy(base)
        result = connection_review.correct_pin_hole_analysis(base, scene)
        self.assertEqual(base, original)
        self.assertEqual(result["supplemental_components"][0]["usage"], "unverified_alternative")
        review = result["connection_reviews"][0]
        self.assertTrue(all(not role["component_refs"] for role in review["role_paths"]))
        self.assertIn("supplement:axis", review["alternatives"][0]["component_refs"])
        self.assertNotIn("coaxial_axis_opening", review["basis"])
        self.assertIn("pin_hole_source_fit", review["basis"])
        self.assertTrue(all(not participant.get("opening_refs") for participant in result["pin_hole_fits"][0]["participants"]))

    def test_validator_rejects_forged_measurement_cross_owner_and_retention_claims(self):
        mutations = [
            lambda data: data["pin_hole_fits"][0]["pairs"][0]["measurements"].update(insertion_length_m=.012),
            lambda data: data["pin_hole_fits"][0]["pairs"][0].update(hole_site_ref="site:pin:0"),
            lambda data: data["pin_hole_fits"][0]["assessments"].update(retention="confirmed"),
            lambda data: data["connection_reviews"][0]["role_paths"][1].update(component_refs=["supplement:axis"]),
            lambda data: data["pin_hole_fits"][0]["participants"][0]["feature_refs"].append("outer-circle"),
            lambda data: data["pin_hole_fits"][0]["measurements"].update(pin_spacing_m=.03),
            lambda data: data["supplemental_components"][0].update(usage="reference_connector"),
        ]
        for mutation in mutations:
            data, scene = corrected()
            mutation(data)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                package.validate_pin_hole_fits(data, scene)

    def test_strict_schema_rejects_invented_minimum_selection_and_missing_usage(self):
        schema = json.loads((SKILL / "schemas/source-model-1.7.schema.json").read_text(encoding="utf-8"))
        data, _ = corrected()
        fit = data["pin_hole_fits"][0]
        package.validate_shape(fit, schema["$defs"]["pin_hole_fit"], schema["$defs"])
        fit["grouping"]["min_count"] = 2
        with self.assertRaises(ValueError):
            package.validate_shape(fit, schema["$defs"]["pin_hole_fit"], schema["$defs"])
        component_schema = schema["$defs"]["supplemental_component"]
        self.assertIn("usage", component_schema["required"])
        self.assertNotIn("usage", json.loads((SKILL / "schemas/source-model-1.6.schema.json").read_text(encoding="utf-8"))["$defs"]["supplemental_component"]["required"])

    def test_new_default_preserves_the_frozen_profile_contract(self):
        self.assertEqual(package.FROZEN_PIN_FIT_PROFILE, "psop.hardware.source-model/1.7")
        self.assertEqual(package.VERSION, "3.0.0-draft.12")
        paths, capabilities = package.profile_contract(package.FROZEN_CONNECTION_PROFILE)
        self.assertEqual(paths, ("manifest-source-model-1.6.schema.json", "source-model-1.6.schema.json"))
        frozen = json.loads((SKILL / "schemas/manifest-source-model-1.6.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(capabilities, frozen["properties"]["capabilities"]["const"])


if __name__ == "__main__":
    unittest.main()
