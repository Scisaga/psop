"""Real mounting knowledge is published with explicit inputs, not fake engagement."""
from __future__ import annotations

import os
import importlib.util
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2.package import prepare, finalize, validate, read_json, write_json, canonical, digest, FROZEN_MOUNTING_PROFILE as PROFILE


class MountingPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = TemporaryDirectory(prefix="psop-mounting-publication-")
        cls.root = Path(cls.temporary.name)
        cls.xml = Path(os.environ.get("PSOP_MICRODUCK_XML", str(REPO / "build/v2/cache/microduck-reference.xml")))
        cls.assertion = SKILL / "tests/fixtures/microduck-mounting-1.0.json"
        prepare(REPO / "device-materials/microduck-official-materials.zip", cls.root / "work", "microduck", "Microduck",
                cls.xml if cls.xml.exists() else None, profile=PROFILE, assembly_knowledge=cls.assertion)
        cls.result = finalize(cls.root / "work", cls.root / "published.dkp", "2.0.0-mounting.1")
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

    def test_explicit_assertion_is_an_immutable_registered_source_and_input(self):
        self.assertEqual(PROFILE, "psop.hardware.source-model/1.4")
        manifest = read_json(self.package / "manifest.json")
        record = manifest["inputs"]["assembly_knowledge"]
        self.assertEqual(record["sha256"], digest(self.assertion.read_bytes()))
        self.assertEqual((self.package / record["path"]).read_bytes(), self.assertion.read_bytes())
        source = next(item for item in self.scene["sources"] if item["id"] == "SRC-MD-ASSEMBLY-KNOWLEDGE")
        self.assertEqual(source["digest"], record["sha256"])
        self.assertEqual(source["format"], "JSON")
        self.assertEqual(len(self.scene["sources"]), 59)
        self.assertIn("user_statement", source["text"])
        self.assertTrue(any(item["id"] == "evidence:microduck:assembly-knowledge" for item in self.scene["evidence"]))
        frozen = self.root / "work/inputs/assembly-knowledge.json"
        original = frozen.read_bytes()
        frozen.write_bytes(original + b" ")
        try:
            with self.assertRaisesRegex(ValueError, "Frozen input changed"):
                finalize(self.root / "work", self.root / "changed-input.dkp", "2.0.0-mounting.changed")
        finally:
            frozen.write_bytes(original)

    def test_eight_entry_sites_share_four_holes_and_one_functional_interface(self):
        owner = "part:microduck:0820b4025f26a004"
        interface = next(item for item in self.knowledge["mounting_interfaces"] if item["owner_ref"] == owner)
        sites = {item["id"]: item for item in self.knowledge["mounting_sites"]}
        selected = [sites[ref] for ref in interface["member_site_refs"]]
        self.assertEqual(len(selected), 8)
        self.assertEqual(len({item["hole_ref"] for item in selected}), 4)
        self.assertEqual(len({item["portal_ref"] for item in selected}), 8)
        self.assertEqual(sorted(len(side["site_refs"]) for side in interface["sides"]), [4, 4])
        self.assertEqual(interface["selection_rule"]["min_count"], 2)
        self.assertEqual(len(interface["selection_rule"]["allowed_adjacent_pairs"]), 8)
        for pair in interface["selection_rule"]["allowed_adjacent_pairs"]:
            self.assertEqual(sites[pair[0]]["side_ref"], sites[pair[1]]["side_ref"])
        part = next(part for part in self.knowledge["parts"] if part["id"] == owner)
        self.assertEqual(part["interface_status"], "mounting_knowledge_available")
        self.assertIn(interface["id"], part["mounting_interfaces"])

    def test_omitted_assertions_do_not_implicitly_reuse_a_repo_or_captured_claim(self):
        from psop_build_v2.mounting import analysis_for
        analysis = analysis_for(self.scene, self.package, None)
        self.assertTrue(analysis["mounting_sites"])
        self.assertTrue(analysis["slot_features"])
        self.assertEqual(analysis["mounting_interfaces"], [])
        self.assertEqual(analysis["reference_mounts"], [])
        self.assertTrue(all(site["status"] == "geometry_candidate" and site["role"] == "unqualified" for site in analysis["mounting_sites"]))

    def test_standard_two_site_mount_is_published_across_the_real_half_mm_gap(self):
        owners = {"part:microduck:0820b4025f26a004", "part:microduck:7f4fefc3c6de90f1"}
        mount = next(item for item in self.knowledge["reference_mounts"] if {p["part_ref"] for p in item["participants"]} == owners)
        self.assertEqual(len(mount["site_pairs"]), 2)
        self.assertTrue(all(abs(pair["axial_gap_m"] - .0005) < 1e-7 for pair in mount["site_pairs"]))
        self.assertTrue(all(pair["axis_distance_m"] < 1e-7 for pair in mount["site_pairs"]))
        self.assertEqual({p["part_ref"] for p in mount["reference_placements"]}, owners)
        self.assertTrue(all(role["status"] == "unbound" for role in mount["connector_roles"]))
        self.assertEqual(mount["assessment"]["reference_alignment"], "pass")
        self.assertTrue(all(mount["assessment"][key] == "unknown" for key in ("mechanical", "engineering", "task", "completion")))
        self.assertEqual(self.knowledge["interface_connections"], [])
        self.assertEqual(self.knowledge["configurations"][0]["mechanical_status"], "not_evaluated")

    def test_publication_reader_reads_static_build_mappings_without_enumeration_or_execution(self):
        path = SKILL / "tests/publication_query_support.py"
        spec = importlib.util.spec_from_file_location("psop_mounting_query", path)
        reader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reader)
        result = reader.query_part_pair(self.package, "part:microduck:0820b4025f26a004", "part:microduck:7f4fefc3c6de90f1")
        self.assertEqual(result["status"], "reference_matches")
        self.assertEqual(result["basis"], "published_mounting_knowledge")
        self.assertEqual(len(result["reference_mounts"]), 1)
        self.assertEqual(len(result["reference_mounts"][0]["site_pairs"]), 2)
        self.assertFalse(result["scope"]["enumeration_performed"])
        self.assertFalse(result["execution_performed"])
        self.assertTrue(all(status == "unknown" for status in result["assessment"].values()))
        self.assertTrue(any(source["id"] == "SRC-MD-ASSEMBLY-KNOWLEDGE" for source in result["geometry_context"]["sources"]))

    def test_long_slot_openings_are_measured_without_inventing_depth_or_through_status(self):
        owner = "part:microduck:7f4fefc3c6de90f1"
        slots = [item for item in self.knowledge["slot_features"] if item["owner_ref"] == owner]
        self.assertTrue(slots)
        central = [item for item in slots if abs(item["geometry"]["width_m"]-.005) < 2e-5
                   and abs(item["geometry"]["length_m"]-.010) < 2e-5]
        self.assertTrue(central)
        for item in slots:
            self.assertEqual(item["status"], "geometry_only")
            self.assertTrue(item["geometry"]["boundary_vertices"])
            self.assertNotIn("depth_m", item["geometry"])
            self.assertNotIn("through", item["geometry"])

    def test_resealed_cross_side_pairing_and_shared_hole_identity_tampering_are_rejected(self):
        def cross_side(data):
            interface = next(item for item in data["mounting_interfaces"] if len(item["sides"]) == 2)
            interface["selection_rule"]["allowed_adjacent_pairs"][0] = [interface["sides"][0]["site_refs"][0], interface["sides"][1]["site_refs"][0]]
        def change_hole(data):
            site = next(item for item in data["mounting_sites"] if item["status"] == "user_asserted")
            site["hole_ref"] = "logical-hole:missing"
        for name, mutation in (("cross-side", cross_side), ("changed-shared-hole", change_hole)):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate(self.altered(name, mutation))

    def test_reference_state_escalation_and_wrong_site_mapping_are_rejected(self):
        def upgrade(data):
            data["reference_mounts"][0]["assessment"]["completion"] = "pass"
        def mapping(data):
            mount = data["reference_mounts"][0]
            mount["site_pairs"][0]["site_refs"][1] = mount["site_pairs"][1]["site_refs"][1]
        def measurement(data):
            data["reference_mounts"][0]["site_pairs"][0]["axial_gap_m"] += .001
        for name, mutation in (("fake-completion", upgrade), ("wrong-site-mapping", mapping), ("changed-gap", measurement)):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate(self.altered(name, mutation))


if __name__ == "__main__":
    unittest.main()
