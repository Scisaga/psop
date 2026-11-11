"""Restore a pinned release archive without changing its captured package bytes."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import tempfile
import zipfile


def _inside(root: Path, relative: str) -> Path:
    target = (root / relative).resolve()
    if target == root.resolve() or not target.is_relative_to(root.resolve()):
        raise ValueError(f"Release path leaves its destination: {relative}")
    return target


def restore_release_package(repo: Path, device_id: str) -> Path | None:
    releases = _inside(repo, "releases/" + device_id)
    records = [(json.loads(path.read_text(encoding="utf-8")), path.parent)
               for path in releases.glob("*/release.json")]
    if not records:
        return None
    record, directory = max(records, key=lambda item: item[0]["created_at"])
    if record["device_id"] != device_id:
        raise ValueError("Release device identity does not match its directory.")
    archive = _inside(directory, record["archive"]["name"])
    destination = _inside(repo, record["local_package"])
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite an existing release: {destination}")
    with archive.open("rb") as stream:
        if stream.read(128).startswith(b"version https://git-lfs.github.com/spec/v1"):
            raise ValueError("Release archive is a Git LFS pointer; run git lfs pull first.")
        stream.seek(0)
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != record["archive"]["sha256"] or archive.stat().st_size != record["archive"]["bytes"]:
        raise ValueError("Release archive bytes do not match the pinned SHA-256 and size.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Both paths are resolved within repo before any directory is moved or cleaned.
    with tempfile.TemporaryDirectory(prefix=f".{destination.name}.restore-", dir=destination.parent) as temporary:
        staging = Path(temporary).resolve()
        if not staging.is_relative_to(repo.resolve()):
            raise ValueError("Release staging directory leaves the repository.")
        with zipfile.ZipFile(archive) as package:
            members = package.infolist()
            names: set[str] = set()
            for member in members:
                name = member.filename
                path = PurePosixPath(name)
                if (not name or "\\" in name or ":" in name or path.is_absolute()
                        or ".." in path.parts or stat.S_ISLNK(member.external_attr >> 16)):
                    raise ValueError(f"Unsafe release archive entry: {name}")
                resolved = _inside(staging, path.as_posix())
                identity = str(resolved).casefold()
                if identity in names:
                    raise ValueError(f"Duplicate release archive entry: {name}")
                names.add(identity)
            if sum(not member.is_dir() for member in members) != record["archive"]["file_count"]:
                raise ValueError("Release archive file count does not match its record.")
            package.extractall(staging)
        manifest = json.loads((staging / "manifest.json").read_text(encoding="utf-8"))
        if hashlib.sha256((staging / "manifest.json").read_bytes()).hexdigest() != record["manifest_sha256"]:
            raise ValueError("Restored manifest bytes do not match the release record.")
        if (manifest["package_digest"] != record["package_digest"]
                or manifest["package_version"] != record["package_version"]
                or manifest["device"]["id"] != device_id):
            raise ValueError("Restored package identity does not match its release record.")
        staging.replace(destination)
    return destination
