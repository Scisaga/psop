"""Account for interface support and every original-to-compatible binding.

This is a result consistency review, not independent geometry discovery or a
proof that the original model is physically correct. In particular, a positive
part pair does not recover another pair of interfaces on those same parts.
"""
from __future__ import annotations

from collections import Counter, defaultdict

from .interface_compatibility import _slots
from .interface_policy import functional_interfaces
from .reference_assessment import REVIEW_SCHEMA, followup_reasons

SCHEMA = "psop.interface-analysis-review/1"
SUPPORTED_REFERENCE_BASES = {"declared", "source_assembly", "source_fit"}


def _resolved(member, features):
    refs = set()
    for ref in member.get("feature_refs", []):
        if ref not in features:
            raise ValueError("Interface review found an absent feature: " + ref)
        refs.update(features[ref].get("replacement_feature_refs") or [ref])
    if not refs <= features.keys():
        raise ValueError("Interface review found an absent replacement feature")
    return refs


def review_interfaces(catalog, compatibility, policy=None):
    policy = policy or {}
    detailed_review = policy.get("reference_review_schema") == REVIEW_SCHEMA or any(
        c.get("reference_assessment") for c in catalog.get("reference_connections", []))
    features = {f["id"]: f for f in catalog["features"]}
    interfaces = {i["id"]: i for i in catalog["interfaces"]}
    qualified = {i["id"]: i for i in functional_interfaces(catalog, policy)}
    matches = defaultdict(list)
    candidate_refs = defaultdict(set)
    for candidate in compatibility.get("candidates", []):
        for match in candidate.get("interface_matches", []):
            refs = (match["interface_a_ref"], match["interface_b_ref"])
            if any(ref not in interfaces for ref in refs):
                raise ValueError("Compatibility review found an absent interface")
            matches[tuple(sorted(refs))].append((candidate["id"], match))
            for ref in refs:
                candidate_refs[ref].add(candidate["id"])
    exclusions = defaultdict(list)
    for exclusion in compatibility.get("placement_exclusions", []):
        exclusions[tuple(sorted([exclusion["interface_a_ref"], exclusion["interface_b_ref"]]))].append(exclusion)
    review_rows = []
    for ref, interface in sorted(interfaces.items()):
        radial = set()
        other = set()
        geometries = set()
        for member in interface["members"]:
            fs = [features[r] for r in _resolved(member, features)]
            geometries.update(f["geometry"]["type"] for f in fs)
            supported = [f for f in fs if f.get("candidate_eligible", True) and f.get("kind") in {"bore_wall", "shaft_wall"}
                         and f["geometry"]["type"] in {"cylinder", "conical_frustum"}]
            if supported:
                radial.add(member["id"])
            if not supported or any(f not in supported for f in fs):
                other.add(member["id"])
        count = len(_slots(interface, features, "female")) + len(_slots(interface, features, "male"))
        state = "geometry_hypothesis_unqualified" if ref not in qualified else "nonradial_constraints_unsupported" if not radial else "radial_constraints_only" if other else "radial_pattern_supported"
        review_rows.append({"interface_ref": ref, "owner_ref": interface["owner_ref"],
            "qualification": "evidence_qualified_geometry" if "functional_qualification" in qualified.get(ref, {}) else "functional" if ref in qualified else "geometric_hypothesis",
            "support_status": state, "geometry_types": sorted(geometries),
            "radial_member_refs": sorted(radial), "additional_constraint_member_refs": sorted(other),
            "physical_radial_member_count": count,
            "axial_rotation": "free_rotation_not_exhausted" if count == 1 else "pattern_constrained_or_not_applicable",
            "candidate_refs": sorted(candidate_refs[ref])})
    rows_by_id = {r["interface_ref"]: r for r in review_rows}
    connections = catalog.get("reference_connections", [])
    if len({c["id"] for c in connections}) != len(connections):
        raise ValueError("Original connection review contains duplicate identities")
    reference_rows = []
    for connection in sorted(connections, key=lambda c: c["id"]):
        endpoints = connection["endpoints"]
        for endpoint in endpoints:
            ref = endpoint["interface_ref"]
            if ref not in interfaces or not set(endpoint.get("member_refs", [])) <= {m["id"] for m in interfaces[ref]["members"]}:
                raise ValueError("Original connection review found an absent interface/member")
        key = tuple(sorted(e["interface_ref"] for e in endpoints))
        relevant = matches.get(key, [])
        exact = set()
        for candidate_ref, match in relevant:
            for option in match["alignment_options"]:
                selected = {match["interface_a_ref"]: {p["member_a_ref"] for p in option["member_pairs"]},
                            match["interface_b_ref"]: {p["member_b_ref"] for p in option["member_pairs"]}}
                if all(set(e.get("member_refs", [])) <= selected.get(e["interface_ref"], set()) for e in endpoints):
                    exact.add(candidate_ref)
        failed = exclusions.get(key, [])
        statuses = Counter(o.get("interference", {}).get("status", "not_evaluated") for e in failed for o in e["alignment_options"])
        limitations = sorted({rows_by_id[e["interface_ref"]]["support_status"] for e in endpoints}
                             - {"radial_pattern_supported"})
        status = "recovered" if exact else "different_member_selection" if relevant else "fixed_pose_excluded" if failed else "unsupported_constraints" if limitations else "no_complete_interface_match"
        basis = connection.get("basis", "unspecified")
        reference_rows.append({"connection_ref": connection["id"], "basis": basis,
            "reference_status": "supported_reference" if basis in SUPPORTED_REFERENCE_BASES else "source_configuration_exclusion" if basis == "incompatible" else "reference_hypothesis",
            "interface_refs": [e["interface_ref"] for e in endpoints], "compatibility_status": status,
            "candidate_refs": sorted(exact), "other_selection_candidate_refs": sorted({r for r, _ in relevant} - exact),
            "placement_exclusion_count": len(failed), "fixed_pose_dispositions": dict(sorted(statuses.items())),
            "support_limitations": limitations, "evidence_refs": sorted(set(connection.get("evidence_refs", []))),
            "followup_required": basis in SUPPORTED_REFERENCE_BASES and status != "recovered"})
        if detailed_review:
            row = reference_rows[-1]
            row["compatibility_followup_required"] = row["followup_required"]
            row["followup_reasons"] = followup_reasons(connection, status)
            row["followup_required"] = bool(row["followup_reasons"])
            if connection.get("reference_assessment"):
                row["reference_assessment"] = connection["reference_assessment"]
    supported = [r for r in reference_rows if r["reference_status"] == "supported_reference"]
    pending = [r for r in supported if r["followup_required"]]
    functional_rows = [r for r in review_rows if r["qualification"] != "geometric_hypothesis"]
    limitations = [r for r in functional_rows if r["support_status"] != "radial_pattern_supported"]
    result = {"schema": SCHEMA, "status": "gaps_present" if pending or limitations else "reviewed_declared_scope",
        "scope": "Published interface/member consistency and fixed-pose support only; independent source discovery, insertion paths and retention remain separate",
        "interface_count": len(review_rows), "functional_interface_count": len(functional_rows),
        "unqualified_geometry_hypothesis_count": len(review_rows)-len(functional_rows),
        "functional_support_dispositions": dict(sorted(Counter(r["support_status"] for r in functional_rows).items())),
        "functional_constraint_gap_count": len(limitations), "reference_connection_count": len(reference_rows),
        "reference_compatibility_review_complete": True,
        "supported_reference_recovery_complete": not pending,
        "supported_reference_count": len(supported), "recovered_supported_reference_count": sum(r["compatibility_status"] == "recovered" for r in supported),
        "reference_followup_count": len(pending),
        "reference_dispositions_by_basis": {basis: dict(sorted(Counter(r["compatibility_status"] for r in reference_rows if r["basis"] == basis).items())) for basis in sorted({r["basis"] for r in reference_rows})},
        "interfaces": review_rows, "reference_connections": reference_rows}
    if detailed_review:
        all_pending = [r for r in reference_rows if r["followup_required"]]
        result.update(schema=REVIEW_SCHEMA, reference_followup_count=len(all_pending),
            hypothesis_followup_count=sum(r["basis"] == "hypothesis" for r in all_pending),
            compatibility_followup_count=sum(r["compatibility_followup_required"] for r in reference_rows),
            reference_followup_by_reason=dict(sorted(Counter(reason for r in all_pending for reason in r["followup_reasons"]).items())),
            reference_assessment_complete=not all_pending)
        # Original-use investigation and compatibility recovery have separate
        # denominators; unresolved fastening must not falsify recovery counts.
        result["supported_reference_recovery_complete"] = not any(r["compatibility_followup_required"] for r in supported)
        result["status"] = "gaps_present" if all_pending or limitations else "reviewed_declared_scope"
    return result
