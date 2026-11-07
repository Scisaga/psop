"""Real 1.9 publication, independent omission rejection and frozen 1.8 reading."""
from collections import Counter
from copy import deepcopy
import os
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import investigation, mechanics, package


class InvestigationPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = TemporaryDirectory(prefix="psop-investigation-publication-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.root = Path(cls.temporary.name)
        cls.work = cls.root / "work"
        cls.published = cls.root / "published.dkp"
        cls.review_path = REPO / "device-materials/interface-review/microduck-review.json"
        cls.review = package.read_json(cls.review_path)
        xml = Path(os.environ.get("PSOP_MICRODUCK_XML", str(REPO / "build/v2/cache/microduck-reference.xml")))
        cls.prepared = package.prepare(
            REPO / "device-materials/microduck-official-materials.zip", cls.work,
            "microduck", "Microduck", xml if xml.exists() else None,
            profile=package.FROZEN_INVESTIGATION_PROFILE,
            assembly_knowledge=REPO / "device-materials/microduck-assembly-knowledge.json",
            investigation=cls.review_path,
        )
        # Exercise the published-directory reader as well as the finalizer's
        # pre-publication checks, once for this class rather than per test.
        cls.result = package.finalize(cls.work, cls.published, "2.0.0-independent-investigation.test")
        cls.validated = package.validate(cls.published)
        cls.scene = package.read_json(cls.published / "indexes/scene.json")
        cls.knowledge = package.read_json(cls.published / "knowledge/entities.json")

    def matching(self, expected_id):
        return next(row for row in self.knowledge["review_coverage"]["independent_features"]["matches"] if row["id"] == expected_id)

    def annotation(self, expected_id):
        for sample in self.review["samples"]:
            for expected in sample["expected_features"]:
                if expected["id"] == expected_id:
                    return sample, expected
        self.fail("Expected independent annotation is absent: " + expected_id)

    def reseal(self, root):
        manifest = package.read_json(root / "manifest.json")
        manifest["files"] = [
            {"path": path.relative_to(root).as_posix(), "sha256": package.digest(path.read_bytes()), "bytes": path.stat().st_size}
            for path in sorted(root.rglob("*")) if path.is_file() and path.name != "manifest.json"
        ]
        manifest.pop("package_digest")
        manifest["package_digest"] = package.digest(package.canonical(manifest))
        package.write_json(root / "manifest.json", manifest)

    def test_source_bore_is_published_at_the_annotated_part_position_with_original_triangles(self):
        sample, expected = self.annotation("LS-06")
        match = self.matching("LS-06")
        self.assertEqual(match["part_ref"], "part:microduck:e27cbdd6c07a264e")
        self.assertEqual(match["center_local_m"], [.0255, -.0095, .04153])
        parts = {part["id"]: part for part in self.scene["parts"]}
        part = parts[match["part_ref"]]
        self.assertEqual(part["meshKey"], "left_shell")
        self.assertEqual(part["geometryUrl"], "sources/SRC-000022.stl")
        raw = (self.published / part["geometryUrl"]).read_bytes()
        self.assertEqual(package.digest(raw), sample["geometry_sha256"])
        self.assertFalse(any(abs(item["origin"][0] - .0255) < 1e-6 and abs(item["origin"][1] + .0095) < 1e-6
                             for item in mechanics._extract(raw)["features"]), "This must reproduce the actual frozen-detector omission")
        candidates = {item["id"]: item for item in self.knowledge["structure_candidates"]}
        self.assertTrue(match["candidate_refs"])
        for ref in match["candidate_refs"]:
            candidate = candidates[ref]
            self.assertEqual(candidate["owner_ref"], sample["part_ref"])
            self.assertEqual(candidate["geometry_source_ref"], "SRC-000022")
            self.assertEqual(candidate["geometry_sha256"], sample["geometry_sha256"])
            self.assertEqual(candidate["kind"], "bore_wall")
            self.assertEqual(candidate["geometry"]["axis"], [0., 0., 1.])
            self.assertAlmostEqual(candidate["geometry"]["center"][0], .0255, places=8)
            self.assertAlmostEqual(candidate["geometry"]["center"][1], -.0095, places=8)
            self.assertAlmostEqual(candidate["geometry"]["center"][2], .041529674083, places=8)
            self.assertAlmostEqual(candidate["geometry"]["radius_m"], .0011, places=8)
            self.assertEqual(candidate["support_triangle_indices"], expected["triangle_witnesses"])
            self.assertEqual(len(candidate["support_triangle_indices"]), 180)
            self.assertAlmostEqual(candidate["measurement"]["coverage"], 1., places=7)
            world = investigation._world(part, expected["center_local_m"])
            for actual, reference in zip(world, [.0135, .0255, .1439515]):
                self.assertAlmostEqual(actual, reference, places=8)

    def test_leg_sample_and_all_source_instances_remain_separately_addressable(self):
        matches = self.knowledge["review_coverage"]["independent_features"]
        self.assertEqual(matches["status"], "pass")
        self.assertEqual(matches["expected_count"], 11)
        self.assertEqual(matches["located_count"], 11)
        self.assertEqual(matches["missing"], [])
        candidates = {item["id"]: item for item in self.knowledge["structure_candidates"]}
        for expected_id in ("LG-01", "LG-02", "LG-03", "LG-04", "LG-05"):
            sample, expected = self.annotation(expected_id)
            match = self.matching(expected_id)
            self.assertEqual(match["part_ref"], "part:microduck:638f29b46b322e64")
            for ref in match["candidate_refs"]:
                candidate = candidates[ref]
                self.assertEqual(candidate["geometry_source_ref"], "SRC-000023")
                self.assertEqual(candidate["geometry_sha256"], sample["geometry_sha256"])
                self.assertTrue(set(candidate["support_triangle_indices"]) & set(expected["triangle_witnesses"]))
                self.assertAlmostEqual(candidate["geometry"]["radius_m"], expected["radius_m"], places=7)
                self.assertEqual(candidate["geometry"]["axis"], [1., 0., 0.])
        inventory = self.knowledge["part_investigations"]
        self.assertEqual(len(inventory), 70)
        self.assertEqual({item["part_ref"] for item in inventory}, {part["id"] for part in self.scene["parts"]})
        self.assertEqual(self.knowledge["review_coverage"]["geometry_asset_count"], 38)
        regions = {item["id"]: item for item in self.knowledge["review_regions"]}
        for item in inventory:
            self.assertEqual(item["status"], "partial")
            self.assertEqual(item["instance_context"]["motion_ownership"], "unresolved")
            self.assertTrue(item["region_refs"])
            self.assertTrue(all(regions[ref]["owner_ref"] == item["part_ref"] for ref in item["region_refs"]))
        legs = [item for item in inventory if item["geometry_source_ref"] == "SRC-000023"]
        self.assertEqual(len(legs), 2)
        self.assertNotEqual(legs[0]["instance_context"]["position"], legs[1]["instance_context"]["position"])
        self.assertTrue(set(legs[0]["candidate_refs"]).isdisjoint(legs[1]["candidate_refs"]))
        self.assertFalse(self.knowledge["review_coverage"]["region_review"]["complete"])

    def test_resealed_omission_fails_even_after_both_projections_and_statistics_are_recomputed(self):
        altered = self.root / "omitted-ls06.dkp"
        shutil.copytree(self.published, altered)
        removed = set(self.matching("LS-06")["candidate_refs"])
        self.assertTrue(removed)

        def omit(data):
            data["structure_candidates"] = [item for item in data["structure_candidates"] if item["id"] not in removed]
            for candidate in data["structure_candidates"]:
                candidate["counterpart_proposals"] = [proposal for proposal in candidate["counterpart_proposals"] if proposal["structure_ref"] not in removed]
            for part in data["part_investigations"]:
                part["candidate_refs"] = [ref for ref in part["candidate_refs"] if ref not in removed]
            coverage = data["review_coverage"]
            coverage["independent_features"] = investigation.independent_coverage(data["structure_candidates"], self.review)
            coverage["part_count"] = len(data["part_investigations"])
            coverage["geometry_asset_count"] = len({item["geometry_source_ref"] for item in data["part_investigations"]})
            coverage["function_status"] = dict(Counter(item["function_status"] for item in data["structure_candidates"]))
            counts = Counter(item["review_status"] for item in data["review_regions"])
            coverage["region_review"] = {"total": len(data["review_regions"]),
                **{status: counts[status] for status in ("reviewed", "auto_screened", "blocked", "unreviewed")}, "complete": False}
            self.assertEqual([item["id"] for item in coverage["independent_features"]["missing"]], ["LS-06"])
            self.assertEqual(coverage["independent_features"]["expected_count"], 11)
            self.assertEqual(coverage["independent_features"]["located_count"], 10)

        knowledge = deepcopy(self.knowledge)
        omit(knowledge)
        package.write_json(altered / "knowledge/entities.json", knowledge)
        scene = deepcopy(self.scene)
        omit(scene["analysis"])
        package.write_json(altered / "indexes/scene.json", scene)
        self.reseal(altered)
        with self.assertRaisesRegex(ValueError, r"Independent feature coverage missing:.*LS-06"):
            package.validate(altered)

    def test_prepared_annotation_and_original_archive_bytes_cannot_be_changed_before_finalize(self):
        for label, relative in (("annotation", "inputs/interface-investigation.json"), ("archive", "inputs/materials.zip")):
            with self.subTest(input=label):
                work = self.root / ("changed-" + label + "-work")
                shutil.copytree(self.work, work)
                locked = work / relative
                raw = locked.read_bytes()
                # Different source bytes with intact intake locks must be
                # rejected before any mechanical reconstruction is attempted.
                locked.write_bytes(raw + b"\n")
                output = self.root / ("changed-" + label + ".dkp")
                with self.assertRaisesRegex(ValueError, "Frozen input changed: " + relative):
                    package.finalize(work, output, "2.0.0-forged-input.test")
                self.assertFalse(output.exists())

    def test_geometry_review_does_not_create_functional_confirmation(self):
        candidate_refs = set(self.matching("LS-06")["candidate_refs"])
        wall = next(item for item in self.knowledge["structure_candidates"] if item["id"] in candidate_refs)
        self.assertEqual(wall["review_status"], "reviewed")
        self.assertEqual(wall["function_status"], "unknown")
        self.assertTrue(wall["missing_evidence"] and wall["next_actions"] and wall["stop_reason"])
        for key in ("interfaces", "connection_candidates", "interface_connections"):
            self.assertEqual(self.knowledge[key], [])
        manifest = package.read_json(self.published / "manifest.json")
        self.assertEqual(manifest["profile"], "psop.hardware.source-model/1.9")
        self.assertEqual(manifest["inputs"]["investigation"]["sha256"], package.digest(self.review_path.read_bytes()))
        self.assertEqual((self.published / manifest["inputs"]["investigation"]["path"]).read_bytes(), self.review_path.read_bytes())
        self.assertTrue(self.result["valid"])
        self.assertTrue(self.validated["valid"])
        self.assertEqual(self.validated["package_digest"], self.result["package_digest"])

    def test_explicit_18_contract_and_existing_historical_package_remain_readable(self):
        profile = package.FROZEN_DIRECTION_PROFILE
        self.assertEqual(profile, "psop.hardware.source-model/1.8")
        paths, capabilities = package.profile_contract(profile)
        self.assertEqual(paths, ("manifest-source-model-1.8.schema.json", "source-model-1.8.schema.json"))
        frozen_schema = package.read_json(SKILL / "schemas" / paths[0])
        self.assertEqual(capabilities, frozen_schema["properties"]["capabilities"]["const"])
        candidates = []
        if os.environ.get("PSOP_LEGACY_18_DKP"):
            candidates.append(Path(os.environ["PSOP_LEGACY_18_DKP"]))
        registry_path = REPO / "workspaces/registry.json"
        if registry_path.exists():
            registry = package.read_json(registry_path)
            candidates.extend((registry_path.parent / snapshot["path"]).resolve()
                              for workspace in registry.get("workspaces", []) for snapshot in workspace.get("snapshots", []))
        candidates.extend(path.parent for path in (REPO / "build/v2/microduck/packages").glob("*.dkp/manifest.json"))
        historical = next((path for path in candidates if (path / "manifest.json").is_file()
                           and package.read_json(path / "manifest.json").get("profile") == profile), None)
        if historical is None:
            self.skipTest("No published 1.8 snapshot is present; set PSOP_LEGACY_18_DKP for byte-preservation validation")
        before = (historical / "manifest.json").read_bytes()
        result = package.validate(historical)
        self.assertTrue(result["valid"])
        self.assertEqual(result["profile"], profile)
        self.assertEqual((historical / "manifest.json").read_bytes(), before)
        self.assertNotIn("structure_candidates", package.read_json(historical / "knowledge/entities.json"))


if __name__ == "__main__":
    unittest.main()
