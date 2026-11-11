"""Actual freeze/finalize transitions using independent finite source fixtures."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import capability_package as publication
from psop_build_v2 import package as core
from psop_build_v2.capability_catalog import PROFILE
import test_capability_package as fixture_package


class FreezePublication(unittest.TestCase):
    def setUp(self):
        # Reuse only the independently synthesized source fixture; invoke the
        # production freeze/finalize functions rather than mocking acceptance.
        self.source = fixture_package.FrozenCapabilities("test_complete_shards_preserve_distinct_instances_and_pairs")
        self.source.setUp()
        self.addCleanup(self.source.tearDown)
        self.temp = TemporaryDirectory(prefix="psop-freeze-test-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)/"work"
        self.prepared = self.work/"prepared"
        shutil.copytree(self.source.root, self.prepared)
        inputs = self.work/"inputs"
        inputs.mkdir()
        raw_inputs = {"archive": ("materials.zip", b"analytic-source-fixture-archive"),
                      "xml": ("model.xml", b"<analytic-fixture/>"),
                      "ontology": ("hardware-ontology.md", b"Independent ontology fixture\n")}
        locks = {}
        for name, (filename, raw) in raw_inputs.items():
            (inputs/filename).write_bytes(raw)
            locks[name] = {"path": "inputs/"+filename, "sha256": hashlib.sha256(raw).hexdigest()}
        self.raw_requirements = ("\n"+json.dumps(self.source.requirements, indent=4)+"\n\n").encode()
        (inputs/"capability-requirements.json").write_bytes(self.raw_requirements)
        (self.prepared/"sources/SRC-CAPABILITY-REQUIREMENTS.json").write_bytes(self.raw_requirements)
        (self.prepared/"inputs-materials.zip").write_bytes(raw_inputs["archive"][1])
        (self.prepared/"sources/SRC-PSOP-ONTOLOGY.md").write_bytes(raw_inputs["ontology"][1])
        (self.prepared/"sources/SRC-MD-MJCF.xml").write_bytes(raw_inputs["xml"][1])
        scene = publication._read(self.prepared/publication.ENTRYPOINTS["scene"])
        for part in scene["parts"]:
            part["position"] = [0., 0., 0.]
            part["quaternion"] = [0., 0., 0., 1.]
        publication._write(self.prepared/publication.ENTRYPOINTS["scene"], scene)
        # Other agents may be editing the shared builder while these fixtures
        # run. Pin that external revision; dedicated tests below explicitly
        # replace it to verify stale-tool rejection.
        tool_revision = core.tool_digest()
        tool_patch = patch.object(core, "tool_digest", return_value=tool_revision)
        tool_patch.start()
        self.addCleanup(tool_patch.stop)
        self.intake = {"profile": PROFILE, "tool": {"sha256": tool_revision},
            "inputs": locks, "requirements": {"path": "inputs/capability-requirements.json",
                "sha256": hashlib.sha256(self.raw_requirements).hexdigest()},
            "device": {"id": "fixture-device", "name": "Analytic fixture"},
            "prepared_at": "2026-11-08T00:00:00+00:00", "performance": {"prepare_seconds": 0.},
            "capability_counts": {"features": len(self.source.catalog["features"]),
                "interfaces": len(self.source.catalog["interfaces"]), "resources": len(self.source.catalog["resources"]),
                "candidates": len(self.source.compatibility["candidates"]), "instance_pairs": 1}}
        publication._write(self.work/"intake.json", self.intake)

    def destination(self, name="published"):
        return Path(self.temp.name)/name

    def test_finalize_requires_a_real_freeze(self):
        with self.assertRaises((ValueError, FileNotFoundError)):
            publication.finalize(self.work, self.destination(), "1.0.0")
        self.assertFalse(self.destination().exists())

    def test_frozen_package_validates_with_the_workbench_result_contract(self):
        prepared_scene = publication._read(self.prepared/publication.ENTRYPOINTS["scene"])
        prepared_scene["evidence"] = []
        publication._write(self.prepared/publication.ENTRYPOINTS["scene"], prepared_scene)
        for field, schema in (("sources", "psop.build.sources/2.0-draft.1"), ("evidence", "psop.build.evidence/2.0-draft.1")):
            publication._write(self.prepared/publication.ENTRYPOINTS[field], {"schema": schema, "items": prepared_scene[field]})
        publication.freeze(self.work)
        output = self.destination()
        publication.finalize(self.work, output, "1.0.0")
        scene = publication._read(output/publication.ENTRYPOINTS["scene"])
        # The fixture archive is synthetic. Supply its independently known
        # source projection while exercising real package, geometry, coverage,
        # candidate, knowledge and manifest validation to the service boundary.
        with patch.object(core, "project", return_value={"parts": scene["parts"], "sources": scene["sources"]}):
            result = publication.validate(output)
        manifest = publication._read(output/"manifest.json")
        self.assertTrue(result["ok"] and result["valid"])
        for field in ("schema", "profile", "package_id", "package_version", "package_digest", "device", "capabilities"):
            self.assertEqual(result[field], manifest[field], field)

    def test_incomplete_analysis_and_stale_tools_cannot_freeze(self):
        self.intake["analysis_status"] = "incomplete"
        publication._write(self.work/"intake.json", self.intake)
        with self.assertRaisesRegex(ValueError, "completed"):
            publication.freeze(self.work)
        self.intake.pop("analysis_status")
        self.intake["tool"]["sha256"] = "0"*64
        publication._write(self.work/"intake.json", self.intake)
        with self.assertRaisesRegex(ValueError, "Builder changed"):
            publication.freeze(self.work)
        self.assertFalse((self.work/"freeze.json").exists())

    def test_changed_input_is_rejected_before_freezing(self):
        (self.work/"inputs/materials.zip").write_bytes(b"different source")
        with self.assertRaisesRegex(ValueError, "input changed"):
            publication.freeze(self.work)

    def test_prepared_requirements_must_match_original_input_bytes(self):
        # Whitespace is semantically irrelevant but must still violate the
        # promised original-byte lock before any immutable output is published.
        path = self.prepared/"sources/SRC-CAPABILITY-REQUIREMENTS.json"
        path.write_bytes(self.raw_requirements+b" ")
        with self.assertRaisesRegex(ValueError, "[Rr]equirement|[Ii]nput|lock"):
            publication.freeze(self.work)
        self.assertFalse((self.work/"freeze.json").exists())

    def test_finalize_rechecks_work_input_locks_after_freezing(self):
        publication.freeze(self.work)
        (self.work/"inputs/capability-requirements.json").write_bytes(self.raw_requirements+b" ")
        with self.assertRaisesRegex(ValueError, "input changed"):
            publication.finalize(self.work, self.destination(), "1.0.0")
        self.assertFalse(self.destination().exists())

    def test_finalize_rejects_prepared_changes_and_unlisted_artifacts(self):
        publication.freeze(self.work)
        (self.prepared/"knowledge/unlisted.json").write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Unlisted|absent"):
            publication.finalize(self.work, self.destination(), "1.0.0")
        self.assertFalse(self.destination().exists())

    def test_finalize_rejects_stale_tool_and_modified_intake(self):
        publication.freeze(self.work)
        with patch.object(core, "tool_digest", return_value="f"*64):
            with self.assertRaisesRegex(ValueError, "builder or intake changed"):
                publication.finalize(self.work, self.destination(), "1.0.0")
        intake = deepcopy(self.intake)
        intake["device"]["name"] = "Changed after freeze"
        publication._write(self.work/"intake.json", intake)
        with self.assertRaisesRegex(ValueError, "builder or intake changed"):
            publication.finalize(self.work, self.destination(), "1.0.0")

    def test_publishing_same_freeze_is_deterministic_and_preserves_raw_requirements(self):
        first = publication.freeze(self.work)
        second = publication.freeze(self.work)
        self.assertEqual(first["digest"], second["digest"])
        before = {item["path"]: item["sha256"] for item in publication._files(self.prepared)}
        with patch.object(publication, "_validate_prepared", side_effect=AssertionError("finalize must not infer")), \
             patch("psop_build_v2.compatibility.build_candidates", side_effect=AssertionError("finalize must not discover")):
            a = publication.finalize(self.work, self.destination("a"), "1.0.0")
            b = publication.finalize(self.work, self.destination("b"), "1.0.0")
        self.assertEqual(a["package_digest"], b["package_digest"])
        after = {item["path"]: item["sha256"] for item in publication._files(self.prepared)}
        self.assertEqual(before, after)
        manifest = publication._read(self.destination("a")/"manifest.json")
        lock = manifest["inputs"]["requirements"]
        published = (self.destination("a")/lock["path"]).read_bytes()
        self.assertEqual(published, self.raw_requirements)
        self.assertEqual(hashlib.sha256(published).hexdigest(), lock["sha256"])

    def test_published_output_is_never_overwritten(self):
        publication.freeze(self.work)
        publication.finalize(self.work, self.destination(), "1.0.0")
        manifest = (self.destination()/"manifest.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "immutable"):
            publication.finalize(self.work, self.destination(), "1.0.1")
        self.assertEqual((self.destination()/"manifest.json").read_bytes(), manifest)


if __name__ == "__main__":
    unittest.main()
