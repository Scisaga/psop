"""Validate and publish an authored, source-bound assembly catalog.

This module does no discovery, Part-pair search, or mechanical qualification.
Coordinates and triangle indices are local to the owner's unchanged source mesh.
"""
from __future__ import annotations

from copy import deepcopy
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import struct

INPUT_SCHEMA = "psop.assembly.catalog/1"
CONNECTOR_INPUT_SCHEMA = "psop.assembly.catalog/2"
REQUIREMENTS_SCHEMA = "psop.assembly.requirements/1"
SOURCE_ID = "SRC-MD-ASSEMBLY-CATALOG"
SOURCE_PATH = "sources/" + SOURCE_ID + ".json"
FIT_M = 2e-5


@lru_cache(maxsize=2)
def schema(version=INPUT_SCHEMA):
    filenames = {INPUT_SCHEMA: "assembly-catalog.schema.json", CONNECTOR_INPUT_SCHEMA: "assembly-catalog-2.schema.json"}
    if version not in filenames:
        raise ValueError("Unsupported assembly catalog contract")
    path = Path(__file__).resolve().parents[2] / "schemas" / filenames[version]
    return json.loads(path.read_text(encoding="utf-8"))


def _shape(value, definition, version=INPUT_SCHEMA):
    # Use the existing strict local-schema subset; no remote refs or dependency.
    from .package import validate_shape
    contract = schema(version)
    validate_shape(value, contract["$defs"][definition], contract["$defs"])


def _index(records, label):
    result = {}
    for record in records:
        identifier = record.get("id")
        if not isinstance(identifier, str) or not identifier or identifier in result:
            raise ValueError(f"{label}: absent or duplicate identity {identifier!r}")
        result[identifier] = record
    return result


