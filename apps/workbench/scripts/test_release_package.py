from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from release_package import restore_release_package

REPO = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("archive_dkp", REPO / "scripts/archive_dkp.py")
archiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archiver)


class ReleasePackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repo = Path(self.temporary.name)
        self.package = self.repo / "build/test/source-1/test.dkp"
        self.package.mkdir(parents=True)
        self.source = b"unchanged source bytes\r\n\x00\xff"
        (self.package / "source.stl").write_bytes(self.source)
        self.manifest = {"device": {"id": "test"}, "package_version": "1.0", "package_digest": "a" * 64,
                         "created_at": "2026-11-10T00:00:00+00:00", "profile": "test",
                         "files": [{"path": "source.stl", "bytes": len(self.source),
                                    "sha256": hashlib.sha256(self.source).hexdigest()}]}
        (self.package / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        self.release = archiver.archive_package(self.repo, self.package)
        self.record_path = self.release / "release.json"
        self.record = json.loads(self.record_path.read_text(encoding="utf-8"))
        self.record["local_package"] = "build/restored/test.dkp"
        self.save_record()

    def save_record(self):
        self.record_path.write_text(json.dumps(self.record), encoding="utf-8")

    def replace_archive(self, entries):
        archive = self.release / self.record["archive"]["name"]
        with zipfile.ZipFile(archive, "w") as bundle:
            for name, value in entries:
                bundle.writestr(name, value)
        self.record["archive"].update(sha256=archiver.sha256(archive), bytes=archive.stat().st_size,
                                      file_count=len(entries))
        self.save_record()

    def test_restores_identical_source_and_manifest_bytes(self):
        result = restore_release_package(self.repo, "test")
        self.assertEqual((result / "source.stl").read_bytes(), self.source)
        self.assertEqual((result / "manifest.json").read_bytes(), (self.package / "manifest.json").read_bytes())
        self.assertFalse(list(result.parent.glob(".*.restore-*")))
        with self.assertRaises(FileExistsError):
            restore_release_package(self.repo, "test")

    def test_first_workspace_restores_release_before_registration(self):
        import prepare_workspace as workspace

        self.manifest["device"]["id"] = "microduck"
        (self.package / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        release = archiver.archive_package(self.repo, self.package)
        record_path = release / "release.json"
        record = json.loads(record_path.read_text(encoding="utf-8"))
        record["local_package"] = "build/microduck/source-1/test.dkp"
        record_path.write_text(json.dumps(record), encoding="utf-8")
        with (patch.object(workspace, "REPO", self.repo),
              patch.object(workspace, "REGISTRY", self.repo / "workspaces/registry.json"),
              patch.object(workspace, "command", return_value={"registered": True}) as command):
            result = workspace.prepare()
        restored = self.repo / record["local_package"]
        self.assertTrue(result["reused"])
        self.assertEqual(Path(result["dkp"]), restored)
        self.assertEqual((restored / "source.stl").read_bytes(), self.source)
        command.assert_called_once()
        self.assertIn("register", command.call_args.args[0])
        self.assertIn(str(restored), command.call_args.args[0])

    def test_archive_refuses_changed_source_and_existing_release(self):
        with self.assertRaises(FileExistsError):
            archiver.archive_package(self.repo, self.package)
        (self.package / "source.stl").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "source bytes changed"):
            archiver.archive_package(self.repo, self.package)

    def test_rejects_corrupt_archive_and_lfs_pointer(self):
        archive = self.release / self.record["archive"]["name"]
        archive.write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            restore_release_package(self.repo, "test")
        archive.write_bytes(b"version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n")
        with self.assertRaisesRegex(ValueError, "git lfs pull"):
            restore_release_package(self.repo, "test")

    def test_rejects_escape_duplicate_and_symlink_entries(self):
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for entries in ([('../outside', b'x')], [('/outside', b'x')], [('C:\\outside', b'x')],
                        [('source.stl', b'x'), ('SOURCE.stl', b'y')], [(link, b'../outside')]):
            with self.subTest(entries=str(entries)):
                self.replace_archive(entries)
                with self.assertRaises(ValueError):
                    restore_release_package(self.repo, "test")
        self.assertFalse((self.repo / "build/restored/test.dkp").exists())
        self.assertFalse(list((self.repo / "build/restored").glob(".*.restore-*")))

    def test_rejects_destination_escape_and_wrong_identity(self):
        self.record["local_package"] = "../outside"
        self.save_record()
        with self.assertRaisesRegex(ValueError, "leaves its destination"):
            restore_release_package(self.repo, "test")
        self.record["local_package"] = "build/restored/test.dkp"
        self.record["package_digest"] = "b" * 64
        self.save_record()
        with self.assertRaisesRegex(ValueError, "identity"):
            restore_release_package(self.repo, "test")


if __name__ == "__main__":
    unittest.main()
