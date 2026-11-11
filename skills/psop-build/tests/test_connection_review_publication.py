"""Publish attributable complete-connection reviews without inventing a BOM."""
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
    canonical, digest, FROZEN_CONNECTION_PROFILE as PROFILE, FROZEN_PATTERNS_PROFILE)


class ConnectionReviewPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = TemporaryDirectory(prefix="psop-connection-publication-")
        cls.root = Path(cls.temporary.name)
        cls.xml = Path(os.environ.get("PSOP_MICRODUCK_XML", str(REPO / "build/v2/cache/microduck-reference.xml")))
        cls.assertion = REPO / "device-materials/microduck-assembly-knowledge.json"
        prepare(REPO / "device-materials/microduck-official-materials.zip", cls.root / "work", "microduck", "Microduck",
                cls.xml if cls.xml.exists() else None, profile=PROFILE, assembly_knowledge=cls.assertion)
        cls.result = finalize(cls.root / "work", cls.root / "published.dkp", "2.0.0-connection-review.1")
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

    def test_new_profile_preserves_captured_manufacturer_bytes_and_generic_scope(self):
        self.assertEqual(PROFILE, "psop.hardware.source-model/1.6")
        self.assertEqual(FROZEN_PATTERNS_PROFILE, "psop.hardware.source-model/1.5")
        manifest = read_json(self.package / "manifest.json")
        self.assertEqual(manifest["profile"], PROFILE)
        self.assertEqual(manifest["counts"]["parts"], 70)
        self.assertEqual(manifest["counts"]["geometries"], 38)
        documents = read_json(self.assertion)["supporting_documents"]
        locks = {item["id"]: item for item in manifest["inputs"]["supporting_documents"]}
        sources = {item["id"]: item for item in self.scene["sources"]}
        for document in documents:
            lock = locks[document["id"]]
            self.assertEqual(lock["sha256"], document["sha256"])
            self.assertEqual((self.package / lock["path"]).read_bytes(), (self.assertion.parent / document["path"]).read_bytes())
            self.assertEqual(sources[document["id"]]["knowledgeScope"], "manufacturer_general")

    def test_real_thigh_openings_are_separate_from_the_inferred_small_pin_functions(self):
        for key in ("upper_leg_left", "upper_leg_right"):
            part = next(part for part in self.scene["parts"] if part["meshKey"] == key)
            openings = [o for o in self.knowledge["circular_openings"] if o["owner_ref"] == part["id"]
                        and abs(o["geometry"]["radius_m"] - .00275) < 1e-6]
            self.assertEqual(len(openings), 2)
            self.assertTrue(all(o["status"] == "geometry_only" and o["support_triangle_indices"] for o in openings))
            self.assertTrue(any(p["owner_ref"] == part["id"] and set(p["opening_refs"]) & {o["id"] for o in openings}
                                for p in self.knowledge["passage_hypotheses"]))
            pins = [s for s in self.knowledge["mounting_sites"] if s["owner_ref"] == part["id"] and s.get("site_kind") == "integral_pin"]
            self.assertEqual(len(pins), 4)
            self.assertTrue(all(s["status"] == "project_inferred" and s["hole_ref"] is None for s in pins))
        self.assertEqual(len(self.knowledge["reference_mounts"]), 2)
        self.assertEqual(self.knowledge["interface_connections"], [])

    def test_all_pairs_have_bounded_screenings_and_complete_review_dimensions(self):
        n = len(self.knowledge["parts"])
        screenings = self.knowledge["pair_screenings"]
        self.assertEqual(len(screenings), n * (n - 1) // 2)
        self.assertEqual(len({tuple(sorted(p["part_refs"])) for p in screenings}), len(screenings))
        reviews = {item["id"]: item for item in self.knowledge["connection_reviews"]}
        for screening in screenings:
            self.assertEqual(screening["threshold_m"], .002)
            if screening["status"] == "review_required":
                review = reviews[screening["review_ref"]]
                self.assertEqual(review["screening_ref"], screening["id"])
                self.assertEqual({role["role"] for role in review["role_paths"]}, {"location", "retention", "motion"})
                self.assertTrue(all(v == "unknown" for v in review["assessments"].values()))
                self.assertTrue(review["missing_requirements"])
            else:
                self.assertIsNone(screening["review_ref"])
        thigh = "part:microduck:e40b9945707505e1"
        for servo in ("part:microduck:08c5ade0f3fd37db", "part:microduck:7038a050dbc33fb0"):
            review = next(r for r in reviews.values() if {p["part_ref"] for p in r["participants"]} == {thigh, servo})
            self.assertIn("coaxial_axis_opening", review["basis"])
            self.assertTrue(any(p["opening_refs"] for p in review["participants"] if p["part_ref"] == thigh))
            self.assertEqual(review["status"], "unresolved")

    def test_connector_schematics_are_not_source_parts_or_confirmed_bom_entities(self):
        components = self.knowledge["supplemental_components"]
        self.assertGreaterEqual(len(components), 8)
        self.assertEqual({c["kind"] for c in components}, {"screw", "cap"})
        self.assertTrue(all(c["status"] == "illustrative_unconfirmed" and c["domain"] == "synthetic"
                            and c["bom_status"] == "not_confirmed" and c["unconfirmed_fields"] for c in components))
        self.assertFalse({c["id"] for c in components} & {p["id"] for p in self.knowledge["parts"]})
        self.assertEqual(len(self.knowledge["parts"]), 70)

    def test_publication_reader_exposes_the_full_review_and_schematic_boundary_without_execution(self):
        spec = importlib.util.spec_from_file_location("psop_connection_review_query", SKILL / "tests/publication_query_support.py")
        reader = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reader)
        result = reader.query_part_pair(self.package, "part:microduck:e40b9945707505e1", "part:microduck:7038a050dbc33fb0")
        self.assertEqual(result["basis"], "published_connection_reviews")
        self.assertEqual(len(result["pair_screenings"]), 1)
        self.assertEqual(len(result["connection_reviews"]), 1)
        self.assertTrue(result["circular_openings"])
        self.assertTrue(result["passage_hypotheses"])
        self.assertTrue(result["supplemental_components"])
        self.assertEqual(result["functional_interfaces"], [])
        self.assertTrue(any(item["status"] == "project_inferred" for item in result["installation_definitions"]))
        self.assertTrue(any(mode["assertion_status"] == "project_inferred" for mode in result["modes"]))
        self.assertFalse(result["execution_performed"])
        self.assertFalse(result["scope"]["enumeration_performed"])

    def test_resealed_inferred_role_escalation_and_fake_bom_claim_are_rejected(self):
        def basis(data):
            site = next(s for s in data["mounting_sites"] if s["status"] == "project_inferred")
            site["status"] = "user_asserted"
        def bom(data):
            data["supplemental_components"][0]["bom_status"] = "confirmed"
        for name, mutate in (("role-escalation", basis), ("fake-bom", bom)):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate(self.altered(name, mutate))

    def test_resealed_missing_pair_false_separation_and_displaced_opening_are_rejected(self):
        def omitted(data): data["pair_screenings"].pop()
        def separation(data): data["pair_screenings"][0]["distance_m"] += .001
        def opening(data): data["circular_openings"][0]["geometry"]["center"][0] += .001
        for name, mutate in (("omitted-pair", omitted), ("false-separation", separation), ("moved-opening", opening)):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate(self.altered(name, mutate))

    def test_frozen_supporting_bytes_cannot_change_after_prepare(self):
        intake = read_json(self.root / "work/intake.json")
        path = self.root / "work" / intake["inputs"]["supporting_documents"][0]["path"]
        original = path.read_bytes()
        path.write_bytes(original + b" ")
        try:
            with self.assertRaisesRegex(ValueError, "Frozen input changed"):
                finalize(self.root / "work", self.root / "changed.dkp", "2.0.0-connection-review.changed")
        finally:
            path.write_bytes(original)


if __name__ == "__main__":
    unittest.main()
