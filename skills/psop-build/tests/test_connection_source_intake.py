"""Manufacturer-general examples are locked inputs, never device approvals."""
from copy import deepcopy
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2.package import (capture_assembly_knowledge, freeze_supporting_inputs,
    supporting_input_paths, read_json, write_json, digest, PROFILE, FROZEN_PATTERNS_PROFILE)


class ConnectionSourceIntake(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix="psop-connection-source-")
        self.root = Path(self.temporary.name)
        self.path = REPO / "device-materials/microduck-assembly-knowledge.json"
        self.declaration = read_json(self.path)

    def tearDown(self):
        self.temporary.cleanup()

    def scene(self):
        return {"sources": [], "evidence": [], "meta": {"counts": {}}}

    def test_capture_preserves_original_bytes_and_distinguishes_inference_and_general_examples(self):
        records = freeze_supporting_inputs(self.declaration, self.path.parent, self.root)
        paths = supporting_input_paths(records, self.declaration, self.root, published=False)
        scene = self.scene()
        capture_assembly_knowledge(scene, self.root / "capture", self.path, PROFILE, paths)
        sources = {item["id"]: item for item in scene["sources"]}
        evidence = {item["id"]: item for item in scene["evidence"]}
        for document in self.declaration["supporting_documents"]:
            source = sources[document["id"]]
            self.assertEqual(source["knowledgeScope"], "manufacturer_general")
            self.assertEqual(source["externalUrl"], document["url"])
            self.assertEqual(source["digest"], document["sha256"])
            self.assertEqual((self.root / "capture" / source["url"]).read_bytes(), (self.path.parent / document["path"]).read_bytes())
            self.assertIn("Microduck usage", evidence["evidence:microduck:supporting-document:" + document["id"]]["excerpt"])
        request = evidence["evidence:microduck:connection-review-request"]
        self.assertEqual(request["excerpt"], self.declaration["connection_review"]["statement"])
        self.assertGreater(request["lineStart"], 0)
        assertion = evidence["evidence:microduck:mounting-assertion:thigh-integral-mounting-pins"]
        self.assertIn("user did not confirm", assertion["title"])
        self.assertEqual(assertion["excerpt"], next(a["provenance"]["statement"] for a in self.declaration["mounting_assertions"] if a["id"] == "thigh-integral-mounting-pins"))

    def test_missing_or_changed_supporting_inputs_are_rejected(self):
        records = freeze_supporting_inputs(self.declaration, self.path.parent, self.root)
        with self.assertRaises(ValueError):
            supporting_input_paths(records[:-1], self.declaration, self.root, published=False)
        target = self.root / records[0]["path"]
        target.write_bytes(target.read_bytes() + b"changed")
        with self.assertRaises(ValueError):
            supporting_input_paths(records, self.declaration, self.root, published=False)

    def test_parent_path_and_source_id_collisions_do_not_expand_the_input_scope(self):
        changed = deepcopy(self.declaration)
        changed["supporting_documents"][0]["path"] = "../outside.md"
        with self.assertRaises(ValueError):
            freeze_supporting_inputs(changed, self.path.parent, self.root)
        records = freeze_supporting_inputs(self.declaration, self.path.parent, self.root)
        paths = supporting_input_paths(records, self.declaration, self.root, published=False)
        scene = self.scene()
        scene["sources"].append({"id": self.declaration["supporting_documents"][0]["id"]})
        with self.assertRaisesRegex(ValueError, "collides"):
            capture_assembly_knowledge(scene, self.root / "capture", self.path, PROFILE, paths)

    def test_fake_png_with_matching_metadata_is_not_an_image_source(self):
        changed = deepcopy(self.declaration)
        document = next(d for d in changed["supporting_documents"] if d["path"].endswith(".png"))
        fake = self.root / "fake.png"
        fake.write_bytes(b"not an image")
        document["sha256"] = digest(fake.read_bytes())
        path = self.root / "declaration.json"
        write_json(path, changed)
        paths = {d["id"]: self.path.parent / d["path"] for d in changed["supporting_documents"]}
        paths[document["id"]] = fake
        with self.assertRaisesRegex(ValueError, "actual PNG"):
            capture_assembly_knowledge(self.scene(), self.root / "capture", path, PROFILE, paths)

    def test_new_declaration_cannot_silently_enter_the_frozen_15_contract(self):
        with self.assertRaises(ValueError):
            capture_assembly_knowledge(self.scene(), self.root / "capture", self.path, FROZEN_PATTERNS_PROFILE)


if __name__ == "__main__":
    unittest.main()
