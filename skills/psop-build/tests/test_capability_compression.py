"""Lossless, deterministic gzip publication of complete capability details."""
from copy import deepcopy
import gzip
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import capability_package as publication
import test_capability_package as fixture_package


class CompressedJson(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix="psop-gzip-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.value = {"candidate": {"placement_evaluated": False, "unknown": None,
                                     "relations": [["a", "b"], ["a", "c"]]}, "label": "完整候选 · 两个关系", "radius_m": .0011}

    def test_roundtrip_and_deterministic_bytes_across_output_names(self):
        a, b = self.root/"a/details.json.gz", self.root/"b/another-name.json.gz"
        publication._write(a, self.value)
        publication._write(b, self.value)
        raw = a.read_bytes()
        self.assertEqual(raw[:2], b"\x1f\x8b")
        self.assertEqual(raw, b.read_bytes())
        self.assertEqual(raw[4:8], b"\0\0\0\0")
        self.assertEqual(raw[3] & 8, 0, "Original output filename must not enter a deterministic gzip header")
        self.assertEqual(publication._read(a), self.value)
        self.assertEqual(json.loads(gzip.decompress(raw)), self.value)

    def test_reading_uses_magic_rather_than_path_suffix(self):
        raw = json.dumps(self.value, ensure_ascii=False).encode()
        compressed_without_suffix = self.root/"opaque.json"
        compressed_without_suffix.write_bytes(gzip.compress(raw, mtime=0))
        self.assertEqual(publication._read(compressed_without_suffix), self.value)
        plain_with_suffix = self.root/"plain.json.gz"
        plain_with_suffix.write_bytes(raw)
        self.assertEqual(publication._read(plain_with_suffix), self.value)

    def test_compression_does_not_relax_duplicate_key_or_finite_number_rules(self):
        for raw in (b'{"x":1,"x":2}', b'{"x":NaN}', b'{"x":Infinity}', b'{"x":-Infinity}'):
            with self.subTest(raw=raw):
                path = self.root/"malformed.json.gz"
                path.write_bytes(gzip.compress(raw, mtime=0))
                with self.assertRaises(ValueError):
                    publication._read(path)

    def test_compressed_header_tamper_is_rejected_even_when_json_is_unchanged(self):
        path = self.root/"details.json.gz"
        publication._write(path, self.value)
        records = publication._files(self.root)
        raw = bytearray(path.read_bytes())
        raw[4] = 1  # MTIME is outside the compressed payload and CRC.
        path.write_bytes(raw)
        self.assertEqual(publication._read(path), self.value)
        with self.assertRaisesRegex(ValueError, "Frozen file changed"):
            publication._verify_files(self.root, records)

    def test_truncated_gzip_is_not_silently_read_as_json(self):
        path = self.root/"truncated.json.gz"
        path.write_bytes(gzip.compress(b'{"x":1}', mtime=0)[:-5])
        with self.assertRaises((ValueError, OSError, EOFError)):
            publication._read(path)


class CompleteCompressedShards(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture_package.FrozenCapabilities("test_complete_shards_preserve_distinct_instances_and_pairs")
        self.fixture.setUp()
        self.addCleanup(self.fixture.tearDown)
        self.root = self.fixture.root

    def test_parts_and_pairs_are_compressed_but_browsing_indexes_remain_plain(self):
        capabilities = publication._read(self.root/publication.ENTRYPOINTS["capabilities"])
        compatibility = publication._read(self.root/publication.ENTRYPOINTS["compatibility"])
        records = list(capabilities["parts"].values())+compatibility["pairs"]
        self.assertTrue(records)
        for record in records:
            path = self.root/record["path"]
            self.assertTrue(record["path"].endswith(".json.gz"))
            self.assertEqual(path.read_bytes()[:2], b"\x1f\x8b")
        for name in ("scene", "capabilities", "compatibility", "coverage"):
            path = self.root/publication.ENTRYPOINTS[name]
            self.assertNotEqual(path.read_bytes()[:2], b"\x1f\x8b")

    def test_all_candidate_relations_and_coverage_survive_compression(self):
        index = publication._read(self.root/publication.ENTRYPOINTS["compatibility"])
        candidates = []
        for record in index["pairs"]:
            detail = publication._read(self.root/record["path"])
            candidates.extend(detail["candidates"])
            self.assertEqual(len(detail["candidates"]), record["candidate_count"])
        self.assertEqual(sorted(candidates, key=lambda c: c["id"]), self.fixture.compatibility["candidates"])
        coverage = publication._read(self.root/publication.ENTRYPOINTS["coverage"])
        self.assertEqual(coverage["candidate_coverage"], self.fixture.compatibility["coverage"])
        restored = publication._validate_prepared(self.root)
        for collection in ("features", "interfaces", "resources", "frames"):
            self.assertEqual(sorted(restored["catalog"][collection], key=lambda x: x["id"]),
                             sorted(self.fixture.catalog[collection], key=lambda x: x["id"]))

    def test_candidate_deletion_after_valid_recompression_is_still_rejected(self):
        index = publication._read(self.root/publication.ENTRYPOINTS["compatibility"])
        path = self.root/index["pairs"][0]["path"]
        detail = publication._read(path)
        candidate = next(c for c in detail["candidates"] if c["mapping_family"].get("pairs"))
        candidate["mapping_family"]["pairs"].pop()
        publication._write(path, detail)
        self.assertEqual(path.read_bytes()[:2], b"\x1f\x8b")
        with self.assertRaisesRegex(ValueError, "Candidate witness, mapping"):
            publication._validate_prepared(self.root)

    def test_plain_and_gzip_shards_are_semantically_identical(self):
        index = publication._read(self.root/publication.ENTRYPOINTS["compatibility"])
        path = self.root/index["pairs"][0]["path"]
        original = publication._read(path)
        comparison = self.root/"comparison.json"
        publication._write(comparison, deepcopy(original))
        self.assertEqual(publication._read(comparison), publication._read(path))
        self.assertEqual(comparison.read_bytes(), gzip.decompress(path.read_bytes()))


if __name__ == "__main__":
    unittest.main()
