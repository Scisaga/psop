"""Maintain reviewed input using current sources, without historical packages."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("microduck_catalog_maintenance", HERE / "author_microduck.py")
author = importlib.util.module_from_spec(spec)
spec.loader.exec_module(author)


class CatalogMaintenance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = author.DEFAULT_INPUT.read_bytes()
        cls.sha256 = hashlib.sha256(cls.original).hexdigest()

    @classmethod
    def tearDownClass(cls):
        if author.DEFAULT_INPUT.read_bytes() != cls.original:
            raise AssertionError("Maintenance changed the reviewed input's frozen bytes")

    def test_check_uses_only_current_sources_not_historical_provenance_paths(self):
        original_bytes, original_text = Path.read_bytes, Path.read_text

        def reject_history(path):
            if any(part in {"source-1.12", "source-1.13", "source-1.14"} for part in path.parts) or any(
                part in {"microduck-capabilities-1.dkp", "microduck-capabilities-2.dkp", "microduck-capabilities-3.dkp", "microduck-capabilities-4.dkp"}
                for part in path.parts
            ):
                raise AssertionError("Maintenance tried to read an old package")

        def read_bytes(path):
            reject_history(path)
            return original_bytes(path)

        def read_text(path, *args, **kwargs):
            reject_history(path)
            return original_text(path, *args, **kwargs)

        with patch.object(Path, "read_bytes", read_bytes), patch.object(Path, "read_text", read_text):
            result = author.maintain()
        self.assertEqual(result["input_sha256"], self.sha256)
        self.assertEqual(Path(result["source_package"]), author.DEFAULT_DKP)
        reviewed = json.loads(self.original)["catalog"]
        self.assertEqual(result["counts"], {key: len(reviewed[key]) for key in ("features", "interfaces", "connections")})
        self.assertNotIn("output", result)

    def test_export_preserves_the_exact_reviewed_input_bytes(self):
        with TemporaryDirectory(prefix="psop-reviewed-input-") as temporary:
            target = Path(temporary) / "revision.json"
            result = author.maintain(output=target)
            self.assertEqual(target.read_bytes(), self.original)
            self.assertEqual(result["input_sha256"], self.sha256)

    def test_existing_export_or_input_is_never_overwritten(self):
        with TemporaryDirectory(prefix="psop-reviewed-input-") as temporary:
            target = Path(temporary) / "existing.json"
            target.write_bytes(b"keep this file")
            with self.assertRaisesRegex(FileExistsError, "never overwritten"):
                author.maintain(output=target)
            self.assertEqual(target.read_bytes(), b"keep this file")
        with self.assertRaises(FileExistsError):
            author.maintain(output=author.DEFAULT_INPUT)

    def test_bad_source_digest_in_a_revision_fails_before_export(self):
        value = deepcopy(json.loads(self.original))
        value["catalog"]["features"][0]["geometry_digest"] = "sha256:"+"0"*64
        with TemporaryDirectory(prefix="psop-reviewed-input-") as temporary:
            source, target = Path(temporary) / "changed.json", Path(temporary) / "export.json"
            source.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "exact geometry source SHA"):
                author.maintain(input_path=source, output=target)
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
