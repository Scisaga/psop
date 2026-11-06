"""Real-source geometry, provenance, candidate semantics and package replay."""
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
    canonical, digest, CYLINDER_PROFILE as PROFILE, LEGACY_PROFILE)


class InterfacePublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = TemporaryDirectory(prefix="psop-interface-publication-")
        cls.root = Path(cls.temporary.name)
        xml = Path(os.environ.get("PSOP_MICRODUCK_XML", str(REPO / "build/v2/cache/microduck-reference.xml")))
        prepare(REPO / "device-materials/microduck-official-materials.zip", cls.root / "work",
                "microduck", "Microduck", xml if xml.exists() else None, profile=PROFILE)
        cls.result = finalize(cls.root / "work", cls.root / "published.dkp", "2.0.0-analysis.1")
        cls.package = cls.root / "published.dkp"
        cls.scene = read_json(cls.package / "indexes/scene.json")
        cls.knowledge = read_json(cls.package / "knowledge/entities.json")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def modified(self, name):
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

    def test_right_foot_has_one_grouped_stepped_bore_and_ankle_counterpart(self):
        self.assertEqual(self.result["profile"], PROFILE)
        scene = self.scene
        analysis = scene["analysis"]
        foot = next(part for part in scene["parts"] if part["meshKey"] == "foot_right")
        ankle = next(part for part in scene["parts"] if part["meshKey"] == "ankle_right")
        interfaces = [item for item in analysis["interfaces"] if item["owner_ref"] == foot["id"]]
        self.assertEqual(len(interfaces), 1)
        features = [item for item in analysis["features"] if item["id"] in interfaces[0]["feature_refs"]]
        self.assertEqual(len(features), 2)
        diameters_mm = sorted(item["geometry"]["radius_m"] * 2000 for item in features)
        self.assertAlmostEqual(diameters_mm[0], 1.6, places=4)
        self.assertAlmostEqual(diameters_mm[1], 3.0, places=4)
        lengths_mm = sorted((item["geometry"]["axial_range_m"][1] - item["geometry"]["axial_range_m"][0]) * 1000 for item in features)
        self.assertAlmostEqual(lengths_mm[0], .5, places=4)
        self.assertAlmostEqual(lengths_mm[1], 5.5, places=4)
        links = [candidate for candidate in analysis["connection_candidates"]
                 if {endpoint["part_ref"] for endpoint in candidate["endpoint_refs"]} == {foot["id"], ankle["id"]}]
        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["status"], "geometric_candidate")
        self.assertTrue(links[0]["unresolved_requirements"])
        self.assertEqual(self.knowledge["interface_connections"], [])
        self.assertEqual(self.knowledge["configurations"][0]["mechanical_status"], "not_evaluated")
        self.assertEqual(self.result["capabilities"]["interface_analysis"]["status"], "partial")
        self.assertEqual(self.result["capabilities"]["mechanical_validation"]["status"], "unavailable")

    def test_measured_features_have_finite_extent_unit_axes_and_source_triangle_identity(self):
        analysis = self.scene["analysis"]
        sources = {source["id"]: source for source in self.scene["sources"]}
        self.assertGreater(len(analysis["features"]), 0)
        self.assertGreater(analysis["analysis"]["coverage"]["parts_with_features"], 0)
        for feature in analysis["features"]:
            with self.subTest(feature=feature["id"]):
                geometry = feature["geometry"]
                self.assertAlmostEqual(sum(n*n for n in geometry["axis"]), 1, places=9)
                self.assertGreater(geometry["axial_range_m"][1], geometry["axial_range_m"][0])
                self.assertTrue(all(math.isfinite(n) for n in geometry["origin"]))
                self.assertTrue(geometry["triangle_indices"])
                self.assertEqual(feature["geometry_digest"], "sha256:" + sources[feature["geometry_source_ref"]]["digest"])
        self.assertTrue(all(item["status"] == "candidate" for item in analysis["interfaces"]))

    def test_resealed_measurement_tampering_cannot_turn_into_published_knowledge(self):
        root = self.modified("tampered-radius.dkp")
        for filename in ("knowledge/entities.json", "indexes/scene.json"):
            data = read_json(root / filename)
            analysis = data["analysis"] if filename.startswith("indexes") else data
            analysis["features"][0]["geometry"]["radius_m"] *= 2
            write_json(root / filename, data)
        self.reseal(root)
        with self.assertRaises(ValueError):
            validate(root)

    def test_candidate_cannot_be_promoted_to_confirmed_even_after_resealing(self):
        root = self.modified("fake-confirmation.dkp")
        data = read_json(root / "knowledge/entities.json")
        data["interfaces"][0]["status"] = "confirmed"
        write_json(root / "knowledge/entities.json", data)
        self.reseal(root)
        with self.assertRaises(ValueError):
            validate(root)

    def test_triangle_region_owner_and_capability_escalation_are_rejected(self):
        modifications = [
            ("geometry-region", lambda data: data["features"][0]["geometry"]["triangle_indices"].append(99999999)),
            ("foreign-owner", lambda data: data["interfaces"][0].__setitem__("owner_ref", data["parts"][-1]["id"])),
        ]
        for name, change in modifications:
            root = self.modified(name + ".dkp")
            data = read_json(root / "knowledge/entities.json")
            change(data)
            write_json(root / "knowledge/entities.json", data)
            self.reseal(root)
            with self.assertRaises(ValueError, msg=name):
                validate(root)
        root = self.modified("fake-capability.dkp")
        manifest = read_json(root / "manifest.json")
        manifest["capabilities"]["interface_analysis"]["status"] = "complete"
        manifest.pop("package_digest")
        manifest["package_digest"] = digest(canonical(manifest))
        write_json(root / "manifest.json", manifest)
        with self.assertRaises(ValueError):
            validate(root)

    def test_reference_model_relationships_are_distinct_from_mechanical_connections(self):
        relations = self.knowledge["reference_relations"]
        joint_relations = [item for item in relations if item["kind"] == "source_joint"]
        self.assertEqual(len(joint_relations), 14)
        self.assertTrue(all(item["evidence_refs"] for item in relations))
        self.assertEqual(self.knowledge["interface_connections"], [])
        self.assertNotEqual(PROFILE, LEGACY_PROFILE)


if __name__ == "__main__":
    unittest.main()