def _sub(a, b):
    return [x-y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def _length(a):
    return math.sqrt(_dot(a, a))


def _unit(vector, label):
    if abs(_dot(vector, vector)-1.) > 1e-5:
        raise ValueError(f"{label}: expected a unit local direction")


def _local_path(root, relative):
    item = PurePosixPath(relative)
    if (item.is_absolute() or not item.parts or any(p in {".", ".."} for p in item.parts)
            or str(item) != relative or ":" in relative or "\\" in relative):
        raise ValueError("Catalog source path must remain within the package")
    target = (Path(root) / relative).resolve(strict=True)
    if not target.is_relative_to(Path(root).resolve()):
        raise ValueError("Catalog source path escapes the package")
    return target


def _mesh(source, root):
    raw = _local_path(root, source["url"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["digest"]:
        raise ValueError(f"Source SHA mismatch: {source['id']}")
    if len(raw) < 84:
        raise ValueError("Catalog geometry requires a binary source STL")
    count = struct.unpack_from("<I", raw, 80)[0]
    if not count or len(raw) != 84+50*count:
        raise ValueError("Catalog geometry has an invalid binary STL triangle table")
    return raw, count


def _check_geometry(feature, mesh=None):
    geometry = feature["geometry"]
    kind = geometry["type"]
    axis = geometry.get("axis", geometry.get("normal"))
    _unit(axis, feature["id"])
    if kind == "cylinder" and geometry["axial_range_m"][0] >= geometry["axial_range_m"][1]:
        raise ValueError("Catalog cylinder requires an increasing finite axial range")
    if kind == "conical_frustum" and max(geometry["radius_start_m"], geometry["radius_end_m"]) <= 0:
        raise ValueError("Catalog conical frustum requires a nonzero end radius")
    if kind == "plane":
        for loop in geometry["boundary_loops"]:
            if any(abs(_dot(_sub(point, geometry["origin"]), axis)) > FIT_M for point in loop):
                raise ValueError("Catalog plane boundary is not on its declared local plane")
    if mesh is None:
        return
    raw, count = mesh
    indices = geometry["triangle_indices"]
    if any(index >= count for index in indices):
        raise ValueError(f"{feature['id']}: triangle index is outside its source mesh")
    for index in indices:
        values = struct.unpack_from("<12fH", raw, 84+50*index)
        points = [values[offset:offset+3] for offset in (3, 6, 9)]
        if not all(math.isfinite(v) for point in points for v in point):
            raise ValueError("Catalog source triangles contain nonfinite coordinates")
        if kind == "source_region":
            continue  # An arbitrary finite region need not be planar/cylindrical.
        for point in points:
            delta = _sub(point, geometry["origin"])
            axial = _dot(delta, axis)
            if kind == "plane":
                if abs(axial) > FIT_M:
                    raise ValueError("Catalog plane disagrees with its source triangle region")
                continue
            radius = _length(_sub(delta, [axial*v for v in axis]))
            if kind == "cylinder":
                expected = geometry["radius_m"]
                low, high = geometry["axial_range_m"]
            else:
                low, high = 0., geometry["length_m"]
                expected = geometry["radius_start_m"] + axial/high*(geometry["radius_end_m"]-geometry["radius_start_m"])
            if abs(radius-expected) > FIT_M or not low-FIT_M <= axial <= high+FIT_M:
                raise ValueError("Catalog wall diameter or finite extent disagrees with source triangles")


def _adjacent_pair(interface, pair, members):
    first, second = [members[identifier] for identifier in pair]
    normal = first["direction"]
    if any(_dot(normal, member["direction"]) < .99999 for member in members.values()):
        raise ValueError("Adjacent selection cannot merge different entry sides")
    a, b = first["position"], second["position"]
    edge = _sub(b, a)
    if _length(edge) < 1e-9:
        raise ValueError("Adjacent pair has coincident members")
    signs = []
    for identifier, member in members.items():
        if identifier in pair:
            continue
        delta = _sub(member["position"], a)
        if abs(_dot(delta, normal)) > FIT_M:
            raise ValueError("Adjacent selection requires one local entry plane")
        side = _dot(_cross(edge, delta), normal)
        if abs(side) < 1e-12 and 0 < _dot(delta, edge) < _dot(edge, edge):
            raise ValueError("Adjacent pair skips an intermediate member")
        if abs(side) >= 1e-12:
            signs.append(side > 0)
    if signs and any(signs) and not all(signs):
        raise ValueError(f"{interface['id']}: allowed pair is a diagonal, not adjacent")


def validate_requirements(catalog, requirements, scene=None):
    """Check an independently frozen expectation list, never output counts."""
    _shape(requirements, "assembly_requirements")
    locks = {item["id"]: item["sha256"] for item in requirements["sources"]}
    if len(locks) != len(requirements["sources"]):
        raise ValueError("Independent source requirements contain duplicate identities")
    if scene is not None:
        sources = _index(scene["sources"], "Scene sources")
        for lock in requirements["sources"]:
            if lock["id"] not in sources or sources[lock["id"]]["digest"] != lock["sha256"]:
                raise ValueError("Independent catalog requirement has a different source SHA")
    features = _index(catalog["features"], "Catalog features")
    interfaces = {(item["owner_ref"], item["key"]): item for item in catalog["interfaces"]}
    for expected in requirements["interfaces"]:
        actual = interfaces.get((expected["owner_ref"], expected["key"]))
        if actual is None:
            raise ValueError(f"Missing independently required interface: {expected['owner_ref']} / {expected['key']}")
        remaining = list(actual["members"])
        for member in expected["members"]:
            def matches(candidate):
                if _length(_sub(member["position"], candidate["position"])) > 1e-6:
                    return False
                if "direction" in member and _dot(member["direction"], candidate["direction"]) < .99999:
                    return False
                for feature in (features[ref] for ref in candidate["feature_refs"]):
                    g = feature["geometry"]
                    if feature["geometry_digest"] != "sha256:"+locks.get(feature["geometry_source_ref"], ""):
                        continue
                    if "geometry_type" in member and g["type"] != member["geometry_type"]:
                        continue
                    if "feature_kind" in member and feature["kind"] != member["feature_kind"]:
                        continue
                    if "radius_m" in member and abs(g.get("radius_m", -1)-member["radius_m"]) > 1e-6:
                        continue
                    return True
                return False
            found = next((candidate for candidate in remaining if matches(candidate)), None)
            if found is None:
                raise ValueError(f"Missing independently required member: {actual['id']} at {member['position']}")
            remaining.remove(found)
        if expected.get("exact_members") and remaining:
            raise ValueError(f"Independent interface contains unexpected members: {actual['id']}")
    interface_ids = {item["id"]: (item["owner_ref"], item["key"]) for item in catalog["interfaces"]}
    for expected in requirements.get("connections", []):
        targets = {(end["owner_ref"], end["key"]) for end in expected["endpoints"]}
        if not any({interface_ids[end["interface_ref"]] for end in item["endpoints"]} == targets
                   and ("basis" not in expected or expected["basis"] == item["basis"])
                   for item in catalog["connections"]):
            raise ValueError("Missing independently required assembly connection")
    return requirements


def validate_input(value, scene, root=None):
    """Validate references and, with root, unchanged source bytes and regions."""
    if not isinstance(value, dict):
        raise ValueError("Assembly catalog input must be an object")
    _shape(value, "assembly_input", value.get("schema"))
    device = value["device_id"]
    parts = _index(scene["parts"], "Scene parts")
    if not parts or any(not key.startswith("part:"+device+":") for key in parts):
        raise ValueError("Assembly catalog belongs to a different source device")
    sources = _index(scene["sources"], "Scene sources")
    documents = _index(value["supporting_documents"], "Supporting documents")
    evidence = _index(scene.get("evidence", []), "Scene evidence")
    for item in value["evidence"]:
        if item["id"] in evidence and evidence[item["id"]] != item:
            raise ValueError("Catalog Evidence identity conflicts with existing evidence")
        evidence[item["id"]] = item
        if item["sourceId"] not in sources and item["sourceId"] not in documents and item["sourceId"] != SOURCE_ID:
            raise ValueError("Catalog Evidence references an absent source")
        if item.get("partId") and item["partId"] not in parts:
            raise ValueError("Catalog Evidence references an absent Part")
    def support(item):
        if any(ref not in evidence for ref in item["evidence_refs"]):
            raise ValueError("Catalog record references absent Evidence")
    catalog = value["catalog"]
    features = _index(catalog["features"], "Catalog features")
    interfaces = _index(catalog["interfaces"], "Catalog interfaces")
    connections = _index(catalog["connections"], "Catalog connections")
    if len(set(features) | set(interfaces) | set(connections)) != len(features)+len(interfaces)+len(connections):
        raise ValueError("Catalog record identities collide across record types")
    meshes = {}
    for feature in features.values():
        part = parts.get(feature["owner_ref"])
        source = sources.get(feature["geometry_source_ref"])
        if (part is None or source is None or part.get("geometryUrl") != source["url"]
                or source["id"] not in part.get("sourceIds", [])
                or feature["geometry_digest"] != "sha256:"+source["digest"]):
            raise ValueError("Catalog Feature does not bind its owner's exact geometry source SHA")
        if root is not None and source["id"] not in meshes:
            meshes[source["id"]] = _mesh(source, root)
        _check_geometry(feature, meshes.get(source["id"]))
    keys = set()
    for interface in interfaces.values():
        support(interface)
        identity = (interface["owner_ref"], interface["key"])
        if interface["owner_ref"] not in parts or identity in keys:
            raise ValueError("Catalog Interface has an absent owner or duplicate owner/key identity")
        keys.add(identity)
        members = _index(interface["members"], "Interface members")
        for member in members.values():
            _unit(member["direction"], member["id"])
            if any(ref not in features or features[ref]["owner_ref"] != interface["owner_ref"] for ref in member["feature_refs"]):
                raise ValueError("Interface member refers to an absent or another owner's Feature")
            for ref in member["feature_refs"]:
                geometry = features[ref]["geometry"]
                if geometry["type"] not in {"cylinder", "conical_frustum"}:
                    continue
                delta = _sub(member["position"], geometry["origin"])
                axial = _dot(delta, geometry["axis"])
                radial = _length(_sub(delta, [axial*v for v in geometry["axis"]]))
                # A source entrance anchor can lie beyond a recessed finite
                # receiving wall; it must still identify the same local axis.
                if radial > FIT_M or abs(_dot(member["direction"], geometry["axis"])) < .99999:
                    raise ValueError(f"{member['id']}: local member anchor or direction disagrees with its finite wall")
            if member.get("resource_ref") not in {None, *features, *sources, *documents, *evidence}:
                raise ValueError("Interface member resource reference is unresolved")
            resource = features.get(member.get("resource_ref"))
            if resource and resource["owner_ref"] != interface["owner_ref"]:
                raise ValueError("Shared physical member resource belongs to another Part")
        selection = interface["selection"]
        pairs = selection.get("allowed_pairs", [])
        if selection["kind"] == "unspecified" and pairs:
            raise ValueError("Unspecified selection cannot declare allowed pairs")
        if selection["kind"] == "adjacent_pair" and not pairs:
            raise ValueError("Adjacent selection requires explicit allowed pairs")
        seen = set()
        selectable = {ref for pair in pairs for ref in pair}
        for pair in pairs:
            if len(set(pair)) != 2 or any(ref not in members for ref in pair) or frozenset(pair) in seen:
                raise ValueError("Allowed pair has absent, repeated, or duplicate members")
            seen.add(frozenset(pair))
            _adjacent_pair(interface, pair, {ref: members[ref] for ref in selectable})
    path_ids = set()
    for connection in connections.values():
        support(connection)
        ends = set()
        for endpoint in connection["endpoints"]:
            interface = interfaces.get(endpoint["interface_ref"])
            if interface is None or interface["id"] in ends:
                raise ValueError("Connection has absent or duplicate interface endpoints")
            ends.add(interface["id"])
            members = {member["id"] for member in interface["members"]}
            chosen = endpoint["member_refs"]
            if not set(chosen) <= members:
                raise ValueError("Connection selects members from a different interface")
            selection = interface["selection"]
            selectable = {ref for pair in selection.get("allowed_pairs", []) for ref in pair}
            selected = set(chosen) & selectable
            if selected and selection["kind"] == "adjacent_pair" and not any(set(pair) == selected for pair in selection["allowed_pairs"]):
                raise ValueError(f"{connection['id']}: member selection at {interface['id']} is not an allowed adjacent pair")
        from .reference_assessment import validate_assessment
        validate_assessment(connection, interfaces, evidence, parts)
        if connection["basis"] == "incompatible" and not connection.get("note"):
            raise ValueError("Incompatible connection requires its concrete exclusion reason")
        paths = connection.get("fastener_paths", [])
        if paths and connection["basis"] == "incompatible":
            raise ValueError("Excluded connection cannot provide fastener display paths")
        routes = set()
        for path in paths:
            support(path)
            if path["id"] in path_ids or path["id"] in {*features, *interfaces, *connections}:
                raise ValueError("Fastener path identities collide")
            path_ids.add(path["id"])
            anchors = []
            for field in ("entry", "receiver"):
                anchor = path[field]
                interface = interfaces.get(anchor["interface_ref"])
                endpoint = next((item for item in connection["endpoints"] if item["interface_ref"] == anchor["interface_ref"]), None)
                member = next((item for item in interface["members"] if item["id"] == anchor["member_ref"]), None) if interface else None
                feature = features.get(anchor["feature_ref"])
                if (endpoint is None or member is None or feature is None
                        or feature["id"] not in member["feature_refs"]
                        or feature["kind"] != "bore_wall" or feature["geometry"]["type"] != "cylinder"
                        or endpoint["member_refs"] and member["id"] not in endpoint["member_refs"]):
                    raise ValueError("Fastener path must bind a selected or unspecified endpoint's exact bore member")
                anchors.append((parts[interface["owner_ref"]], feature["geometry"]))
            if path["entry"]["interface_ref"] == path["receiver"]["interface_ref"]:
                raise ValueError("Fastener path needs two different connection endpoints")
            route = tuple(path[field][key] for field in ("entry", "receiver") for key in ("interface_ref", "member_ref", "feature_ref"))
            if route in routes:
                raise ValueError("Duplicate fastener display path")
            routes.add(route)
            entry_part, entry_geometry = anchors[0]
            receiver_part, receiver_geometry = anchors[1]
            side = path["entry"]["side"]
            limit = entry_geometry["axial_range_m"][0 if side == "low" else 1]
            entry_local = [a+limit*b for a, b in zip(entry_geometry["origin"], entry_geometry["axis"])]
            entry_point = _world_point(entry_part, entry_local)
            inward = _world_axis(entry_part, [a*(1 if side == "low" else -1) for a in entry_geometry["axis"]])
            receiver_origin = _world_point(receiver_part, receiver_geometry["origin"])
            receiver_axis = _world_axis(receiver_part, receiver_geometry["axis"])
            delta = _sub(receiver_origin, entry_point)
            axial = _dot(delta, inward)
            transverse = _length(_sub(delta, [axial*a for a in inward]))
            if abs(_dot(inward, receiver_axis)) < .99999 or transverse > FIT_M or axial <= FIT_M:
                raise ValueError("Fastener display path has a wrong entry side or nonmatching finite bore axis")
    for note in catalog["part_notes"]:
        if note["owner_ref"] not in parts:
            raise ValueError("Catalog Part note has an absent owner")
        support(note)
    if "requirements" in value:
        if value["requirements"]["device_id"] != device:
            raise ValueError("Independent requirements belong to another device")
        validate_requirements(catalog, value["requirements"], scene)
    return value


def _world_point(part, point):
    from .microduck import rotate
    scaled = [a*b for a, b in zip(point, part.get("scale", [1., 1., 1.]))]
    return [a+b for a, b in zip(rotate(part.get("quaternion", [0., 0., 0., 1.]), scaled), part.get("position", [0., 0., 0.]))]


def _world_axis(part, axis):
    origin = _world_point(part, [0., 0., 0.])
    vector = _sub(_world_point(part, axis), origin)
    length = _length(vector)
    if length < 1e-12:
        raise ValueError("Fastener display path has a degenerate source placement")
    return [value/length for value in vector]


def augment_scene(scene, root, value):
    """Publish only the catalog and deduplicated Evidence; preserve basis tags."""
    validate_input(value, scene, root)
    scene["assembly"] = deepcopy(value["catalog"])
    existing = {item["id"] for item in scene.get("evidence", [])}
    for item in value["evidence"]:
        if item["id"] not in existing:
            scene.setdefault("evidence", []).append(deepcopy(item))
            existing.add(item["id"])
    if "meta" in scene and "counts" in scene["meta"]:
        scene["meta"]["counts"]["evidence"] = len(scene["evidence"])
    return scene["assembly"]


def used_connections(catalog):
    """Source-backed uses; hypotheses and exclusions remain inspectable records."""
    return [item for item in catalog["connections"] if item["basis"] in {"declared", "source_assembly", "source_fit"}]
