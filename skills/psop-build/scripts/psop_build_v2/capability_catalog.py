"""Part-local capability catalog.  Independent review is never discovery input.

Source-instance identities are retained. Measurement is shared only by source
digest; a source model instance is not a confirmed stock quantity.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import struct
import time

PROFILE = "psop.hardware.source-model/1.15"
SCHEMA = "psop.assembly.catalog/3"
REQUIREMENTS = "psop.assembly.requirements/2"
VERSION = "part-capabilities/1"


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def key(value):
    return hashlib.sha256(canonical(value)).hexdigest()[:20]


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _sub(a, b):
    return [x-y for x, y in zip(a, b)]


def _norm(a):
    return math.sqrt(_dot(a, a))


def _point(g, t):
    return [x+t*v for x, v in zip(g["origin"], g["axis"])]


def _ends(g):
    return g.get("axial_range_m", [0., g.get("length_m", 0.)])


def _vertices(raw, indices):
    result = set()
    for index in indices:
        values = struct.unpack_from("<12fH", raw, 84+50*index)
        for offset in (3, 6, 9):
            result.add(tuple(round(x/1e-8) for x in values[offset:offset+3]))
    return result


def _source_edges(raw, indices):
    result = set()
    for index in indices:
        values = struct.unpack_from("<12fH", raw, 84+50*index)
        ps = [tuple(round(x/1e-8) for x in values[offset:offset+3]) for offset in (3, 6, 9)]
        result.update(tuple(sorted((ps[i], ps[(i+1)%3]))) for i in range(3))
    return result


def _connected_support(raw, indices):
    # Edge-connected triangle support, rather than two coincident vertices.
    owners = defaultdict(list)
    neighbors = defaultdict(set)
    for i in indices:
        for edge in _source_edges(raw, [i]):
            for j in owners[edge]:
                neighbors[i].add(j)
                neighbors[j].add(i)
            owners[edge].append(i)
    pending, seen = [indices[0]], set()
    while pending:
        i = pending.pop()
        if i not in seen:
            seen.add(i)
            pending.extend(neighbors[i]-seen)
    return len(seen) == len(indices)


def _physical_resources(features, raw, owner, *, share_surface_aliases=False):
    """Join finite segments only with exact mesh-topology witnesses.

    Coaxiality alone cannot join two ears across empty space. A common mesh
    edge or a finite shared shoulder patch is required in addition to touching
    axial ranges. Partial wall patches remain explicit members of the resource.
    """
    round_features = [f for f in features if f["geometry"]["type"] in {"cylinder", "conical_frustum"} and f.get("candidate_eligible", True)]
    planes = [f for f in features if f["geometry"]["type"] == "plane"]
    edges = {f["id"]: _source_edges(raw, f["geometry"]["triangle_indices"]) for f in [*round_features, *planes]}
    connected_planes = {}
    parents = list(range(len(round_features)))
    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    joins = []
    for i, a in enumerate(round_features):
        ga = a["geometry"]
        for j in range(i):
            b, gb = round_features[j], round_features[j]["geometry"]
            if a["kind"] != b["kind"] or abs(_dot(ga["axis"], gb["axis"])) < .99999:
                continue
            delta = _sub(gb["origin"], ga["origin"])
            axial = _dot(delta, ga["axis"])
            if _norm([d-axial*v for d, v in zip(delta, ga["axis"])]) > 2e-5:
                continue
            endpoints_a = [_point(ga, t) for t in _ends(ga)]
            endpoints_b = [_point(gb, t) for t in _ends(gb)]
            gap = min(_norm(_sub(x, y)) for x in endpoints_a for y in endpoints_b)
            # Overlapping source patches can represent the same partial wall.
            common = edges[a["id"]] & edges[b["id"]]
            bridge = None
            if gap > 2e-5 and not common:
                continue
            if not common:
                for plane in planes:
                    if abs(_dot(plane["geometry"]["normal"], ga["axis"])) < .99999:
                        continue
                    pv = edges[plane["id"]]
                    if pv & edges[a["id"]] and pv & edges[b["id"]]:
                        if plane["id"] not in connected_planes:
                            connected_planes[plane["id"]] = _connected_support(raw, plane["geometry"]["triangle_indices"])
                        if not connected_planes[plane["id"]]:
                            continue
                        bridge = plane["id"]
                        break
                if bridge is None:
                    continue
            parents[find(i)] = find(j)
            joins.append({"feature_refs": [a["id"], b["id"]], "method": "shared_mesh_edge" if common else "finite_shoulder_adjacency", "shoulder_feature_ref": bridge,
                "shared_edges_m": [[[x*1e-8 for x in p] for p in edge] for edge in sorted(common)], "vertex_comparison_m": 1e-8})
    groups = defaultdict(list)
    for i, feature in enumerate(round_features):
        groups[find(i)].append(feature)
    resources = []
    for group in groups.values():
        refs = sorted(f["id"] for f in group)
        rid = "resource:"+key(owner)+":"+key(refs)
        entries = []
        for f in group:
            g = f["geometry"]
            for side, t, sign in (("low", _ends(g)[0], -1), ("high", _ends(g)[1], 1)):
                entries.append({"id": rid+":"+key([f["id"], side]), "feature_ref": f["id"], "side": side,
                    "position": _point(g, t), "direction": [sign*x for x in g["axis"]],
                    "direction_semantics": "outward_finite_boundary_normal",
                    "insertion_direction": [-sign*x for x in g["axis"]],
                    "classification": "finite_wall_boundary", "open_entrance_confirmed": False})
        resources.append({"id": rid, "owner_ref": owner,
            "kind": "logical_hole" if group[0]["kind"] == "bore_wall" else "shaft_segment",
            "feature_refs": refs, "entries": entries,
            "continuity": {"status": "source_topology_witnessed" if len(group) > 1 else "single_finite_segment",
                "witnesses": [j for j in joins if set(j["feature_refs"]).issubset(refs)],
                "unresolved": ["Open entrance, blind end and passage beyond measured material require confirmation"]}})
    # Every other physical reference names actual finite geometry, never Evidence.
    # Old partial measurements are aliases over the witnessed new resources;
    # their stable reference IDs do not create another physical hole.
    for f in features:
        replacements = set(f.get("replacement_feature_refs", []))
        if replacements:
            for resource in resources:
                if replacements.intersection(resource["feature_refs"]):
                    resource["feature_refs"] = sorted(set(resource["feature_refs"]+[f["id"]]))
    claimed = {r for resource in resources for r in resource["feature_refs"]}
    for f in features:
        if f["id"] not in claimed:
            replacements = set(f.get("replacement_feature_refs", []))
            shared = [r for r in resources if replacements.intersection(r["feature_refs"])] if share_surface_aliases else []
            if shared:
                for resource in shared:
                    resource["feature_refs"] = sorted(set(resource["feature_refs"]+[f["id"]]))
                claimed.add(f["id"])
                continue
            resources.append({"id": "resource:"+key(owner)+":"+key(f["id"]), "owner_ref": owner,
                "kind": "surface_region", "feature_refs": [f["id"]], "entries": [],
                "continuity": {"status": "finite_source_region", "witnesses": []}})
    return resources


def build_catalog(scene, root, legacy=None, *, measurement_cache=None, progress=None):
    from .capability_geometry import extract, PARAMETERS
    from .capability_profiles import discover_profiles, PARAMETERS as PROFILE_PARAMETERS
    from . import capability_geometry, mechanics
    algorithm_sha = hashlib.sha256(Path(capability_geometry.__file__).read_bytes()+Path(mechanics.__file__).read_bytes()).hexdigest()
    source_index = {s["id"]: s for s in scene["sources"]}
    old = deepcopy(legacy or {"features": [], "interfaces": [], "connections": [], "part_notes": []})
    cache, features, resources, frames, migrations, review = {}, [], [], [], [], []
    old_by_owner = defaultdict(list)
    for f in old["features"]:
        old_by_owner[f["owner_ref"]].append(f)
    for part in sorted(scene["parts"], key=lambda p: p["id"]):
        owner = part["id"]
        source = next(source_index[s] for s in part["sourceIds"] if source_index[s]["url"] == part["geometryUrl"])
        raw = (Path(root)/source["url"]).read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        if sha != source["digest"]:
            raise ValueError("Measurement source digest differs: "+source["id"])
        if sha not in cache:
            started = time.perf_counter()
            cache_path = Path(measurement_cache)/(algorithm_sha+"-"+sha+".json") if measurement_cache else None
            measured_base = None
            if cache_path and cache_path.is_file():
                try:
                    record = json.loads(cache_path.read_text(encoding="utf-8"))
                    if record["source_sha256"] == sha and record["algorithm_sha256"] == algorithm_sha and record["measurement_sha256"] == hashlib.sha256(canonical(record["measurement"])).hexdigest():
                        measured_base = record["measurement"]
                except (ValueError, KeyError):
                    pass
            reused = measured_base is not None
            if measured_base is None:
                measured_base = extract(raw)
                if cache_path:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    cache_path.write_bytes(canonical({"source_sha256": sha, "algorithm_sha256": algorithm_sha,
                        "measurement_sha256": hashlib.sha256(canonical(measured_base)).hexdigest(), "measurement": measured_base}))
            composites = discover_profiles(raw, measured_base["features"])
            cache[sha] = {**measured_base, "features": [*measured_base["features"], *composites]}
            if progress:
                progress({"phase": "geometry", "source_ref": source["id"], "source_sha256": sha,
                    "unique_meshes_completed": len(cache), "feature_count": len(cache[sha]["features"]),
                    "measurement_cache_reused": reused, "elapsed_seconds": time.perf_counter()-started})
        measured = deepcopy(cache[sha])
        local = []
        for feature in measured["features"]:
            identity = key([sha, feature["kind"], feature.get("semantic_role"), feature.get("profile_form"), sorted(feature["geometry"]["triangle_indices"])])
            feature.update({"id": "feature:"+key(owner)+":geometry:"+identity,
                "owner_ref": owner, "geometry_source_ref": source["id"], "geometry_digest": "sha256:"+sha,
                "frame_ref": "frame:"+key(owner)+":source",
                "function_status": "unknown", "basis": "mesh_measurement", "evidence_refs": part["evidenceIds"][-1:],
                "tolerances": {"mesh_fit_m": feature.get("measurement", {}).get("fit_max_m", 0),
                    "manufacturing_m": None, "fit_clearance_m": None, "numerical_m": 2e-8}})
            feature["disposition"] = {"status": "retained_unparameterized" if feature.get("measurement", {}).get("parameterization") == "none" else "measured_finite_geometry",
                "region_layer": "composite_profile" if feature.get("profile_form") else "source_partition",
                "functional_status": "unknown_retained_for_exploration"}
            if feature["geometry"]["type"] == "source_region":
                vertices = _vertices(raw, feature["geometry"]["triangle_indices"])
                feature["source_bounds_m"] = [[min(p[k] for p in vertices)*1e-8 for k in range(3)],
                    [max(p[k] for p in vertices)*1e-8 for k in range(3)]]
                feature["disposition"]["known_shape"] = feature.get("semantic_role", "finite_unparameterized_material")
                feature["disposition"]["unsupported_parameters"] = ["analytic_surface_model", "complementary_function"] if feature.get("measurement", {}).get("parameterization") == "none" else ["confirmed_function"]
            local.append(feature)
        # Keep stable authored identities and reference use; declare replacements
        # instead of rebuilding those IDs from fit coordinates or display order.
        for prior in old_by_owner[owner]:
            prior["basis"] = "migrated_reference_geometry"
            tri = set(prior["geometry"]["triangle_indices"])
            replacements = [f["id"] for f in local if f.get("basis") == "mesh_measurement" and f["kind"] == prior["kind"] and
                f["geometry"]["type"] == prior["geometry"]["type"] and len(tri & set(f["geometry"]["triangle_indices"])) >= max(1, .8*len(tri))]
            if replacements:
                prior["candidate_eligible"] = False
                prior["replacement_feature_refs"] = replacements
                migrations.append({"from_ref": prior["id"], "to_refs": replacements, "relation": "remeasured_source_region", "source_sha256": sha})
            local.append(prior)
        features.extend(local)
        resources.extend(_physical_resources(local, raw, owner, share_surface_aliases=True))
        frames.append({"id": "frame:"+key(owner)+":source", "owner_ref": owner,
            "kind": "source_local", "origin": [0, 0, 0], "quaternion": [0, 0, 0, 1],
            "motion_ownership": "unresolved", "note": "Source mesh may combine moving regions; no internal rigidity or phase claim"})
        review.append({"owner_ref": owner, "source_ref": source["id"], "source_sha256": sha,
            "measurement_cache_key": sha,
            "regions": [{"feature_ref": f["id"], "geometry_type": f["geometry"]["type"], **f["disposition"]} for f in local if "disposition" in f],
            "coverage": measured.get("coverage", {}),
            "inventory_status": "source_instance_not_confirmed_physical_stock"})
    interfaces = old["interfaces"]
    resource_index = {f: r["id"] for r in resources for f in r["feature_refs"]}
    for feature in features:
        geometry = feature["geometry"]
        role, modes, complement = "unknown", [], []
        if feature["kind"] in {"bore_wall", "shaft_wall"} and geometry["type"] in {"cylinder", "conical_frustum"}:
            role = "receiving_wall" if feature["kind"] == "bore_wall" else "projecting_wall"
            modes = ["cylindrical_insertion" if geometry["type"] == "cylinder" else "conical_insertion", "bearing_fit"]
            complement = ["Complementary material side and compatible finite radial profile"]
            if role == "receiving_wall":
                modes += ["through_fastener", "screw_reception"]
                complement += ["A standard connector and a suitable receiver or nut; thread and stack remain unspecified"]
        elif geometry["type"] == "plane":
            role, modes = "support_or_contact_surface", ["planar_seating"]
            complement = ["Finite opposing surface overlap; ordinary seating does not establish a fixed connection"]
        elif feature.get("semantic_role") in {"key", "tab", "slot", "guide"}:
            role, modes = feature["semantic_role"], ["keyed_guidance"]
            complement = ["Complementary finite cross section, side polarity and entry direction"]
        feature["capability"] = {"basis": "geometric_potential", "role": role,
            "template_refs": ["mechanism:"+mode+":1" for mode in modes],
            "resource_refs": [resource_index[feature["id"]]], "member_selection": "finite_region_or_explicit_pattern",
            "complementary_requirements": complement,
            "unresolved_conditions": ["Functional use, manufacturing fit, motion ownership, retaining and engineering conditions require their own evidence"]}
    for interface in interfaces:
        interface.update({"capability_basis": "migrated_semantic_assertion", "counterpart_binding": "reference_only",
            "modes": ["reference_declared_connection"], "unresolved_conditions": ["Actual retaining details and applicability in a new design require evaluation"]})
        interface["resource_refs"] = sorted({resource_index[f] for m in interface["members"] for f in m["feature_refs"]})
    # Geometric-only patterns supplement, rather than depend on, authored uses.
    by_owner = defaultdict(list)
    for f in features:
        if f.get("candidate_eligible", True) and f["kind"] == "bore_wall" and f["geometry"]["type"] in {"cylinder", "conical_frustum"}:
            by_owner[f["owner_ref"]].append(f)
    for owner, fs in by_owner.items():
        groups = defaultdict(list)
        for f in fs:
            g = f["geometry"]
            axis = g["axis"]
            sign = 1 if axis[max(range(3), key=lambda k: abs(axis[k]))] >= 0 else -1
            u = [sign*x for x in axis]
            for side, t in zip(("low", "high"), _ends(g)):
                p = _point(g, t)
                # A grouping hypothesis, not a manufacturing or selection rule.
                group_key = tuple(round(x/.002) for x in u)+(side,)
                groups[group_key].append((f, side, p))
        directions = {key[:-1] for key in groups}
        if len(directions) > 1:
            for side in ("low", "high"):
                groups[("all_source_axes", side)] = [entry for entries in list(groups.values()) for entry in entries if entry[1] == side]
        for entries in groups.values():
            unique = {}
            for f, side, p in entries:
                resource_ref = resource_index[f["id"]]
                prior = unique.get(resource_ref)
                if prior is None or (1 if side == "low" else -1)*_dot(p, f["geometry"]["axis"]) < (1 if side == "low" else -1)*_dot(prior[2], f["geometry"]["axis"]):
                    unique[resource_ref] = f, side, p
            if len(unique) < 2:
                continue
            members = []
            iid = "interface:"+key(owner)+":geometric-pattern:"+key(sorted(unique))
            # Different entry sides are distinct capabilities over shared resources.
            iid += ":"+key([(f["id"], side) for f, side, p in unique.values()])
            for f, side, p in unique.values():
                members.append({"id": iid+":"+key([f["id"], side]), "label": "有限孔段边界 · 用途待确认",
                    "feature_refs": next(r["feature_refs"] for r in resources if r["id"] == resource_index[f["id"]]),
                    "position": p, "direction": [x*(1 if side == "low" else -1) for x in f["geometry"]["axis"]],
                    "resource_ref": resource_index[f["id"]], "entry_side": side,
                    "entry_ref": resource_index[f["id"]]+":"+key([f["id"], side])})
            interfaces.append({"id": iid, "owner_ref": owner, "name": "有限孔布局（几何假设，含台阶与轴向分支）", "purpose": "潜在选孔布局",
                "key": iid.split(":")[-1], "geometry_summary": str(len(members))+" 个有限孔段",
                "members": members, "selection": {"kind": "unspecified"}, "origin": "project_inference",
                "capability_basis": "geometry_hypothesis", "modes": ["through_fastener", "partial_hole_pattern"],
                "resource_refs": sorted(unique), "evidence_refs": [], "unresolved_conditions": ["Mechanical subset, entry openness, retaining, thread and load requirements unknown"]})
    connections = old["connections"]
    for connection in connections:
        connection.update({"record_type": "reference_connection", "configuration_ref": "configuration:"+scene["meta"].get("deviceId", "source-model")+":source-qpos0",
            "assessment_scope": "source_reference_configuration"})
    return {"schema": SCHEMA, "features": features, "interfaces": interfaces, "resources": resources,
        "frames": frames, "reference_connections": connections, "part_notes": old.get("part_notes", []),
        "migrations": migrations, "instance_reviews": review,
        "analysis": {"version": VERSION, "surface_alias_policy": "share_witnessed_replacements/1", "parameters": PARAMETERS, "profile_parameters": PROFILE_PARAMETERS,
            "measurement_algorithm_sha256": algorithm_sha, "unique_measurements": len(cache),
            "physical_inventory_confirmed": False, "scope": "All discovered finite source regions; residual regions retain unsupported parameterization"}}


def validate_catalog(catalog, scene, root, requirements):
    """Check raw witnesses and independent requirements, not output statistics."""
    from .assembly_catalog import _check_geometry, _shape, CONNECTOR_INPUT_SCHEMA
    from .package import validate_shape, read_json, local_path, SKILL
    if catalog.get("schema") != SCHEMA or requirements.get("schema") != REQUIREMENTS:
        raise ValueError("Expected catalog/3 and independent requirements/2")
    validate_shape(catalog, read_json(SKILL/"schemas/assembly-catalog-3.schema.json"))
    validate_shape(requirements, read_json(SKILL/"schemas/assembly-requirements-2.schema.json"))
    owners = {p["id"]: p for p in scene["parts"]}
    sources = {s["id"]: s for s in scene["sources"]}
    for source in sources.values():
        path = local_path(Path(root), source["url"])
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["digest"]:
            raise ValueError("Captured source bytes disagree with registry: "+source["id"])
    features, all_ids, raw_cache = {}, set(), {}
    for collection in ("features", "interfaces", "resources", "frames"):
        for record in catalog[collection]:
            if record["id"] in all_ids or record["owner_ref"] not in owners:
                raise ValueError("Duplicate identity or invalid owner in "+collection)
            all_ids.add(record["id"])
    by_source = defaultdict(list)
    for feature in catalog["features"]:
        sid = feature["geometry_source_ref"]
        if sid not in sources or sid not in owners[feature["owner_ref"]]["sourceIds"]:
            raise ValueError("Feature is not bound to its owner's source")
        source = sources[sid]
        if sid not in raw_cache:
            raw = (Path(root)/source["url"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != source["digest"]:
                raise ValueError("Source digest mismatch")
            raw_cache[sid] = (raw, struct.unpack_from("<I", raw, 80)[0])
        if feature["geometry_digest"] != "sha256:"+source["digest"]:
            raise ValueError("Feature geometry revision differs")
        indices = feature["geometry"]["triangle_indices"]
        _shape(feature["geometry"], "assembly_geometry", CONNECTOR_INPUT_SCHEMA)
        if not indices or len(set(indices)) != len(indices) or any(type(t) is not int or t < 0 or t >= raw_cache[sid][1] for t in indices):
            raise ValueError("Invalid finite triangle witness: "+feature["id"])
        _check_geometry(feature, raw_cache[sid])
        features[feature["id"]] = feature
        by_source[sid].append(feature)
    resource_index = {r["id"]: r for r in catalog["resources"]}
    for resource in resource_index.values():
        if not resource["feature_refs"]:
            raise ValueError("Resource must refer to finite geometry")
        for ref in resource["feature_refs"]:
            if ref not in features or features[ref]["owner_ref"] != resource["owner_ref"]:
                raise ValueError("Physical resource reference must name owned Feature")
        for entry in resource["entries"]:
            if entry["feature_ref"] not in resource["feature_refs"]:
                raise ValueError("Entry refers outside its physical resource")
            g = features[entry["feature_ref"]]["geometry"]
            if g["type"] not in {"cylinder", "conical_frustum"} or entry["side"] not in {"low", "high"}:
                raise ValueError("Entry requires a finite round segment and side")
            t = _ends(g)[entry["side"] == "high"]
            if _norm(_sub(entry["position"], _point(g, t))) > 2e-8:
                raise ValueError("Entry is not at its finite wall boundary")
    entry_ids = [e["id"] for r in resource_index.values() for e in r["entries"]]
    if len(entry_ids) != len(set(entry_ids)):
        raise ValueError("Physical entry identities must be unique")
    # Recompute topology, boundary sides and directions from actual geometry.
    # Recounting output totals cannot legitimize a merged gap or false entry.
    expected_resources = []
    for owner in sorted(owners):
        fs = [f for f in catalog["features"] if f["owner_ref"] == owner]
        sid = next(s for s in owners[owner]["sourceIds"] if s in raw_cache)
        expected_resources.extend(_physical_resources(fs, raw_cache[sid][0], owner,
            share_surface_aliases=catalog["analysis"].get("surface_alias_policy") == "share_witnessed_replacements/1"))
        from .capability_profiles import discover_profiles, METHOD as PROFILE_METHOD
        base = [f for f in fs if f.get("basis") == "mesh_measurement" and f.get("measurement", {}).get("method") != PROFILE_METHOD]
        prototypes = discover_profiles(raw_cache[sid][0], base)
        actual_profiles = [f for f in fs if f.get("measurement", {}).get("method") == PROFILE_METHOD]
        fields = {k for prototype in prototypes for k in prototype}
        if canonical(sorted([{k: f[k] for k in fields} for f in actual_profiles], key=lambda f: key(f))) != canonical(sorted(prototypes, key=lambda f: key(f))):
            raise ValueError("Composite profile dimensions, material side or topology witness differs from raw source")
    if canonical(sorted(catalog["resources"], key=lambda r: r["id"])) != canonical(sorted(expected_resources, key=lambda r: r["id"])):
        raise ValueError("Physical resources, finite entries or source-topology continuity witnesses differ")
    interfaces = {i["id"]: i for i in catalog["interfaces"]}
    for interface in interfaces.values():
        for member in interface["members"]:
            if any(ref not in features or features[ref]["owner_ref"] != interface["owner_ref"] for ref in member["feature_refs"]):
                raise ValueError("Interface has an invalid geometric member")
        if any(ref not in resource_index for ref in interface.get("resource_refs", [])):
            raise ValueError("Interface has an invalid physical resource reference")
    for connection in catalog["reference_connections"]:
        if connection.get("record_type") != "reference_connection" or any(e["interface_ref"] not in interfaces for e in connection["endpoints"]):
            raise ValueError("Reference assembly must remain a distinct configuration-bound record")
        if connection.get("configuration_ref") != "configuration:"+scene["meta"].get("deviceId", "source-model")+":source-qpos0":
            raise ValueError("Reference connection belongs to another configuration")
        for endpoint in connection["endpoints"]:
            member_ids = {m["id"] for m in interfaces[endpoint["interface_ref"]]["members"]}
            if any(ref not in member_ids for ref in endpoint.get("member_refs", [])):
                raise ValueError("Reference connection selected member is outside its interface")
        evidence_ids = {e["id"] for e in scene.get("evidence", [])}
        if any(ref not in evidence_ids for ref in connection.get("evidence_refs", [])):
            raise ValueError("Reference connection has missing Evidence")
        from .reference_assessment import validate_assessment
        validate_assessment(connection, interfaces, evidence_ids, owners)
    authored = Path(root)/"sources/SRC-MD-ASSEMBLY-CATALOG.json"
    if authored.is_file():
        old_connections = read_json(authored)["catalog"]["connections"]
        actual_connections = {c["id"]: c for c in catalog["reference_connections"]}
        if set(actual_connections) != {c["id"] for c in old_connections} or any(
            any(actual_connections[c["id"]].get(k) != value for k, value in c.items()) for c in old_connections):
            raise ValueError("Reference connections differ from the captured attributed assembly input")
    reviews = {r["owner_ref"]: r for r in catalog["instance_reviews"]}
    if set(reviews) != set(owners):
        raise ValueError("Source-instance review disposition is incomplete")
    for owner, review in reviews.items():
        expected_regions = [{"feature_ref": f["id"], "geometry_type": f["geometry"]["type"], **f["disposition"]}
            for f in catalog["features"] if f["owner_ref"] == owner and "disposition" in f]
        if review.get("regions") != expected_regions:
            raise ValueError("Source-region review disposition is incomplete or stale")
    actual_meshes = {s for p in owners.values() for s in p["sourceIds"] if sources[s]["format"].lower() == "stl"}
    expected = requirements.get("meshes", [])
    if {m["source_ref"] for m in expected} != actual_meshes or len(expected) != len(actual_meshes):
        raise ValueError("Independent mesh review scope does not cover every input mesh")
    result = []
    for mesh in expected:
        sid = mesh["source_ref"]
        if mesh["source_sha256"] != sources[sid]["digest"] or not mesh.get("review_basis") or not mesh.get("regions"):
            raise ValueError("Missing independent source review evidence: "+sid)
        for owner in (p for p in owners if sid in owners[p]["sourceIds"]):
            fs = [f for f in by_source[sid] if f["owner_ref"] == owner]
            # Entire source tessellation has a disposition, including residuals.
            triangles = {t for f in fs for t in f["geometry"]["triangle_indices"]}
            if len(triangles) != raw_cache[sid][1]:
                raise ValueError("Source triangle disposition incomplete: "+owner)
            if reviews[owner]["source_sha256"] != mesh["source_sha256"]:
                raise ValueError("Stale instance-to-source review mapping")
            for region in mesh["regions"]:
                required = set(region["triangle_indices"])
                applicable = fs
                if region.get("geometry_types"):
                    applicable = [f for f in fs if f["geometry"]["type"] in region["geometry_types"]]
                if region.get("kind"):
                    applicable = [f for f in applicable if f["kind"] == region["kind"]]
                covered = {t for f in applicable for t in f["geometry"]["triangle_indices"]} & required
                fraction = len(covered)/max(1, len(required))
                if fraction+1e-12 < region.get("minimum_coverage", 1.):
                    raise ValueError("Independent required region missing: "+region["id"]+" / "+owner+" coverage="+str(round(fraction, 4)))
                if region.get("require_entries"):
                    matched = {f["id"] for f in applicable if required & set(f["geometry"]["triangle_indices"])}
                    if not any(len(r["entries"]) >= 2 and matched & set(r["feature_refs"]) for r in resource_index.values()):
                        raise ValueError("Independent finite entry requirement missing: "+region["id"])
                result.append({"requirement_ref": region["id"], "owner_ref": owner, "status": "represented", "coverage": fraction})
    frame_index = {f["id"]: f for f in catalog["frames"]}
    if len(frame_index) != len(owners) or any(f.get("kind") != "source_local" or f.get("origin") != [0, 0, 0]
            or f.get("quaternion") != [0, 0, 0, 1] or f.get("motion_ownership") != "unresolved" for f in frame_index.values()):
        raise ValueError("Source-local Frame must retain its measured coordinate basis and unresolved motion ownership")
    from .compatibility import _templates
    template_ids = {t["id"] for t in _templates()}
    for feature in features.values():
        if feature.get("basis") == "mesh_measurement" and (feature.get("frame_ref") not in frame_index or frame_index[feature["frame_ref"]]["owner_ref"] != feature["owner_ref"]):
            raise ValueError("Measured Feature requires its own source-local Frame")
        capability = feature.get("capability", {})
        if capability.get("basis") != "geometric_potential" or not capability.get("unresolved_conditions") or any(t not in template_ids for t in capability.get("template_refs", [])):
            raise ValueError("Feature capability must remain a versioned geometric potential with explicit conditions")
        if not capability.get("resource_refs") or any(r not in resource_index or feature["id"] not in resource_index[r]["feature_refs"] for r in capability["resource_refs"]):
            raise ValueError("Feature capability resource must name its actual finite geometry")
    from .reference_usage import validate_reference_uses
    functional = validate_reference_uses(catalog, scene, root, requirements)
    return {**({"reference_uses": functional} if functional is not None else {}),
        "schema": "psop.capability-review/1", "status": "complete_for_declared_scope", "mesh_count": len(expected),
        "instance_count": len(owners), "checks": result,
        "limits": requirements.get("limits", []), "independent_requirements_sha256": hashlib.sha256(canonical(requirements)).hexdigest()}
