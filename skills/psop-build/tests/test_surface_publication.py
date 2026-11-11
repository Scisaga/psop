"""Finite source surfaces, compound interfaces and honest snap-fit gaps."""
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
from psop_build_v2.package import (prepare, finalize, validate, read_json, write_json,
    canonical, digest, SURFACE_PROFILE as PROFILE)


class SurfacePublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = TemporaryDirectory(prefix="psop-surface-publication-")
        cls.root = Path(cls.temporary.name)
        xml = Path(os.environ.get("PSOP_MICRODUCK_XML", str(REPO / "build/v2/cache/microduck-reference.xml")))
        prepare(REPO / "device-materials/microduck-official-materials.zip", cls.root / "work",
                "microduck", "Microduck", xml if xml.exists() else None, profile=PROFILE)
        cls.result = finalize(cls.root / "work", cls.root / "published.dkp", "2.0.0-surfaces.1")
        cls.package = cls.root / "published.dkp"
        cls.scene = read_json(cls.package / "indexes/scene.json")
        cls.knowledge = read_json(cls.package / "knowledge/entities.json")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def copy(self, name):
        output = self.root / name
        shutil.copytree(self.package, output)
        return output

    def reseal(self, root):
        manifest = read_json(root / "manifest.json")
        manifest["files"] = [{"path": entry.relative_to(root).as_posix(), "sha256": digest(entry.read_bytes()),
                              "bytes": entry.stat().st_size}
                             for entry in sorted(root.rglob("*")) if entry.is_file() and entry.name != "manifest.json"]
        manifest.pop("package_digest")
        manifest["package_digest"] = digest(canonical(manifest))
        write_json(root / "manifest.json", manifest)

    def part(self, name):
        return next(part for part in self.scene["parts"] if part["meshKey"] == name)

    def surface_pair(self, first, second):
        owners = {self.part(first)["id"], self.part(second)["id"]}
        return [item for item in self.knowledge["connection_candidates"]
                if item.get("kind") == "surface_fit"
                and {endpoint["part_ref"] for endpoint in item["endpoint_refs"]} == owners]

    def test_foot_sole_enclosure_and_ankle_support_are_distinct_finite_interfaces(self):
        self.assertEqual(self.result["profile"], PROFILE)
        self.assertEqual(PROFILE, "psop.hardware.source-model/1.2")
        sole = self.part("sole_right")
        planes = [feature for feature in self.knowledge["features"]
                  if feature["owner_ref"] == sole["id"] and feature["geometry"]["type"] == "plane"]
        self.assertGreater(len(planes), 0, "Sole must no longer disappear from interface analysis")
        enclosure = self.surface_pair("foot_right", "sole_right")
        support = self.surface_pair("ankle_right", "foot_right")
        self.assertEqual(len(enclosure), 1)
        self.assertEqual(len(support), 1)
        self.assertNotEqual(enclosure[0]["id"], support[0]["id"])
        self.assertGreaterEqual(len(enclosure[0]["surface_pairs"]), 5)
        self.assertGreater(sum(pair["overlap_area_m2"] for pair in support[0]["surface_pairs"]), 400e-6)
        self.assertEqual(self.surface_pair("ankle_right", "sole_right"), [])
        interfaces = {item["id"]: item for item in self.knowledge["interfaces"]}
        for endpoint in enclosure[0]["endpoint_refs"]:
            self.assertIn("guided_enclosure", interfaces[endpoint["interface_ref"]]["mechanism_candidates"])
        self.assertEqual(self.knowledge["interface_connections"], [])
        self.assertEqual(self.knowledge["configurations"][0]["mechanical_status"], "not_evaluated")

    def test_surface_pairs_retain_both_source_owners_finite_regions_and_measurements(self):
        features = {feature["id"]: feature for feature in self.knowledge["features"]}
        sources = {source["id"]: source for source in self.scene["sources"]}
        candidates = [item for item in self.knowledge["connection_candidates"] if item.get("kind") == "surface_fit"]
        self.assertGreater(len(candidates), 0)
        for candidate in candidates:
            endpoint_owners = [endpoint["part_ref"] for endpoint in candidate["endpoint_refs"]]
            self.assertEqual(candidate["status"], "geometric_candidate")
            self.assertTrue(candidate["unresolved_requirements"])
            for pair in candidate["surface_pairs"]:
                self.assertEqual([features[ref]["owner_ref"] for ref in pair["feature_refs"]], endpoint_owners)
                self.assertGreater(pair["overlap_area_m2"], 0)
                for ref in pair["feature_refs"]:
                    feature = features[ref]
                    geometry = feature["geometry"]
                    self.assertEqual(geometry["type"], "plane")
                    self.assertTrue(geometry["triangle_indices"])
                    self.assertTrue(geometry["boundary_loops"])
                    self.assertGreater(geometry["area_m2"], 0)
                    self.assertLessEqual(pair["overlap_area_m2"], geometry["area_m2"] * 1.001)
                    self.assertAlmostEqual(sum(value * value for value in geometry["normal"]), 1, places=8)
                    self.assertTrue(all(math.isfinite(value) for value in geometry["origin"]))
                    self.assertEqual(feature["geometry_digest"], "sha256:" + sources[feature["geometry_source_ref"]]["digest"])

    def test_resealed_surface_measurement_and_wrong_pair_owner_are_rejected(self):
        cases = ("area", "foreign-endpoint", "false-retention")
        for case in cases:
            with self.subTest(case=case):
                root = self.copy(case + ".dkp")
                for filename in ("knowledge/entities.json", "indexes/scene.json"):
                    data = read_json(root / filename)
                    analysis = data["analysis"] if filename.startswith("indexes") else data
                    candidate = next(item for item in analysis["connection_candidates"] if item.get("kind") == "surface_fit")
                    if case == "area":
                        candidate["surface_pairs"][0]["overlap_area_m2"] *= 1.1
                    elif case == "foreign-endpoint":
                        refs = candidate["surface_pairs"][0]["feature_refs"]
                        refs[1] = refs[0]
                    else:
                        candidate["status"] = "retained"
                    write_json(root / filename, data)
                self.reseal(root)
                with self.assertRaises(ValueError):
                    validate(root)

    def test_surface_geometry_changes_are_not_hidden_by_new_package_digests(self):
        root = self.copy("altered-boundary.dkp")
        for filename in ("knowledge/entities.json", "indexes/scene.json"):
            data = read_json(root / filename)
            analysis = data["analysis"] if filename.startswith("indexes") else data
            feature = next(item for item in analysis["features"] if item["geometry"]["type"] == "plane")
            feature["geometry"]["boundary_loops"][0][0][0] += .001
            write_json(root / filename, data)
        self.reseal(root)
        with self.assertRaises(ValueError):
            validate(root)

    def test_similar_interfaces_are_searched_across_the_device_and_gaps_remain_per_part(self):
        self.assertEqual(len(self.surface_pair("foot_left", "sole_left")), 1)
        self.assertEqual(len(self.surface_pair("ankle_left", "foot_left")), 1)
        foot_ids = {self.part(name)["id"] for name in (
            "foot_right", "sole_right", "ankle_right", "foot_left", "sole_left", "ankle_left")}
        other_candidates = [item for item in self.knowledge["connection_candidates"]
                            if item.get("kind") == "surface_fit"
                            and all(endpoint["part_ref"] not in foot_ids for endpoint in item["endpoint_refs"])]
        self.assertTrue(other_candidates, "Surface search must apply to the full device, not a three-part allowlist")
        coverage = self.knowledge["analysis"]["coverage"]
        self.assertEqual({gap["part_ref"] for gap in coverage["part_gaps"]}, {part["id"] for part in self.scene["parts"]})
        self.assertTrue(all("snap_geometry" in gap["unresolved_types"] for gap in coverage["part_gaps"]))

    def test_local_direction_estimates_do_not_claim_retention_or_a_reachable_path(self):
        candidate = self.surface_pair("foot_right", "sole_right")[0]
        assessment = candidate["direction_assessment"]
        self.assertEqual(assessment["status"], "partial")
        self.assertEqual(assessment["frame"], "world")
        self.assertEqual(len(assessment["directions"]), 6)
        self.assertTrue(assessment["limitations"])
        self.assertIn(assessment["moving_part_ref"], {endpoint["part_ref"] for endpoint in candidate["endpoint_refs"]})
        features = {feature["id"]: feature for feature in self.knowledge["features"]}
        self.assertTrue(any(direction["result"] == "locally_blocked" for direction in assessment["directions"]))
        for direction in assessment["directions"]:
            self.assertAlmostEqual(sum(value * value for value in direction["vector"]), 1, places=9)
            self.assertEqual(direction["result"] == "locally_blocked", bool(direction["blocking_feature_refs"]))
            for reference in direction["blocking_feature_refs"]:
                self.assertEqual(features[reference]["owner_ref"], assessment["moving_part_ref"])
        self.assertEqual(self.knowledge["interface_connections"], [])

    def test_new_profile_preserves_cylindrical_measurements_without_claiming_snap_or_path_validation(self):
        foot = self.part("foot_right")
        cylinders = [feature for feature in self.knowledge["features"]
                     if feature["owner_ref"] == foot["id"] and feature["geometry"]["type"] == "cylinder"]
        self.assertEqual(len(cylinders), 2)
        self.assertEqual(sorted(round(feature["geometry"]["radius_m"] * 2000, 2) for feature in cylinders), [1.6, 3.0])
        for capability in ("interface_analysis", "connection_candidates"):
            self.assertEqual(self.result["capabilities"][capability]["status"], "partial")
        for capability in ("mechanical_validation", "engineering_validation", "path_validation"):
            self.assertEqual(self.result["capabilities"][capability]["status"], "unavailable")
        self.assertIn("plane", self.knowledge["analysis"]["coverage"]["primitive_types"])
        self.assertTrue(self.knowledge["analysis"]["limitations"])


if __name__ == "__main__":
    unittest.main()
