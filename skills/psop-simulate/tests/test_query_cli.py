"""Input/output immutability and JSON semantic integrity at the CLI boundary."""
from __future__ import annotations

from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/psop_simulate.py"
spec = importlib.util.spec_from_file_location("psop_simulate_query", SCRIPT)
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)


class QueryBoundary(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="psop-query-boundaries-")
        self.root = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def invoke(self, args):
        output = io.StringIO()
        with redirect_stdout(output):
            code = cli.main(args)
        return code, json.loads(output.getvalue())

    def test_new_output_inside_dkp_is_rejected_before_any_package_mutation(self):
        package = self.root / "immutable.dkp"
        package.mkdir()
        manifest = package / "manifest.json"
        manifest.write_bytes(b"immutable manifest witness")
        destination = package / "new" / "query.json"
        code, result = self.invoke(["query", "--dkp", str(package), "--part-a", "a", "--part-b", "b", "--output", str(destination)])
        self.assertEqual(code, 2)
        self.assertIn("immutable", result["error"]["message"])
        self.assertFalse(destination.exists())
        self.assertFalse(destination.parent.exists())
        self.assertEqual(manifest.read_bytes(), b"immutable manifest witness")

    def test_existing_output_and_definition_input_cannot_be_overwritten(self):
        definition = self.root / "definition.json"
        definition.write_text("{}", encoding="utf-8")
        existing = self.root / "result.json"
        existing.write_bytes(b"keep prior result")
        for destination in (existing, definition):
            code, result = self.invoke(["query", "--definition", str(definition), "--output", str(destination)])
            self.assertEqual(code, 2)
            self.assertEqual(result["status"], "unknown")
        self.assertEqual(existing.read_bytes(), b"keep prior result")
        self.assertEqual(definition.read_text(encoding="utf-8"), "{}")

    def test_exclusive_write_preserves_existing_file_even_after_preflight(self):
        destination = self.root / "race-result.json"
        destination.write_bytes(b"won race")
        with self.assertRaises(FileExistsError):
            cli._write_result({"ok": True}, destination)
        self.assertEqual(destination.read_bytes(), b"won race")

    def test_duplicate_definition_keys_are_not_last_wins_selection_rules(self):
        definition = self.root / "duplicate.json"
        definition.write_text('{"selection":{"min":2},"selection":{"min":0}}', encoding="utf-8")
        code, result = self.invoke(["query", "--definition", str(definition)])
        self.assertEqual(code, 2)
        self.assertIn("Duplicate", result["error"]["message"])

    def test_nonfinite_definition_numbers_are_rejected(self):
        for value in ("NaN", "Infinity", "-Infinity"):
            definition = self.root / "nonfinite.json"
            definition.write_text('{"tolerance":' + value + '}', encoding="utf-8")
            code, result = self.invoke(["query", "--definition", str(definition)])
            self.assertEqual(code, 2)
            self.assertIn("Non-finite", result["error"]["message"])


if __name__ == "__main__":
    unittest.main()
