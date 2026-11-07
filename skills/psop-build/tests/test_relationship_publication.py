"""Real publication and source-grounded result acceptance for source-model/1.10."""
from copy import deepcopy
from pathlib import Path
import os
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import package, relationship_investigation as research


class RelationshipPublication(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = TemporaryDirectory(prefix="psop-relationship-publication-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.published = cls.root / "relationships.dkp"
        supplied = os.environ.get("PSOP_RELATIONSHIP_TEST_DKP")
        if supplied:
            shutil.copytree(Path(supplied), cls.published)
        else:
            xml = REPO / "build/v2/cache/microduck-reference.xml"
            work = cls.root / "work"
            package.prepare(REPO / "device-materials/microduck-official-materials.zip", work, "microduck", "Microduck",
                xml if xml.is_file() else None, profile=package.PROFILE,
                assembly_knowledge=REPO / "device-materials/microduck-assembly-knowledge.json",
                investigation=REPO / "device-materials/interface-review/microduck-relations.json")
            package.finalize(work, cls.published, "2.0.0-relationship-publication.test")
        cls.validated = package.validate(cls.published)
        cls.knowledge = package.read_json(cls.published / "knowledge/entities.json")
        cls.scene = package.read_json(cls.published / "indexes/scene.json")
        cls.review = package.read_json(cls.published / "sources/SRC-INTERFACE-INVESTIGATION.json")

    def reseal(self, root):
        manifest = package.read_json(root / "manifest.json")
        for entry in manifest["files"]:
            raw = (root / entry["path"]).read_bytes()
            entry.update(bytes=len(raw), sha256=package.digest(raw))
        manifest.pop("package_digest")
        manifest["package_digest"] = package.digest(package.canonical(manifest))
        package.write_json(root / "manifest.json", manifest)

    def test_independent_criteria_have_concrete_right_shell_and_new_support_part_results(self):
        self.assertTrue(self.validated["valid"])
        self.assertEqual(self.validated["profile"], "psop.hardware.source-model/1.10")
        coverage = self.knowledge["relationship_coverage"]
        self.assertEqual(coverage["expected_count"], len(self.review["expected_relations"]))
        self.assertEqual(coverage["missing"], [])
        expected_pairs = {frozenset(item["part_refs"]) for item in self.review["expected_relations"]}
        actual_pairs = {frozenset(p["part_ref"] for p in h["participants"]) for h in self.knowledge["installation_hypotheses"]}
        self.assertTrue(expected_pairs <= actual_pairs)
        self.assertIn(frozenset({"part:microduck:9d70b219a5533bf1", "part:microduck:e27cbdd6c07a264e"}), actual_pairs)
        self.assertIn(frozenset({"part:microduck:cb253f38c818b9d8", "part:microduck:cd6d48fccc95df41"}), actual_pairs)
        for hypothesis in self.knowledge["installation_hypotheses"]:
            self.assertTrue(all(p["structure_refs"] for p in hypothesis["participants"]))
            self.assertTrue(hypothesis["supporting_evidence"] and hypothesis["counterevidence"] and hypothesis["intermediate_components"])
            self.assertEqual(next(role for role in hypothesis["roles"] if role["role"] == "retention")["status"], "unknown")
        self.assertEqual(self.knowledge["interfaces"], [])
        self.assertEqual(self.knowledge["interface_connections"], [])
        self.assertEqual(coverage["engineering_confirmed_count"], 0)

    def test_real_investigated_unknown_target_stays_unfinished_with_specific_counterpart_gap(self):
        record = next(item for item in self.knowledge["investigation_records"] if item["id"] == "investigation:right-shell-z-boss")
        self.assertEqual(record["work_status"], "investigated")
        self.assertEqual(record["evidence_status"], "insufficient")
        self.assertTrue(record["actions"] and record["findings"] and record["missing_evidence"])
        self.assertEqual(record["hypothesis_refs"], [])
        self.assertTrue(record["structure_refs"])
        self.assertFalse(self.knowledge["review_coverage"]["region_review"]["complete"])

    def test_resealed_omission_is_rejected_by_frozen_relationship_acceptance_before_replay(self):
        root = self.root / "missing-relationship.dkp"
        shutil.copytree(self.published, root)
        identifier = "installation-hypothesis:right-left-shell-closure"
        knowledge, scene = deepcopy(self.knowledge), deepcopy(self.scene)
        for data in (knowledge, scene["analysis"]):
            data["installation_hypotheses"] = [item for item in data["installation_hypotheses"] if item["id"] != identifier]
            for candidate in data["structure_candidates"]:
                candidate["hypothesis_refs"] = [ref for ref in candidate["hypothesis_refs"] if ref != identifier]
            for record in data["investigation_records"]:
                record["hypothesis_refs"] = [ref for ref in record["hypothesis_refs"] if ref != identifier]
            data["relationship_coverage"] = research.expectation_coverage(data, self.review)
            self.assertEqual(data["relationship_coverage"]["expected_count"], len(self.review["expected_relations"]))
            self.assertIn("REL-RS-CLOSURE", data["relationship_coverage"]["missing"])
        package.write_json(root / "knowledge/entities.json", knowledge)
        package.write_json(root / "indexes/scene.json", scene)
        self.reseal(root)
        with self.assertRaisesRegex(ValueError, "Independent relationship coverage missing:.*REL-RS-CLOSURE"):
            package.validate(root)

    def test_generic_next_actions_cannot_replace_a_concrete_relation_result(self):
        altered = deepcopy(self.knowledge)
        altered["installation_hypotheses"] = [{"next_actions": ["Inspect CAD, BOM and drawings later"]}]
        coverage = research.expectation_coverage(altered, self.review)
        self.assertEqual(coverage["located_count"], 0)
        self.assertEqual(set(coverage["missing"]), {item["id"] for item in self.review["expected_relations"]})


if __name__ == "__main__":
    unittest.main()
