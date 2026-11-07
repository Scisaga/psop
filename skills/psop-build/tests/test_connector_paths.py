"""Independent finite-geometry tests for hypothetical reference screws."""
from copy import deepcopy
import json
import math
from pathlib import Path
import sys
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import connector_paths, mounting, package
from psop_build_v2.connection_review import _supplement


def fixture(reverse=False):
    parts = [{"id": name, "position": [0., 0., 0.], "quaternion": [0., 0., 0., 1.], "scale": [1., 1., 1.]} for name in ("bracket", "housing")]
    features, holes, sites = [], [], []
    for owner, low, high, entry, role, direction in [("bracket", 0., .0018, .0018, "bracket_mount", -1.), ("housing", .0023, .0253, .0023, "housing_mount", 1.)]:
        feature = "feature:" + owner
        features.append({"id": feature, "owner_ref": owner, "kind": "bore_wall", "geometry": {"type": "cylinder", "origin": [0., 0., (low+high)/2], "axis": [0., 0., 1.], "axial_range_m": [-(high-low)/2, (high-low)/2], "radius_m": .001}})
        holes.append({"id": "hole:" + owner, "owner_ref": owner, "wall_feature_refs": [feature], "portals": [{"id": owner+":low", "position": [0., 0., low], "normal": [0., 0., -1.], "status": "opening"}, {"id": owner+":high", "position": [0., 0., high], "normal": [0., 0., 1.], "status": "opening"}]})
        sites.append({"id": "site:"+owner, "owner_ref": owner, "role": role, "hole_ref": "hole:"+owner, "position": [0., 0., entry], "entry_direction": [0., 0., direction], "feature_refs": [feature]})
    pair = {"site_refs": ["site:bracket", "site:housing"]}
    if reverse:
        pair["site_refs"].reverse(); parts.reverse(); features.reverse(); holes.reverse(); sites.reverse()
    mount = {"id": "mount", "configuration_ref": "configuration", "participants": [{"part_ref": p["id"]} for p in parts], "site_pairs": [pair]}
    identifier = "supplement:test:review:reference-screw-" + mounting._token(mount["id"]+":"+"|".join(pair["site_refs"]))
    screw = _supplement(identifier, "review", "Illustrative fastener", "screw", [0., 0., .0018], [0., 0., -1.], ["SRC"], ["E"])
    screw.update(usage="reference_connector", parameter_basis="reference_role_with_illustrative_dimensions")
    review = {"id": "review", "reference_mount_refs": ["mount"], "role_paths": [{"component_refs": [identifier]}], "alternatives": [], "missing_requirements": []}
    data = {"features": features, "logical_holes": holes, "mounting_sites": sites, "reference_mounts": [mount], "connection_reviews": [review], "supplemental_components": [screw], "analysis": {"limitations": []}}
    return data, {"parts": parts}


class ConnectorPaths(unittest.TestCase):
    def test_outer_portal_and_finite_target_replace_wrong_near_entry(self):
        data, scene = fixture(); original = deepcopy(data)
        result = connector_paths.augment_analysis(data, scene)
        self.assertEqual(data, original)
        c = result["supplemental_components"][0]
        self.assertEqual(c["pose"]["position"], [0., 0., 0.])
        self.assertEqual(c["insertion"]["entry_portal_ref"], "bracket:low")
        self.assertEqual(c["insertion"]["axis_world"], [0., 0., 1.])
        self.assertAlmostEqual(c["insertion"]["sections"][0]["range_m"][1], .0018)
        self.assertAlmostEqual(c["insertion"]["sections"][1]["range_m"][0], .0023)
        connector_paths.validate(result, scene)
        schema = json.loads((SKILL / "schemas/source-model-1.8.schema.json").read_text(encoding="utf-8"))
        package.validate_shape(c, schema["$defs"]["supplemental_component"], schema["$defs"])
        self.assertEqual(c["insertion"]["checks"]["retention"], "unknown")

    def test_reference_list_order_and_global_pose_do_not_choose_the_direction(self):
        for reverse in (False, True):
            data, scene = fixture(reverse)
            for part in scene["parts"]:
                part["position"] = [.2, -.3, .4]
                part["quaternion"] = [math.sqrt(.5), 0., 0., math.sqrt(.5)]
            result = connector_paths.augment_analysis(data, scene)
            c = result["supplemental_components"][0]
            self.assertAlmostEqual(c["insertion"]["axis_world"][1], -1.)
            self.assertEqual(c["pose"]["position"], [.2, -.3, .4])
            connector_paths.validate(result, scene)

    def test_independent_validator_rejects_reversed_short_and_falsified_paths(self):
        changes = [
            lambda c: c["pose"].update(quaternion=[1., 0., 0., 0.]),
            lambda c: c["pose"].update(position=[0., 0., .0018]),
            lambda c: c["geometry"].update(shaft_length_m=.001),
            lambda c: c["insertion"].update(entry_portal_ref="bracket:high"),
            lambda c: c["insertion"]["sections"][1].update(range_m=[.001, .03]),
            lambda c: c["insertion"]["checks"].update(retention="pass"),
            lambda c: c["insertion"].update(target_site_ref="site:bracket"),
        ]
        for change in changes:
            data, scene = fixture(); result = connector_paths.augment_analysis(data, scene)
            change(result["supplemental_components"][0])
            with self.subTest(change=change), self.assertRaises(ValueError):
                connector_paths.validate(result, scene)

    def test_insufficient_geometry_or_length_keeps_role_unbound_without_a_bad_mesh(self):
        for mismatch in ("short", "off_axis", "no_outer_opening"):
            data, scene = fixture()
            if mismatch == "short":
                data["supplemental_components"][0]["geometry"]["shaft_length_m"] = .001
            elif mismatch == "off_axis":
                next(p for p in scene["parts"] if p["id"] == "housing")["position"][0] = .01
            else:
                data["logical_holes"][0]["portals"][0]["status"] = "unresolved"
            result = connector_paths.augment_analysis(data, scene)
            self.assertEqual(result["supplemental_components"], [])
            self.assertEqual(result["connection_reviews"][0]["role_paths"][0]["component_refs"], [])
            self.assertTrue(result["connection_reviews"][0]["missing_requirements"])

    def test_historical_contracts_are_not_rewritten(self):
        self.assertEqual(package.FROZEN_DIRECTION_PROFILE, "psop.hardware.source-model/1.8")
        self.assertEqual(package.FROZEN_RELATIONSHIP_PROFILE, "psop.hardware.source-model/1.10")
        self.assertEqual(package.PROFILE, "psop.hardware.source-model/1.11")
        self.assertEqual(package.profile_contract(package.FROZEN_PIN_FIT_PROFILE)[0][1], "source-model-1.7.schema.json")
        old = json.loads((SKILL / "schemas/source-model-1.7.schema.json").read_text(encoding="utf-8"))
        self.assertNotIn("insertion", old["$defs"]["supplemental_component"]["properties"])


if __name__ == "__main__":
    unittest.main()
