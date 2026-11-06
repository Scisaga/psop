"""Publication contracts, source replay and independent world-placement checks."""
from __future__ import annotations
import copy
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2.package import prepare, finalize, validate, read_json, write_json, canonical, digest, local_path, LEGACY_PROFILE


def matrix(position, wxyz):
    w, x, y, z = wxyz
    length = math.sqrt(w*w + x*x + y*y + z*z)
    w, x, y, z = [n / length for n in (w, x, y, z)]
    return [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), position[0]],
            [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), position[1]],
            [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), position[2]], [0, 0, 0, 1]]


def product(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


class V2Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = TemporaryDirectory(prefix="psop-build-v2-tests-")
        cls.root = Path(cls.directory.name)
        cls.archive = REPO / "device-materials/microduck-official-materials.zip"
        cls.original_archive_hash = digest(cls.archive.read_bytes())
        cached_xml = os.environ.get("PSOP_MICRODUCK_XML")
        # Freeze the first published v2 profile independently of the new default.
        prepare(cls.archive, cls.root / "work", "microduck", "Microduck", Path(cached_xml) if cached_xml else None, profile=LEGACY_PROFILE)
        cls.result = finalize(cls.root / "work", cls.root / "published.dkp", "2.0.0-source.1")
        cls.package = cls.root / "published.dkp"
        cls.scene = read_json(cls.package / "indexes/scene.json")

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def copied_package(self, suffix):
        path = self.root / suffix
        shutil.copytree(self.package, path)
        return path

    def reseal(self, root):
        manifest = read_json(root / "manifest.json")
        manifest["files"] = [{"path": path.relative_to(root).as_posix(), "sha256": digest(path.read_bytes()), "bytes": path.stat().st_size}
                             for path in sorted(root.rglob("*")) if path.is_file() and path.name != "manifest.json"]
        manifest.pop("package_digest")
        manifest["package_digest"] = digest(canonical(manifest))
        write_json(root / "manifest.json", manifest)

    def test_real_package_sources_model_scope_and_data_only_delivery(self):
        result = validate(self.package)
        self.assertTrue(result["valid"])
        self.assertEqual(result["counts"], {"sources": 58, "geometries": 38, "parts": 70, "bodies": 15, "joints": 14, "evidence": 210})
        self.assertFalse((self.package / "apps").exists())
        knowledge = read_json(self.package / "knowledge/entities.json")
        self.assertTrue(all(p["type"] == "Part" and p["domain"] == "model" and p["id"].startswith("part:microduck:") for p in knowledge["parts"]))
        self.assertEqual(knowledge["interfaces"], [])
        self.assertEqual(knowledge["interface_connections"], [])
        self.assertEqual(result["capabilities"]["mechanical_validation"]["status"], "unavailable")
        self.assertEqual(result["capabilities"]["hardware_knowledge"]["status"], "partial")
        self.assertEqual(digest(self.archive.read_bytes()), self.original_archive_hash)
        self.assertTrue(all(not source["url"].startswith("/") for source in self.scene["sources"]))

    def test_world_transforms_match_independent_matrix_composition(self):
        root = ET.fromstring((self.package / "sources/SRC-MD-MJCF.xml").read_bytes())
        expected = []
        def walk(body, parent):
            p = [float(n) for n in body.get("pos", "0 0 0").split()]
            q = [float(n) for n in body.get("quat", "1 0 0 0").split()]
            transform = product(parent, matrix(p, q))
            for geom in body.findall("geom"):
                if geom.get("class") == "visual":
                    gp = [float(n) for n in geom.get("pos", "0 0 0").split()]
                    gq = [float(n) for n in geom.get("quat", "1 0 0 0").split()]
                    expected.append(product(transform, matrix(gp, gq)))
            for child in body.findall("body"):
                walk(child, transform)
        for body in root.findall("./worldbody/body"):
            walk(body, matrix([0, 0, 0], [1, 0, 0, 0]))
        self.assertEqual(len(expected), 70)
        for part, transform in zip(self.scene["parts"], expected):
            x, y, z, w = part["quaternion"]
            actual = matrix(part["position"], [w, x, y, z])
            for row in range(4):
                for column in range(4):
                    self.assertAlmostEqual(actual[row][column], transform[row][column], places=11)

    def test_evidence_recovers_exact_xml_and_csv_physical_lines(self):
        xml_bytes = (self.package / "sources/SRC-MD-MJCF.xml").read_bytes()
        root = ET.fromstring(xml_bytes)
        xml_lines = xml_bytes.decode("utf-8").splitlines()
        source_map = {source["id"]: source for source in self.scene["sources"]}
        proof_map = {proof["id"]: proof for proof in self.scene["evidence"]}
        for part in self.scene["parts"]:
            target = root.find("." + part["locator"].removeprefix("/mujoco"))
            self.assertEqual(target.get("mesh"), part["meshKey"])
            xml, csv, stl = [proof_map[key] for key in part["evidenceIds"]]
            self.assertEqual(xml["excerpt"], xml_lines[xml["lineStart"] - 1].strip())
            csv_lines = (self.package / source_map[csv["sourceId"]]["url"]).read_text(encoding="utf-8-sig").splitlines()
            self.assertIn(part["name"].replace("XL330 舵机", "XL330"), csv_lines[csv["lineStart"] - 1])
            self.assertEqual(stl["kind"], "source-file")

    def test_repeat_publication_is_deterministic_and_never_overwrites(self):
        second = finalize(self.root / "work", self.root / "second.dkp", "2.0.0-source.1")
        self.assertEqual(second["package_digest"], self.result["package_digest"])
        with self.assertRaisesRegex(ValueError, "new output directory"):
            finalize(self.root / "work", self.package, "2.0.0-source.2")
        with self.assertRaisesRegex(ValueError, "new work directory"):
            prepare(self.archive, self.root / "work", "microduck", "Microduck")
        self.assertEqual(validate(self.package)["package_digest"], self.result["package_digest"])

    def test_compatible_validator_code_changes_do_not_invalidate_published_snapshots(self):
        with patch("psop_build_v2.package.tool_digest", return_value="0" * 64):
            self.assertEqual(validate(self.package)["package_digest"], self.result["package_digest"])

    def test_byte_tampering_and_resealed_false_placements_are_rejected(self):
        root = self.copied_package("tampered.dkp")
        scene = read_json(root / "indexes/scene.json")
        scene["parts"][0]["position"][0] += 1
        write_json(root / "indexes/scene.json", scene)
        with self.assertRaisesRegex(ValueError, "integrity"):
            validate(root)
        self.reseal(root)
        with self.assertRaisesRegex(ValueError, "deterministic source-reference"):
            validate(root)

    def test_unknown_and_legacy_semantic_contracts_are_rejected(self):
        root = self.copied_package("legacy.dkp")
        knowledge = read_json(root / "knowledge/entities.json")
        knowledge["parts"][0]["type"] = "ComponentDefinition"
        write_json(root / "knowledge/entities.json", knowledge)
        self.reseal(root)
        with self.assertRaisesRegex(ValueError, "expected 'Part'"):
            validate(root)
        manifest = read_json(root / "manifest.json")
        manifest["schema"] = "psop.dkp/1.0"
        write_json(root / "manifest.json", manifest)
        with self.assertRaisesRegex(ValueError, "psop.dkp/2.0-draft.1"):
            validate(root)

    def test_embedded_app_extra_artifacts_and_path_escapes_are_rejected(self):
        root = self.copied_package("embedded-app.dkp")
        (root / "apps/build").mkdir(parents=True)
        (root / "apps/build/index.html").write_text("<html>retired</html>")
        self.reseal(root)
        with self.assertRaisesRegex(ValueError, "Unsupported package directory"):
            validate(root)
        for path in ("../outside", "/outside", "C:/outside", "sources\\escape", "sources/../escape"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                local_path(self.package, path)

    def test_input_lock_and_cli_retired_commands(self):
        work = self.root / "changed-work"
        shutil.copytree(self.root / "work", work)
        with (work / "inputs/materials.zip").open("ab") as stream:
            stream.write(b"changed")
        destination = self.root / "not-published.dkp"
        with self.assertRaisesRegex(ValueError, "Frozen input changed"):
            finalize(work, destination, "2.0.0-source.2")
        self.assertFalse(destination.exists())
        run = subprocess.run([sys.executable, "-B", str(SKILL / "scripts/psop_build.py"), "serve", "--dkp", str(self.package)], capture_output=True, text=True, encoding="utf-8")
        self.assertNotEqual(run.returncode, 0)
        self.assertFalse(json.loads(run.stdout)["ok"])

    def test_capability_escalation_is_rejected_even_with_recomputed_digest(self):
        root = self.copied_package("false-capability.dkp")
        manifest = read_json(root / "manifest.json")
        manifest["capabilities"]["mechanical_validation"]["status"] = "complete"
        write_json(root / "manifest.json", manifest)
        self.reseal(root)
        with self.assertRaisesRegex(ValueError, "unsupported capability"):
            validate(root)

    def test_malformed_zip_returns_json_and_cleans_unpublished_work(self):
        archive = self.root / "malformed.zip"
        archive.write_bytes(b"not a zip")
        destination = self.root / "not-prepared"
        run = subprocess.run([sys.executable, "-B", str(SKILL / "scripts/psop_build.py"), "prepare", "--input", str(archive),
                              "--work", str(destination), "--device-id", "microduck"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(run.returncode, 1)
        self.assertFalse(json.loads(run.stdout)["ok"])
        self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
