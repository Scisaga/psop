"""Publish new installation assertions without rewriting frozen profile 1.4."""
from __future__ import annotations

from copy import deepcopy
import importlib.util
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
    canonical, digest, FROZEN_PATTERNS_PROFILE as PROFILE, FROZEN_MOUNTING_PROFILE, capture_assembly_knowledge)


class MountingPatternsPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = TemporaryDirectory(prefix="psop-mounting-patterns-publication-")
        cls.root = Path(cls.temporary.name)
        cls.xml = Path(os.environ.get("PSOP_MICRODUCK_XML", str(REPO / "build/v2/cache/microduck-reference.xml")))
        cls.assertion = SKILL / "tests/fixtures/microduck-mounting-1.1.json"
        prepare(REPO / "device-materials/microduck-official-materials.zip", cls.root / "work", "microduck", "Microduck",
                cls.xml if cls.xml.exists() else None, profile=PROFILE, assembly_knowledge=cls.assertion)
        cls.result = finalize(cls.root / "work", cls.root / "published.dkp", "2.0.0-mounting-patterns.1")
        cls.package = cls.root / "published.dkp"
        cls.scene = read_json(cls.package / "indexes/scene.json")
        cls.knowledge = read_json(cls.package / "knowledge/entities.json")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def altered(self, suffix, mutation):
        root = self.root / (suffix + ".dkp")
        shutil.copytree(self.package, root)
        for filename in ("knowledge/entities.json", "indexes/scene.json"):
            data = read_json(root / filename)
            mutation(data["analysis"] if filename.startswith("indexes") else data)
            write_json(root / filename, data)
        manifest = read_json(root / "manifest.json")
        manifest["files"] = [{"path": path.relative_to(root).as_posix(), "sha256": digest(path.read_bytes()), "bytes": path.stat().st_size}
                             for path in sorted(root.rglob("*")) if path.is_file() and path.name != "manifest.json"]
        manifest.pop("package_digest")
        manifest["package_digest"] = digest(canonical(manifest))
        write_json(root / "manifest.json", manifest)
        return root

    def test_new_profile_captures_every_new_statement_as_frozen_source_and_evidence(self):
        self.assertEqual(PROFILE, "psop.hardware.source-model/1.5")
        self.assertEqual(FROZEN_MOUNTING_PROFILE, "psop.hardware.source-model/1.4")
        manifest = read_json(self.package / "manifest.json")
        self.assertEqual(manifest["profile"], PROFILE)
        record = manifest["inputs"]["assembly_knowledge"]
        self.assertEqual(record["sha256"], digest(self.assertion.read_bytes()))
        self.assertEqual((self.package / record["path"]).read_bytes(), self.assertion.read_bytes())
        declaration = read_json(self.assertion)
        evidence = {item["id"]: item for item in self.scene["evidence"]}
        for assertion in declaration["mounting_assertions"]:
            item = evidence["evidence:microduck:mounting-assertion:" + assertion["id"]]
            self.assertEqual(item["excerpt"], assertion["provenance"]["statement"])
            self.assertEqual(item["sourceId"], "SRC-MD-ASSEMBLY-KNOWLEDGE")

    def test_upper_leg_four_sites_are_distinct_from_the_known_lower_two(self):
        site_map = {site["id"]: site for site in self.knowledge["mounting_sites"]}
        for part in (part for part in self.scene["parts"] if part["meshKey"] == "leg"):
            interfaces = [item for item in self.knowledge["mounting_interfaces"] if item["owner_ref"] == part["id"]]
            lower = [item for item in interfaces if item["selection_rule"].get("min_count") == 2]
            upper = [item for item in interfaces if item["selection_rule"].get("status") == "unknown"]
            self.assertEqual(len(lower), 1)
            self.assertEqual(len(upper), 1)
            self.assertEqual(len(lower[0]["member_site_refs"]), 2)
            self.assertEqual(len(upper[0]["member_site_refs"]), 4)
            self.assertTrue(set(lower[0]["member_site_refs"]).isdisjoint(upper[0]["member_site_refs"]))
            sites = [site_map[ref] for ref in upper[0]["member_site_refs"]]
            self.assertEqual(len({site["hole_ref"] for site in sites}), 4)
            self.assertTrue(all(site["status"] == "user_asserted" and site["role"] == "bracket_mount" for site in sites))
            self.assertEqual(upper[0]["mechanism"], "unknown")
            self.assertIsNone(upper[0]["selection_rule"]["min_count"])
            self.assertEqual(upper[0]["selection_rule"]["allowed_adjacent_pairs"], [])

    def test_both_thighs_publish_real_integral_pins_instead_of_fictitious_holes(self):
        features = {item["id"]: item for item in self.knowledge["features"]}
        for key in ("upper_leg_left", "upper_leg_right"):
            part = next(part for part in self.scene["parts"] if part["meshKey"] == key)
            interfaces = [item for item in self.knowledge["mounting_interfaces"] if item["owner_ref"] == part["id"]]
            self.assertTrue(interfaces)
            sites = [site for site in self.knowledge["mounting_sites"] if site["owner_ref"] == part["id"]
                     and site["status"] == "user_asserted" and site.get("site_kind") == "integral_pin"]
            self.assertEqual(len(sites), 4)
            for site in sites:
                self.assertIsNone(site["hole_ref"])
                self.assertIsNone(site["portal_ref"])
                feature = features[site["feature_refs"][0]]
                self.assertEqual(feature["geometry"]["type"], "conical_frustum")
                self.assertEqual(feature["kind"], "shaft_wall")
                self.assertGreater(feature["geometry"]["radius_start_m"], feature["geometry"]["radius_end_m"])
            self.assertTrue(all(item["selection_rule"]["status"] == "unknown" for item in interfaces))

    def test_source_phase_mismatch_does_not_create_a_fake_aligned_upper_reference(self):
        owners = {"part:microduck:7f4fefc3c6de90f1", "part:microduck:7038a050dbc33fb0"}
        self.assertFalse(any({p["part_ref"] for p in mount["participants"]} == owners
                             for mount in self.knowledge["reference_mounts"]))
        self.assertEqual(self.knowledge["interface_connections"], [])
        self.assertEqual(len(self.knowledge["reference_mounts"]), 2)
        self.assertTrue(all(len(mount["site_pairs"]) == 2 for mount in self.knowledge["reference_mounts"]))

    def test_simulate_retains_unknown_rules_and_pin_geometry_without_executing(self):
        path = REPO / "skills/psop-simulate/scripts/psop_simulate.py"
        spec = importlib.util.spec_from_file_location("psop_mounting_patterns_query", path)
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        result = cli._dkp_query(self.package, "part:microduck:e40b9945707505e1", "part:microduck:7038a050dbc33fb0")
        self.assertEqual(result["basis"], "published_mounting_knowledge")
        self.assertTrue(any(site.get("site_kind") == "integral_pin" for site in result["mounting_sites"]))
        self.assertTrue(any(feature["geometry"]["type"] == "conical_frustum" for feature in result["geometry_context"]["features"]))
        self.assertTrue(any(mode["selection_rule"].get("status") == "unknown" for mode in result["modes"]))
        self.assertFalse(result["execution_performed"])
        self.assertFalse(result["scope"]["enumeration_performed"])
        self.assertTrue(all(status == "unknown" for status in result["assessment"].values()))

    def test_resealed_invented_minimum_and_pin_tip_displacement_are_rejected(self):
        def minimum(data):
            interface = next(item for item in data["mounting_interfaces"] if item["selection_rule"].get("status") == "unknown")
            known = next(item["selection_rule"] for item in data["mounting_interfaces"] if item["selection_rule"].get("min_count") == 2)
            interface["selection_rule"] = deepcopy(known)
        def displacement(data):
            site = next(site for site in data["mounting_sites"] if site.get("site_kind") == "integral_pin")
            site["position"][0] += .001
        for name, mutation in (("invented-subset", minimum), ("displaced-pin", displacement)):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate(self.altered(name, mutation))

    def test_resealed_false_pin_radius_and_foreign_feature_reference_are_rejected(self):
        def radius(data):
            feature = next(item for item in data["features"] if item["geometry"]["type"] == "conical_frustum")
            feature["geometry"]["radius_end_m"] += .0001
        def foreign(data):
            site = next(site for site in data["mounting_sites"] if site.get("site_kind") == "integral_pin")
            site["feature_refs"] = [next(item["id"] for item in data["features"] if item["owner_ref"] != site["owner_ref"])]
        for name, mutation in (("false-pin-radius", radius), ("foreign-pin-feature", foreign)):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate(self.altered(name, mutation))

    def test_frozen_input_mutation_is_rejected_before_publication(self):
        path = self.root / "work/inputs/assembly-knowledge.json"
        raw = path.read_bytes()
        path.write_bytes(raw + b" ")
        try:
            with self.assertRaisesRegex(ValueError, "Frozen input changed"):
                finalize(self.root / "work", self.root / "changed-input.dkp", "2.0.0-mounting-patterns.changed")
        finally:
            path.write_bytes(raw)

    def test_new_assertion_input_rejects_forged_minimum_and_wrong_legacy_contract(self):
        from psop_build_v2.mounting_patterns import validate_knowledge
        declaration = read_json(self.assertion)
        changed = deepcopy(declaration)
        changed["mounting_assertions"][0]["selection"] = {"status": "unknown", "min_count": 2}
        with self.assertRaises(ValueError):
            validate_knowledge(changed)
        with self.assertRaises(ValueError):
            capture_assembly_knowledge({"sources": [], "evidence": [], "meta": {"counts": {}}}, self.root / "invalid-capture",
                                       self.assertion, FROZEN_MOUNTING_PROFILE)


if __name__ == "__main__":
    unittest.main()
