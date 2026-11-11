"""Regress the missing journal relation and hidden independent bearing rings."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "skills/psop-build/scripts"))
from psop_build_v2.assembly_catalog import validate_input, validate_requirements


class BearingReferences(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = json.loads((ROOT / "device-materials/microduck-assembly-interfaces.json").read_text(encoding="utf-8"))
        cls.package = ROOT / "build/microduck/source-1.15/microduck-capabilities-9.dkp"
        cls.scene = json.loads((cls.package / "indexes/scene.json").read_text(encoding="utf-8"))

    def test_every_source_bearing_keeps_distinct_inner_and_outer_roles(self):
        features = {f["id"]: f for f in self.value["catalog"]["features"]}
        for part in (p for p in self.scene["parts"] if p["kind"] == "bearing"):
            with self.subTest(part=part["id"]):
                rings = {i["key"]: i for i in self.value["catalog"]["interfaces"] if i["owner_ref"] == part["id"]}
                self.assertIn("inner_ring", rings)
                self.assertIn("outer_ring", rings)
                for key, kind in (("inner_ring", "bore_wall"), ("outer_ring", "shaft_wall")):
                    referenced = [features[r] for m in rings[key]["members"] for r in m["feature_refs"]]
                    self.assertTrue(any(f["kind"] == kind and f["geometry"]["type"] == "cylinder" for f in referenced))
                    ends = {m["id"].split(":")[-1]: m for m in rings[key]["members"]}
                    self.assertIn("end_low", ends)
                    self.assertIn("end_high", ends)
                    self.assertGreater(ends["end_high"]["position"][2], ends["end_low"]["position"][2])
                    self.assertTrue(set(ends["end_low"]["feature_refs"]).isdisjoint(ends["end_high"]["feature_refs"]))
                    for side in ("end_low", "end_high"):
                        self.assertTrue(all(features[ref]["geometry"]["type"] in {"plane", "source_region"} for ref in ends[side]["feature_refs"]))

    def test_updated_reference_geometry_still_verifies_against_original_source_bytes(self):
        validate_input(self.value, self.scene, self.package)

    def test_interface_deletion_fails_even_when_related_connections_are_removed(self):
        for identity in ("interface:assembly:a0775b54397eb21e:inner_ring", "interface:assembly:a0775b54397eb21e:outer_ring", "interface:assembly:328011951ac11ee7:jaw_bearing_journal"):
            with self.subTest(interface=identity):
                catalog = deepcopy(self.value["catalog"])
                catalog["interfaces"] = [i for i in catalog["interfaces"] if i["id"] != identity]
                catalog["connections"] = [c for c in catalog["connections"] if all(e["interface_ref"] != identity for e in c["endpoints"])]
                with self.assertRaisesRegex(ValueError, "Missing independently required interface"):
                    validate_requirements(catalog, self.value["requirements"], self.scene)

    def test_reference_connection_deletion_does_not_pass_independent_acceptance(self):
        catalog = deepcopy(self.value["catalog"])
        catalog["connections"] = [c for c in catalog["connections"] if c["id"] != "connection:assembly:a0775b54397eb21e:jaw_journal_inner_ring"]
        with self.assertRaisesRegex(ValueError, "Missing independently required assembly connection"):
            validate_requirements(catalog, self.value["requirements"], self.scene)

    def test_reference_conflict_does_not_delete_known_roles_or_invent_pose_success(self):
        revision = self.value["provenance"]["bearing_reference_revision"]
        self.assertEqual(revision["jaw_bearing_lateral_offset_m"], .0002)
        self.assertFalse(revision["source_model_poses_modified"])
        connections = {c["id"].split(":")[-1]: c for c in self.value["catalog"]["connections"]}
        self.assertEqual(connections["jaw_journal_inner_ring"]["basis"], "declared")
        self.assertEqual(connections["jaw_outer_ring_support_seat"]["basis"], "hypothesis")
        self.assertIn("0.2", connections["jaw_journal_inner_ring"]["note"])
        self.assertNotIn("placement", connections["jaw_journal_inner_ring"])


if __name__ == "__main__":
    unittest.main()
