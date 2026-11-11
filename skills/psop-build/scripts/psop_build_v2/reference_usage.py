"""Independent functional-use coverage, separate from mesh/candidate coverage.

An attributed device review declares expected interfaces, source regions and
reference uses. This validator never infers a fixed connection from proximity.
"""
import hashlib
import json
from itertools import combinations
from pathlib import Path

SCHEMA = "psop.reference-use-review/1"
DISPOSITIONS = {"reference_use_recorded", "reference_conflict_recorded", "not_observed_used_in_input", "use_unresolved"}


def validate_reference_uses(catalog, scene, root, requirements):
    lock = requirements.get("reference_uses")
    if lock is None:
        return None
    sources = {s["id"]: s for s in scene["sources"]}
    source = sources.get(lock["source_ref"])
    if source is None or source["digest"] != lock["sha256"]:
        raise ValueError("Independent reference-use review source is missing or changed")
    from .package import local_path, validate_shape
    raw = local_path(Path(root), source["url"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != lock["sha256"]:
        raise ValueError("Independent reference-use review bytes changed")
    review = json.loads(raw)
    validate_shape(review, json.loads((Path(__file__).resolve().parents[2]/"schemas/reference-use-review-1.schema.json").read_text(encoding="utf-8")))
    if review.get("schema") != SCHEMA or review.get("device_id") != scene["meta"].get("deviceId"):
        raise ValueError("Reference-use review belongs to another contract/device")
    parts = {p["id"]: p for p in scene["parts"]}
    entries = review.get("parts", [])
    if len(entries) != len(parts) or {p["owner_ref"] for p in entries} != set(parts):
        raise ValueError("Independent functional-use review must cover every source instance")
    interfaces = {i["id"]: i for i in catalog["interfaces"]}
    features = {f["id"]: f for f in catalog["features"]}
    connections = {c["id"]: c for c in catalog["reference_connections"]}
    semantic = {i["id"] for i in interfaces.values() if i.get("capability_basis") != "geometry_hypothesis"}
    expected_interfaces, outputs = set(), []
    for part in entries:
        owner = part["owner_ref"]
        sid = part["source_ref"]
        if sid not in parts[owner]["sourceIds"] or sources[sid]["digest"] != part["source_sha256"] or not part.get("summary"):
            raise ValueError("Functional-use review lacks its exact source identity or explanation")
        refs = part.get("required_interface_refs", [])
        if len(set(refs)) != len(refs) or any(ref not in interfaces or interfaces[ref]["owner_ref"] != owner for ref in refs):
            raise ValueError("Independently required functional interface is missing or belongs to another part")
        expected_interfaces.update(refs)
        dispositions = part.get("interface_dispositions", [])
        if len(dispositions) != len(refs) or {d["interface_ref"] for d in dispositions} != set(refs):
            raise ValueError("Every functional interface needs an independent reference-use disposition")
        for disposition in dispositions:
            ref = disposition["interface_ref"]
            actual = {c["id"] for c in connections.values() if any(e["interface_ref"] == ref for e in c["endpoints"])}
            if disposition.get("status") not in DISPOSITIONS or set(disposition.get("connection_refs", [])) != actual:
                raise ValueError("Functional-use disposition loses or invents a reference relation")
            if disposition["status"] in {"reference_use_recorded", "reference_conflict_recorded"} and not actual:
                raise ValueError("A recorded functional use needs a concrete reference relation")
            if actual and disposition["status"] == "not_observed_used_in_input":
                raise ValueError("A recorded reference use cannot be relabeled unobserved")
        outputs.append({"owner_ref": owner, "summary": part["summary"], "open_items": part.get("open_items", []),
            "scope": review["scope"], "source_ref": source["id"],
            "interface_dispositions": [{**d, "name": interfaces[d["interface_ref"]]["name"]} for d in dispositions]})
    if expected_interfaces != semantic:
        raise ValueError("Functional-use review omits or invents a semantic interface")
    expected_connections = review.get("required_connections", [])
    if len({c["id"] for c in expected_connections}) != len(expected_connections) or {c["id"] for c in expected_connections} != set(connections):
        raise ValueError("Independent reference-use connection coverage is incomplete")
    for expected in expected_connections:
        actual = connections[expected["id"]]
        if actual["endpoints"] != expected["endpoints"] or actual["mechanism"] != expected["mechanism"]:
            raise ValueError("Independently required reference member mapping or mechanism changed")
    for witness in review.get("required_surface_regions", []):
        interface = interfaces.get(witness["interface_ref"])
        if interface is None or interface["owner_ref"] != witness["owner_ref"]:
            raise ValueError("Independent functional surface has no matching interface")
        refs = {ref for member in interface["members"] for ref in member["feature_refs"]}
        triangles = {t for ref in refs for t in features[ref]["geometry"]["triangle_indices"]}
        required = set(witness["triangle_indices"])
        if not required or len(required & triangles)/len(required)+1e-12 < witness.get("minimum_coverage", 1.):
            raise ValueError("Independently required functional surface region is missing")
    observations = review.get("surface_pair_dispositions", [])
    if len({tuple(x["owner_refs"]) for x in observations}) != len(observations) or any(not x.get("reason") or x.get("status") not in {
        "existing_reference_use", "added_reference_use", "clearance_or_motion_neighbor", "unresolved_proxy_contact"} for x in observations):
        raise ValueError("Raw reference observations need explicit functional dispositions")
    raw_source = next((s for s in sources.values() if s["digest"] == review.get("raw_surface_review_sha256")), None)
    if raw_source is None:
        raise ValueError("Independent raw reference observations were not captured")
    raw_bytes = local_path(Path(root), raw_source["url"]).read_bytes()
    if hashlib.sha256(raw_bytes).hexdigest() != raw_source["digest"]:
        raise ValueError("Independent raw reference observation bytes changed")
    raw_review = json.loads(raw_bytes)
    observed_pairs = {tuple(o["owner_refs"]) for o in raw_review["observations"]}
    if {tuple(x["owner_refs"]) for x in observations} != observed_pairs:
        raise ValueError("Raw reference observation disposition coverage is incomplete")
    if len(raw_review["pair_checks"]) != len(parts)*(len(parts)-1)//2 or {tuple(p["owner_refs"]) for p in raw_review["pair_checks"]} != set(combinations(sorted(parts), 2)):
        raise ValueError("Independent raw reference pair review is incomplete")
    changed = {p["part_ref"]: p for p in scene.get("reference_alignment", {}).get("placements", [])}
    expected_placements = [{"owner_ref": p["id"], "position": changed.get(p["id"], p)["position"], "quaternion": p["quaternion"]}
        for p in sorted(parts.values(), key=lambda p: p["id"])]
    if raw_review.get("configuration_placements") != expected_placements:
        raise ValueError("Reference-use observations belong to a different configuration")
    for relative, expected_sha in raw_review["source_locks"].items():
        if hashlib.sha256(local_path(Path(root), relative).read_bytes()).hexdigest() != expected_sha:
            raise ValueError("Independent reference surface source revision changed")
    # A semantic name over an existing plane does not create another physical
    # plane. This also prevents deleting the alias policy and resealing stats.
    resource_refs = [set(r["feature_refs"]) for r in catalog["resources"]]
    for feature in features.values():
        replacements = set(feature.get("replacement_feature_refs", []))
        if replacements and not any(feature["id"] in refs and replacements.intersection(refs) for refs in resource_refs):
            raise ValueError("Functional geometry alias must share its witnessed physical resource")
    return {"schema": "psop.reference-use-coverage/1", "status": "reviewed_declared_scope_with_explicit_open_items",
        "source_ref": source["id"], "source_sha256": lock["sha256"], "part_count": len(outputs),
        "functional_interface_count": len(expected_interfaces), "reference_connection_count": len(expected_connections),
        "open_item_count": sum(len(p["open_items"]) for p in outputs), "parts": sorted(outputs, key=lambda p: p["owner_ref"]),
        "surface_pair_disposition_count": len(observations), "scope": review["scope"],
        "limits": review["limits"]}
