"""Evidence-bound original-use knowledge, separate from fastening acceptance."""
from __future__ import annotations

from .microduck import rotate

SCHEMA = "psop.reference-connection-assessment/1"
REVIEW_SCHEMA = "psop.interface-analysis-review/2"


def validate_assessment(connection, interfaces, evidence_ids, parts=None):
    assessment = connection.get("reference_assessment")
    if assessment is None:
        return
    from .package import SKILL, read_json, validate_shape
    validate_shape(assessment, read_json(SKILL/"schemas/reference-connection-assessment-1.schema.json"))
    if not set(assessment["evidence_refs"]) <= set(evidence_ids):
        raise ValueError("Reference assessment cites absent Evidence")
    configuration = connection.get("configuration_ref", assessment["configuration_ref"])
    if configuration != assessment["configuration_ref"]:
        raise ValueError("Reference assessment belongs to another configuration")
    kinds = {item["kind"] for item in assessment["open_items"]}
    required = {key for key in ("purpose", "counterpart") if assessment[key] == "unresolved"}
    if assessment["geometry"] != "axes_aligned":
        required.add("geometry")
    if assessment["fastening"] == "unspecified":
        required.add("fastening")
    if not required <= kinds:
        raise ValueError("Unresolved reference dimensions require concrete follow-up items")
    if assessment["counterpart"] == "identified" and len(connection["endpoints"]) < 2:
        raise ValueError("Identified counterpart requires bound endpoints")
    if assessment["geometry"] != "axes_aligned" or parts is None:
        return
    # Source-axis alignment proves the selected hole mapping, never retaining,
    # insertion, whole-body clearance or an installed fastener.
    if len(connection["endpoints"]) != 2:
        raise ValueError("Axis assessment currently requires two finite endpoints")
    endpoints = []
    for endpoint in connection["endpoints"]:
        interface = interfaces[endpoint["interface_ref"]]
        selected = set(endpoint["member_refs"])
        if not selected:
            raise ValueError("Aligned reference assessment requires explicit selected members")
        part = parts[interface["owner_ref"]]
        endpoints.append([([x+y for x, y in zip(rotate(part["quaternion"], member["position"]), part["position"])],
                           rotate(part["quaternion"], member["direction"]))
                          for member in interface["members"] if member["id"] in selected])
    first, second = endpoints
    if len(first) != len(second) or not first:
        raise ValueError("Aligned reference assessment requires a complete member bijection")
    edges = []
    for point, axis in first:
        allowed = []
        for index, (peer, direction) in enumerate(second):
            delta = [x-y for x, y in zip(peer, point)]
            axial = sum(x*y for x, y in zip(delta, axis))
            residual2 = sum((x-axial*y)**2 for x, y in zip(delta, axis))
            if abs(sum(x*y for x, y in zip(axis, direction))) >= .99999 and residual2 <= (2e-5)**2:
                allowed.append(index)
        edges.append(allowed)
    matched = {}
    def assign(index, seen):
        for peer in edges[index]:
            if peer not in seen:
                seen.add(peer)
                if peer not in matched or assign(matched[peer], seen):
                    matched[peer] = index
                    return True
        return False
    if not all(assign(index, set()) for index in range(len(first))):
        raise ValueError("Reference assessment axis claim disagrees with source member geometry")


def followup_reasons(connection, compatibility_status):
    """Every unresolved original hypothesis remains on the work list."""
    reasons = set()
    assessment = connection.get("reference_assessment")
    if assessment:
        reasons.update(item["kind"] for item in assessment["open_items"])
    elif connection.get("basis") == "hypothesis":
        reasons.add("original_use")
    if connection.get("basis") == "incompatible":
        reasons.add("source_configuration")
    if connection.get("basis") in {"declared", "source_assembly", "source_fit"} and compatibility_status != "recovered":
        reasons.add("compatibility")
    return sorted(reasons)
