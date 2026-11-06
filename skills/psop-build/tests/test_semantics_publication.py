"""Real geometry remains available without inventing interface capability."""
from __future__ import annotations

import math
import os
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2.package import prepare, finalize, validate, read_json, write_json, canonical, digest, SEMANTIC_PROFILE as PROFILE


class SemanticPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = TemporaryDirectory(prefix="psop-semantic-publication-")
        cls.root = Path(cls.temporary.name)
        xml = Path(os.environ.get("PSOP_MICRODUCK_XML", str(REPO / "build/v2/cache/microduck-reference.xml")))
        prepare(REPO / "device-materials/microduck-official-materials.zip", cls.root / "work", "microduck", "Microduck",
                xml if xml.exists() else None, profile=PROFILE)
        cls.result = finalize(cls.root / "work", cls.root / "published.dkp", "2.0.0-semantics.1")
        cls.package = cls.root / "published.dkp"
        cls.scene = read_json(cls.package / "indexes/scene.json")
        cls.knowledge = read_json(cls.package / "knowledge/entities.json")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def part(self, mesh_key):
        return next(part for part in self.scene["parts"] if part["meshKey"] == mesh_key)

    def altered(self, suffix, mutation):
        root = self.root / (suffix + ".dkp")
        shutil.copytree(self.package, root)
        for filename in ("knowledge/entities.json", "indexes/scene.json"):
            data = read_json(root / filename)
            mutation(data["analysis"] if filename.startswith("indexes") else data)
            write_json(root / filename, data)
        manifest = read_json(root / "manifest.json")
        manifest["files"] = [{"path": item.relative_to(root).as_posix(), "sha256": digest(item.read_bytes()), "bytes": item.stat().st_size}
                             for item in sorted(root.rglob("*")) if item.is_file() and item.name != "manifest.json"]
        manifest.pop("package_digest")
        manifest["package_digest"] = digest(canonical(manifest))
        write_json(root / "manifest.json", manifest)
        return root

    def test_real_geometric_records_are_not_counted_as_functional_interfaces(self):
        self.assertEqual(PROFILE, "psop.hardware.source-model/1.3")
        data = self.knowledge
        self.assertTrue(data["features"])
        self.assertTrue(data["logical_holes"])
        self.assertTrue(data["feature_patterns"])
        self.assertTrue(data["reference_observations"])
        self.assertEqual(data["interfaces"], [])
        self.assertEqual(data["connection_candidates"], [])
        self.assertEqual(data["interface_connections"], [])
        self.assertTrue(all(part["interface_status"] == "mechanism_unconfirmed" for part in data["parts"]))
        self.assertEqual(data["configurations"][0]["connection_status"], "mechanism_unconfirmed")
        self.assertEqual(data["analysis"]["interfaces_count"], 0)
        self.assertEqual(self.result["capabilities"]["interface_analysis"]["status"], "unavailable")

    def test_step_walls_and_shared_annular_shoulder_are_one_logical_hole(self):
        foot = self.part("foot_right")
        holes = [hole for hole in self.knowledge["logical_holes"] if hole["owner_ref"] == foot["id"]]
        self.assertEqual(len(holes), 1)
        hole = holes[0]
        self.assertEqual(hole["kind"], "stepped_bore")
        self.assertEqual(len(hole["wall_feature_refs"]), 2)
        self.assertTrue(hole["topology_links"])
        self.assertEqual(hole["topology_links"][0]["kind"], "annular_shoulder")
        self.assertEqual(len(hole["topology_links"][0]["triangle_indices"]), 144)

    def test_servo_arrays_and_casing_ports_are_distinct_without_duplicate_holes(self):
        owner = "part:microduck:0820b4025f26a004"
        patterns = [pattern for pattern in self.knowledge["feature_patterns"] if pattern["owner_ref"] == owner]
        circular = [pattern for pattern in patterns if pattern["geometry"]["type"] == "circular"
                    and len(pattern["logical_hole_refs"]) == 4
                    and abs(pattern["geometry"]["pitch_circle_diameter_m"] - .012) < 1e-6]
        rectangular = [pattern for pattern in patterns if pattern["geometry"]["type"] == "rectangular"
                       and len(pattern["logical_hole_refs"]) == 4
                       and all(abs(a-b) < 1e-6 for a,b in zip(sorted(pattern["geometry"]["spacing_m"]), [.016, .030]))]
        self.assertEqual(len(circular), 2)
        self.assertEqual(len(rectangular), 2)
        self.assertEqual(set(rectangular[0]["logical_hole_refs"]), set(rectangular[1]["logical_hole_refs"]))
        self.assertNotEqual(set(rectangular[0]["portal_refs"]), set(rectangular[1]["portal_refs"]))
        for pattern in circular + rectangular:
            self.assertEqual(pattern["status"], "geometry_only")
            self.assertEqual(pattern["motion_ownership"], "unresolved")
            self.assertNotIn("modes", pattern)
            self.assertNotIn("allowed_subsets", pattern)

    def test_four_hole_parent_preserves_all_atomic_correspondences_and_source_pose(self):
        owners = {"part:microduck:0820b4025f26a004", self.part("ankle_right")["id"]}
        observations = self.knowledge["reference_observations"]
        parents = [item for item in observations if item["kind"] == "hole_pattern_alignment"
                   and {part["part_ref"] for part in item["participants"]} == owners]
        self.assertTrue(parents)
        parent = next(item for item in parents if len(item["member_observation_refs"]) == 4)
        atomic = {item["id"]: item for item in observations if item["kind"] != "hole_pattern_alignment"}
        self.assertTrue(set(parent["member_observation_refs"]) <= set(atomic))
        self.assertEqual(len(parent["member_correspondences"]), 4)
        self.assertEqual({item["part_ref"] for item in parent["reference_placements"]}, owners)
        self.assertEqual(parent["status"], "geometry_only")
        self.assertTrue(all("interface_ref" not in participant for item in observations for participant in item["participants"]))

    def test_measured_frames_and_normal_samples_do_not_create_rigidity_or_motion_claims(self):
        for part in self.knowledge["parts"]:
            self.assertNotIn("rigid_segments", part)
        for frame in self.knowledge["frames"]:
            self.assertEqual(frame["kind"], "source_geometry_measurement")
            self.assertEqual(frame["motion_ownership"], "unresolved")
            self.assertNotIn("attached_to", frame)
        observations = [item for item in self.knowledge["reference_observations"] if "normal_halfspace_test" in item]
        self.assertTrue(observations)
        for observation in observations:
            self.assertNotIn("direction_assessment", observation)
            test = observation["normal_halfspace_test"]
            self.assertEqual(test["status"], "numerical_only")
            self.assertEqual(len(test["samples"]), 6)
            for sample in test["samples"]:
                self.assertAlmostEqual(sum(value*value for value in sample["vector"]), 1, places=9)
                self.assertTrue(all(math.isfinite(value["value"]) and abs(value["value"]) <= 1 for value in sample["projections"]))
                self.assertTrue(all("blocked" not in value for value in sample["projections"]))

    def test_resealed_geometry_cannot_be_promoted_to_interface_or_functional_frame(self):
        changes = (
            ("fake-interface", lambda data: data["interfaces"].append({"id": "interface:forged"})),
            ("fake-rigid-frame", lambda data: data["frames"][0].__setitem__("attached_to", data["frames"][0]["owner_ref"] + "#housing")),
            ("fake-selection", lambda data: data["feature_patterns"][0].__setitem__("allowed_subsets", [["A", "B"]])),
        )
        for name, mutation in changes:
            with self.subTest(name=name):
                root = self.altered(name, mutation)
                with self.assertRaises(ValueError):
                    validate(root)

    def test_changed_numeric_projection_and_parent_placement_are_rejected_after_resealing(self):
        def change_projection(data):
            observation = next(item for item in data["reference_observations"] if "normal_halfspace_test" in item)
            projection = observation["normal_halfspace_test"]["samples"][0]["projections"][0]
            projection["value"] = .123456
        def change_parent(data):
            parent = next(item for item in data["reference_observations"] if item["kind"] == "hole_pattern_alignment")
            parent["reference_placements"][0]["position"][0] += .001
        for name, mutation in (("false-dot", change_projection), ("false-pose", change_parent)):
            with self.subTest(name=name):
                root = self.altered(name, mutation)
                with self.assertRaises(ValueError):
                    validate(root)


if __name__ == "__main__":
    unittest.main()
