"""Independent jaw path and state regressions for assembly catalog/2."""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import sys
import unittest

SKILL = Path(__file__).resolve().parents[1]
REPO = SKILL.parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import assembly_catalog as catalog

JAW = "interface:assembly:328011951ac11ee7:jaw_drive"
SERVO = "interface:assembly:50f0c376d01bb0c1:servo_end_minus"
CONNECTION = "connection:assembly:328011951ac11ee7:jaw_drive"
# These correspondences were checked independently in source world coordinates.
# Display order, labels and output counts are not used to choose a partner.
EXPECTED_PATHS = {
    "hole_x_low_z_low": "hole_y_low",
    "hole_x_low_y_high": "hole_z_high",
    "hole_x_high_y_low": "hole_z_low",
    "hole_x_high_z_high": "hole_y_high",
}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def stable_digest(records):
    raw = json.dumps(sorted(records, key=lambda item: item["id"]), ensure_ascii=False,
                     sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def connection(value):
    return next(item for item in value["catalog"]["connections"] if item["id"] == CONNECTION)


def independently_check_paths(value):
    paths = connection(value).get("fastener_paths", [])
    actual = {}
    for item in paths:
        entry, receiver = item["entry"], item["receiver"]
        if entry["interface_ref"] != JAW or receiver["interface_ref"] != SERVO or entry["side"] != "high":
            raise ValueError("Independent jaw fastener path endpoint or entry side changed")
        actual[entry["member_ref"].rsplit(":", 1)[-1]] = receiver["member_ref"].rsplit(":", 1)[-1]
    if actual != EXPECTED_PATHS or len(paths) != len(EXPECTED_PATHS):
        raise ValueError("Independent jaw fastener paths are missing, repeated or remapped")


class AssemblyFastenerPaths(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ.get("PSOP_ASSEMBLY_TEST_DKP", str(
            REPO / "build/microduck/source-1.15/microduck-capabilities-9.dkp")))
        cls.scene = read(cls.root / "indexes/scene.json")
        # Always validate the retained release against its own captured input.
        cls.value = read(cls.root / "sources/SRC-MD-ASSEMBLY-CATALOG.json")
        cls.package_version = read(cls.root / "manifest.json")["package_version"]
        cls.current = read(REPO / "device-materials/microduck-assembly-interfaces.json")
        # This independent excerpt was captured before deleting the historical
        # DKP. It contains only two interfaces, eight source-bound walls and one
        # pre-confirmation connection; geometry comes from the retained package.
        cls.baseline = read(SKILL / "tests/fixtures/jaw-catalog-v1.json")
        cls.old = cls.baseline["input"]

    def test_current_source_geometry_and_all_four_explicit_paths_validate(self):
        for value in (self.value, self.current):
            self.assertEqual(value["schema"], catalog.CONNECTOR_INPUT_SCHEMA)
            catalog.validate_input(value, self.scene, self.root)
            independently_check_paths(value)

    def test_only_jaw_confirmation_changes_connection_basis(self):
        if self.package_version != "2.0.0-assembly.3":
            self.skipTest("Confirmation-only invariant belongs to retired assembly.3; later releases add reviewed relations")
        before = self.baseline["connection_basis"]
        self.assertEqual({item["id"] for item in self.value["catalog"]["connections"]}, set(before))
        for item in self.value["catalog"]["connections"]:
            if item["id"] == CONNECTION:
                self.assertEqual(item["basis"], "declared")
                self.assertNotIn("假设", item["name"])
                self.assertTrue(all(not end["member_refs"] for end in item["endpoints"]))
            else:
                self.assertEqual(item["basis"], before[item["id"]])
        unchanged = [item for item in self.value["catalog"]["connections"] if item["id"] != CONNECTION]
        self.assertEqual(stable_digest(unchanged), self.baseline["other_connections_sha256"])

    def test_confirmation_adds_evidence_without_rewriting_existing_sources(self):
        if self.package_version != "2.0.0-assembly.3":
            self.skipTest("Confirmation-only evidence count belongs to retired assembly.3")
        after = {item["id"]: item for item in self.value["evidence"]}
        for item in self.old["evidence"]:
            self.assertEqual(after[item["id"]], item)
        confirmation = "evidence:assembly:328011951ac11ee7:jaw_drive_user_confirmation"
        reference = "evidence:assembly:328011951ac11ee7:jaw_drive_reference_paths"
        prior = [item for ref, item in after.items() if ref not in {confirmation, reference}]
        self.assertEqual(len(prior), self.baseline["original_evidence_count"])
        self.assertEqual(stable_digest(prior), self.baseline["original_evidence_sha256"])
        self.assertEqual(after[reference]["kind"], "source-geometry")
        self.assertIn("不代表已选孔、实际螺钉数量或规格", after[reference]["excerpt"])
        item = after[confirmation]
        self.assertEqual(item["kind"], "user-statement")
        self.assertIn("用户本轮明确确认", item["title"])
        self.assertEqual(item["title"], item["excerpt"])
        self.assertIn("不指定实际选用哪些孔", item["excerpt"])

    def test_path_deletion_cannot_pass_by_recounting(self):
        value = deepcopy(self.value)
        connection(value)["fastener_paths"].pop()
        with self.assertRaisesRegex(ValueError, "missing, repeated or remapped"):
            independently_check_paths(value)

    def test_wrong_side_and_nonmatching_receiver_bore_are_rejected(self):
        for mutation in ("side", "receiver"):
            value = deepcopy(self.value)
            path = connection(value)["fastener_paths"][0]
            if mutation == "side":
                path["entry"]["side"] = "low"
            else:
                other = connection(value)["fastener_paths"][1]["receiver"]
                path["receiver"] = deepcopy(other)
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "wrong entry side or nonmatching"):
                catalog.validate_input(value, self.scene)

    def test_member_feature_cross_binding_and_installed_size_are_rejected(self):
        for mutation in ("member", "size"):
            value = deepcopy(self.value)
            path = connection(value)["fastener_paths"][0]
            if mutation == "member":
                path["entry"]["feature_ref"] = connection(value)["fastener_paths"][1]["entry"]["feature_ref"]
            else:
                path["dimensions"] = {"shaft_diameter_m": .002, "shaft_length_m": .006}
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                catalog.validate_input(value, self.scene)

    def test_explicit_actual_subset_cannot_reference_another_member_path(self):
        value = deepcopy(self.value)
        item = connection(value)
        item["endpoints"][0]["member_refs"] = [item["fastener_paths"][1]["entry"]["member_ref"]]
        with self.assertRaisesRegex(ValueError, "selected or unspecified endpoint"):
            catalog.validate_input(value, self.scene)

    def test_duplicate_or_excluded_paths_are_rejected(self):
        for mutation in ("duplicate", "excluded"):
            value = deepcopy(self.value)
            item = connection(value)
            if mutation == "duplicate":
                clone = deepcopy(item["fastener_paths"][0])
                clone["id"] += ":duplicate"
                item["fastener_paths"].append(clone)
            else:
                item.update(basis="incompatible", note="Independent invalid-path regression")
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                catalog.validate_input(value, self.scene)

    def test_old_catalog_stays_historical_and_rejects_new_fields(self):
        catalog.validate_input(self.old, self.scene, self.root)
        self.assertEqual(connection(self.old)["basis"], "hypothesis")
        self.assertEqual(self.old["schema"], catalog.INPUT_SCHEMA)
        value = deepcopy(self.old)
        connection(value)["fastener_paths"] = deepcopy(connection(self.value)["fastener_paths"])
        with self.assertRaises(ValueError):
            catalog.validate_input(value, self.scene)


if __name__ == "__main__":
    unittest.main()
