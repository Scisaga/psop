"""Archive an existing immutable DKP for Git LFS; do not rebuild or edit it."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import zipfile


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def archive_package(repo: Path, package: Path) -> Path:
    repo, package = repo.resolve(), package.resolve()
    if not package.is_relative_to(repo):
        raise ValueError("The package must be within the repository.")
    manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
    files = sorted(path for path in package.rglob("*") if path.is_file())
    expected = {item["path"]: item for item in manifest["files"]}
    if {path.relative_to(package).as_posix() for path in files} != set(expected) | {"manifest.json"}:
        raise ValueError("Package files differ from its manifest.")
    for path in files:
        if path.is_symlink() or not path.resolve().is_relative_to(package):
            raise ValueError("Package contains a symlink or external file.")
        entry = expected.get(path.relative_to(package).as_posix())
        if entry and (path.stat().st_size != entry["bytes"] or sha256(path) != entry["sha256"]):
            raise ValueError(f"Captured source bytes changed: {path.relative_to(package)}")
    output = (repo / "releases" / manifest["device"]["id"] / manifest["package_version"]).resolve()
    if not output.is_relative_to(repo / "releases") or output == repo / "releases":
        raise ValueError("Release destination leaves releases/.")
    if output.exists():
        raise FileExistsError(f"Release already exists: {output}")
    runtime = repo / ".runtime"
    runtime.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="archive-dkp-", dir=runtime) as temporary:
        staging = Path(temporary).resolve()
        if not staging.is_relative_to(runtime.resolve()):
            raise ValueError("Archive staging directory leaves .runtime/.")
        archive = staging / (package.name + ".zip")
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for path in files:
                entry = zipfile.ZipInfo(path.relative_to(package).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                entry.create_system = 3
                with path.open("rb") as source, bundle.open(entry, "w") as target:
                    shutil.copyfileobj(source, target)
        record = {key: manifest[key] for key in ("package_version", "package_digest", "created_at", "profile", "toolchain", "adapter", "inputs", "counts") if key in manifest}
        record.update({"schema": "psop.dkp-release/1.0", "device_id": manifest["device"]["id"],
                       "snapshot_id": "dkp-" + manifest["package_digest"][:20],
                       "local_package": package.relative_to(repo).as_posix(),
                       "manifest_sha256": sha256(package / "manifest.json"),
                       "archive": {"name": archive.name, "sha256": sha256(archive), "bytes": archive.stat().st_size, "file_count": len(files)}})
        (staging / "release.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        output.parent.mkdir(parents=True, exist_ok=True)
        staging.replace(output)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dkp", required=True, type=Path)
    args = parser.parse_args()
    result = archive_package(Path(__file__).resolve().parents[1], args.dkp)
    print(json.dumps({"release": str(result)}, ensure_ascii=False))
