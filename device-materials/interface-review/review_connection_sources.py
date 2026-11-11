"""Independent source-section checks for the two hip instances and counterparts.

The section locations below are source-local research selections, independent
of the Build detector.  This imports only the existing raw triangle/plane
section checker, never psop_build_v2 or a published structure list.
"""
from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from independent_sections import triangles, sections, check_feature, dot, sub, cross, unit

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
HIP_LEFT = "part:microduck:fa9ee2f71faafb88"
HIP_RIGHT = "part:microduck:c7eeeac0a640d191"
ACTUATORS = ("part:microduck:cd6d48fccc95df41", "part:microduck:9ffe9d5bcd6bc13a",
             "part:microduck:087d7a46a3ce4ca3", "part:microduck:08c5ade0f3fd37db")


def locate(facets, identity, center, axis, radius, kind="bore_wall"):
    matches = []
    tolerance = max(.000002, radius * .0012)
    for contour in sections(facets, axis, dot(center, axis)):
        if not contour["closed"]:
            continue
        errors = []
        for point in contour["points"]:
            relative = sub(point, center)
            radial = sub(relative, tuple(dot(relative, axis)*v for v in axis))
            errors.append(abs(math.sqrt(dot(radial, radial))-radius))
        if errors and max(errors) < tolerance:
            matches.append((contour, max(errors)))
    if len(matches) != 1:
        raise ValueError(f"{identity}: expected one independently selected closed source contour, got {len(matches)}")
    contour, error = matches[0]
    feature = {"id": identity, "kind": kind, "center_local_m": center, "axis_local": axis, "radius_m": radius,
        "tolerance_m": tolerance, "triangle_witnesses": contour["triangles"],
        "annotation_basis": "Independent raw STL triangle-plane section at the reviewed source-local location; not copied from Build candidates.",
        "next_action": "Compare both finite walls under the one fixed MJCF configuration; keep mechanism evidence and actual retention separate."}
    if kind == "bore_wall":
        result = check_feature(facets, feature)
    else:
        values = []
        for i in contour["triangles"]:
            t = facets[i]
            normal = unit(cross(sub(t[1], t[0]), sub(t[2], t[0])))
            delta = sub(tuple(sum(p[k] for p in t)/3 for k in range(3)), center)
            radial = sub(delta, tuple(dot(delta, axis)*v for v in axis))
            values.append(dot(normal, unit(radial)))
        if min(values) < .95:
            raise ValueError(identity + ": source winding does not support the selected external journal")
        result = {"id": identity, "source_triangles": len(contour["triangles"]), "closed_section": True,
            "max_radius_residual_m": error, "min_outward_radial_dot": min(values)}
    return feature, result


def run():
    parent = json.loads((HERE / "microduck-relations.json").read_text(encoding="utf-8"))
    with zipfile.ZipFile(REPO / "device-materials/microduck-official-materials.zip") as archive:
        paths = archive.namelist()
        hip_path = next(p for p in paths if "/assets/hip_l_" in p and p.endswith(".stl"))
        actuator_path = next(p for p in paths if "/assets/xl330_" in p and p.endswith(".stl"))
        bearing_path = next(p for p in paths if "/assets/seeed_bearing__configuration__22x16x4_" in p and p.endswith(".stl"))
        journal_targets = [
            ("HIP-JOURNAL-Y", [.0175, -.017525, 0.], [0., 1., 0.], .008),
            ("HIP-JOURNAL-X", [.039475, 0., 0.], [1., 0., 0.], .008)]
        annotations, report = {}, []
        for ref in (HIP_LEFT, HIP_RIGHT):
            raw = archive.read(hip_path); facets = triangles(raw)
            targets = []
            for i, (x, z) in enumerate(((.0235, 0.), (.0175, -.006), (.0175, .006), (.0115, 0.)), 1):
                targets.append((f"HIP-Y-{i}", [x, -.018025, z], [0., 1., 0.], .0012))
            for i, (y, z) in enumerate(((0., -.006), (-.006, 0.), (.006, 0.), (0., .006)), 1):
                targets.append((f"HIP-X-{i}", [.038975, y, z], [1., 0., 0.], .0012))
            features = []
            for identity, center, axis, radius in targets:
                feature, result = locate(facets, identity, center, axis, radius)
                features.append(feature); report.append({"part_ref": ref, **result})
            for identity, center, axis, radius in journal_targets:
                _, result = locate(facets, identity, center, axis, radius, "shaft_wall")
                report.append({"part_ref": ref, **result})
            annotations[ref] = {"part_ref": ref, "mesh_key": "hip_l", "source_path": hip_path, "geometry_sha256": hashlib.sha256(raw).hexdigest(),
                "regions": [], "expected_features": features}
        for ref in ACTUATORS:
            raw = archive.read(actuator_path); facets = triangles(raw); features = []
            for i, (y, z) in enumerate(((-.006, 0.), (0., -.006), (0., .006), (.006, 0.)), 1):
                feature, result = locate(facets, f"ACTUATOR-X-{i}", [-.0114, y, z], [1., 0., 0.], .0008)
                features.append(feature); report.append({"part_ref": ref, **result})
            annotations[ref] = {"part_ref": ref, "mesh_key": "xl330", "source_path": actuator_path, "geometry_sha256": hashlib.sha256(raw).hexdigest(),
                "regions": [], "expected_features": features}
        raw = archive.read(bearing_path); facets = triangles(raw)
        _, result = locate(facets, "BEARING-INNER-WALL", [0., 0., .002], [0., 0., 1.], .008)
        report.append({"mesh_key": "seeed_bearing__configuration__22x16x4", "geometry_sha256": hashlib.sha256(raw).hexdigest(), **result,
            "finding": "The complete inner wall is nominal 16 mm; 16.4 mm entry boundaries are chamfers, not the fitted bearing diameter or a manufacturing tolerance."})
    return parent, annotations, {"method": "independent-connection-source-sections/1", "parent_investigation_sha256": hashlib.sha256((HERE / "microduck-relations.json").read_bytes()).hexdigest(),
        "source_archive_sha256": hashlib.sha256((REPO / "device-materials/microduck-official-materials.zip").read_bytes()).hexdigest(), "passed": len(report), "sections": report}


if __name__ == "__main__":
    _, annotations, report = run()
    # Verification never rewrites the frozen research capture. Extra sampled
    # pairs retain their exact source SHA and original triangle witnesses.
    capture = HERE / "references/connection-source-sections.json"
    frozen = json.loads(capture.read_text(encoding="utf-8"))
    investigation = json.loads((HERE / "microduck-connection-analysis.json").read_text(encoding="utf-8"))
    samples = {s["part_ref"]: s for s in investigation["samples"]}
    checked = 0
    with zipfile.ZipFile(REPO / "device-materials/microduck-official-materials.zip") as archive:
        cached = {}
        for section in frozen.get("additional_pair_sections", []):
            sample = samples[section["part_ref"]]
            if sample["source_path"] not in cached:
                raw = archive.read(sample["source_path"])
                if hashlib.sha256(raw).hexdigest() != section["geometry_sha256"]:
                    raise ValueError("Additional connection source SHA changed")
                cached[sample["source_path"]] = triangles(raw)
            check_feature(cached[sample["source_path"]], {**section, "tolerance_m": max(.000002, section["radius_m"]*.0012)})
            checked += 1
    print(json.dumps({"core_source_sections_passed": report["passed"], "additional_pair_sections_passed": checked,
        "capture": str(capture), "capture_sha256": hashlib.sha256(capture.read_bytes()).hexdigest()}))
