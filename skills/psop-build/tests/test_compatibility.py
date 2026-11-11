"""Independent fixtures for finite, pose-independent cross-Part discovery."""
from copy import deepcopy
import json
import math
from pathlib import Path
import sys
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2.compatibility import build_candidates, query_candidates, query_mappings, query_primitive_pairs


def feature(owner, name, role="bore_wall", radius=.0011, shape="cylinder", **fields):
    geometry = {"type": shape, "origin": [0., 0., 0.], "axis": [0., 0., 1.],
                "radius_m": radius, "axial_range_m": [0., .004]}
    if shape == "conical_frustum":
        geometry = {"type": shape, "origin": [0., 0., 0.], "axis": [0., 0., 1.],
                    "radius_start_m": radius, "radius_end_m": radius+.0002, "length_m": .004}
    elif shape == "plane":
        geometry = {"type": "plane", "origin": [0., 0., 0.], "normal": [0., 0., 1.],
                    "area_m2": .0001, "boundary_loops": [[[0., 0., 0.], [.01, 0., 0.], [0., .01, 0.]]]}
    elif shape == "source_region":
        geometry = {"type": shape, "origin": [0., 0., 0.], "normal": [0., 0., 1.], "triangle_indices": [0]}
    value = {"id": owner+":"+name, "owner_ref": owner, "kind": role, "geometry": geometry,
             "frame_ref": "frame:"+owner, "function_status": "unknown", "evidence_refs": ["e:"+owner]}
    value.update(fields)
    return value


def fixture(features, kinds=None):
    owners = sorted({f["owner_ref"] for f in features})
    parts = [{"id": owner, "kind": (kinds or {}).get(owner, "part"), "position": [0., 0., 0.],
              "quaternion": [0., 0., 0., 1.]} for owner in owners]
    return parts, {"features": features, "interfaces": [], "resources": [], "connections": []}


def named(result, kind):
    return [c for c in result["candidates"] if c["template_ref"] == "mechanism:"+kind+":1"]


def add_pattern(catalog, owner, points, normal=(0., 0., 1.), axial_depth=0.):
    members = []
    for index, point in enumerate(points):
        item = feature(owner, str(index))
        item["geometry"]["origin"] = [point[0], point[1], axial_depth]
        catalog["features"].append(item)
        members.append({"id": owner+":member:"+str(index), "feature_refs": [item["id"]],
                        "position": [point[0], point[1], axial_depth], "direction": list(normal)})
    catalog["interfaces"].append({"id": owner+":pattern", "owner_ref": owner, "members": members,
                                   "evidence_refs": ["e:"+owner], "selection": {"kind": "unspecified"}})


def pattern_fixture(points_a, points_b=None, depth_b=.008):
    parts = [{"id": "a"}, {"id": "b"}]
    catalog = {"features": [], "interfaces": []}
    add_pattern(catalog, "a", points_a)
    add_pattern(catalog, "b", points_b or points_a, axial_depth=depth_b)
    result = build_candidates(parts, catalog)
    family = named(result, "through_fastener")[0]["mapping_family"]["pattern_families"][0]
    return parts, catalog, result, family


class Compatibility(unittest.TestCase):
    def test_source_world_placement_and_reference_relations_are_not_filters(self):
        parts, catalog = fixture([feature("a", "pin", "shaft_wall", .0009), feature("b", "hole")])
        original = deepcopy((parts, catalog))
        expected = build_candidates(parts, catalog)
        parts[0]["position"] = [1000., -83., 17.]
        parts[0]["quaternion"] = [.5, .5, .5, .5]
        parts[1]["position"] = [-6., 8., 4.]
        catalog["connections"] = [{"basis": "incompatible", "owner_refs": ["a", "b"]}]
        self.assertEqual(expected, build_candidates(parts, catalog))
        self.assertEqual(original[1]["features"], catalog["features"])
        self.assertTrue(named(expected, "cylindrical_insertion"))

    def test_radius_rejection_and_measurement_uncertainty_are_distinct(self):
        parts, catalog = fixture([feature("a", "pin", "shaft_wall", .002), feature("b", "hole", radius=.001)])
        rejected = build_candidates(parts, catalog)
        self.assertFalse(named(rejected, "cylindrical_insertion"))
        disposition = next(d for d in rejected["coverage"]["pair_dispositions"][0]["templates"]
                           if d["template_ref"] == "mechanism:cylindrical_insertion:1")
        self.assertEqual(disposition["status"], "no_match_in_scope")
        catalog["features"][0]["geometry"]["radius_m"] = .00102
        candidate = named(build_candidates(parts, catalog), "cylindrical_insertion")[0]
        self.assertEqual(candidate["geometric_witness"]["status"], "conditional")
        self.assertIn("manufacturing_fit_unknown", candidate["unresolved_conditions"])
        self.assertFalse(candidate["geometric_witness"]["manufacturing_tolerances_inferred"])

    def test_unknown_material_side_is_preserved_and_unsupported_is_not_a_negative(self):
        parts, catalog = fixture([feature("a", "surface", "cylindrical_surface"), feature("b", "bore")])
        self.assertIn("material_side_unknown", named(build_candidates(parts, catalog), "cylindrical_insertion")[0]["unresolved_conditions"])
        parts, catalog = fixture([feature("a", "region", "source_region", shape="source_region"), feature("b", "bore")])
        result = build_candidates(parts, catalog)
        self.assertEqual(result["coverage"]["unsupported_features"], ["a:region"])
        self.assertTrue(all(outcome["status"] == "insufficient_data" for outcome in result["coverage"]["pair_dispositions"][0]["templates"]))
        self.assertFalse(named(result, "latch_engagement"))

    def test_same_mesh_instances_stay_separate_and_every_pair_template_has_a_disposition(self):
        parts = [{"id": str(i), "meshKey": "same-mesh"} for i in range(70)]
        result = build_candidates(parts, {"features": [], "interfaces": []})
        coverage = result["coverage"]
        self.assertEqual(coverage["expected_unordered_instance_pairs"], 2415)
        self.assertEqual(coverage["evaluated_unordered_instance_pairs"], 2415)
        self.assertEqual(len(coverage["pair_dispositions"]), 2415)
        self.assertTrue(all(len(pair["templates"]) == 8 and pair["owner_refs"][0] != pair["owner_refs"][1] for pair in coverage["pair_dispositions"]))
        self.assertTrue(all(total["insufficient_data"] == 2415 for total in coverage["template_dispositions"].values()))

    def test_moving_hole_centers_axially_does_not_erase_transverse_patterns(self):
        _, _, result, family = pattern_fixture([(0., 0.), (.01, 0.), (.01, .01), (0., .01)], depth_b=.02)
        answer = query_mappings(family, size=4)
        self.assertTrue(answer["complete"])
        self.assertEqual(len(answer["items"]), 4)
        self.assertFalse(answer["placement_evaluated"])
        self.assertFalse(any("pose" in candidate for candidate in result["candidates"]))

    def test_rectangle_has_two_rotations_and_a_separately_addressed_flip_branch(self):
        _, _, _, family = pattern_fixture([(0., 0.), (.01, 0.), (.01, .02), (0., .02)])
        proper = query_mappings(family, size=4)
        flipped = query_mappings(family, size=4, entry_relation="opposed")
        self.assertEqual(len(proper["items"]), 2)
        self.assertEqual(len(flipped["items"]), 2)
        self.assertNotEqual(proper["items"], flipped["items"])

    def test_partial_four_to_six_member_patterns_are_enumerated(self):
        points = [(0., 0.), (.01, 0.), (.01, .01), (0., .01)]
        _, _, _, family = pattern_fixture(points, points+[(.03, 0.), (.03, .01)])
        answer = query_mappings(family, size=4)
        self.assertTrue(answer["complete"])
        self.assertEqual(len(answer["items"]), 4)
        self.assertTrue(all(len(mapping) == 4 for mapping in answer["items"]))

    def test_all_corresponding_distances_not_sorted_distance_multiset(self):
        # Two homometric 1D point sets have the same pair-distance multiset but
        # no distance-preserving bijection. No registration routine is used.
        a = [(x*.001, 0.) for x in [0, 1, 4, 10, 12, 17]]
        b = [(x*.001, 0.) for x in [0, 1, 8, 11, 13, 17]]
        distances = lambda points: sorted(round(abs(a[0]-b[0]), 9) for i, a in enumerate(points) for b in points[:i])
        self.assertEqual(distances(a), distances(b))
        _, _, _, family = pattern_fixture(a, b)
        answer = query_mappings(family, size=6)
        self.assertTrue(answer["complete"])
        self.assertEqual(answer["items"], [])

    def test_pagination_has_no_top_k_loss_and_is_bound_to_inputs_and_filters(self):
        parts, catalog = fixture([feature(owner, "hole") for owner in "abcd"])
        result = build_candidates(parts, catalog)
        full = query_candidates(result, page_size=10000)
        found, cursor = [], None
        while True:
            page = query_candidates(result, page_size=2, cursor=cursor)
            found.extend(page["items"])
            cursor = page["next_cursor"]
            if cursor is None:
                break
        self.assertEqual(found, full["items"])
        first = query_candidates(result, page_size=1)
        with self.assertRaises(ValueError):
            query_candidates(result, owner_refs=["a"], cursor=first["next_cursor"])
        changed = deepcopy(result)
        changed["input_digest"] = "sha256:"+"1"*64
        with self.assertRaises(ValueError):
            query_candidates(changed, cursor=first["next_cursor"])

    def test_mapping_branch_budget_resumes_and_matches_uninterrupted_enumeration(self):
        _, _, _, family = pattern_fixture([(0., 0.), (.01, 0.), (.01, .01), (0., .01)])
        full = query_mappings(family, size=4)
        found, cursor, stopped = [], None, False
        for _ in range(200):
            page = query_mappings(family, size=4, page_size=2, max_examined=7, cursor=cursor)
            found.extend(page["items"])
            stopped |= page["stop_reason"] == "max_examined"
            cursor = page["next_cursor"]
            if cursor is None:
                break
        else:
            self.fail("Mapping cursor did not make progress")
        self.assertTrue(stopped)
        self.assertEqual(found, full["items"])

    def test_plain_holes_need_connectors_and_do_not_invent_thread_size_or_length(self):
        parts, catalog = fixture([feature("a", "hole"), feature("b", "hole")])
        result = build_candidates(parts, catalog)
        self.assertFalse(named(result, "cylindrical_insertion"))
        screw = named(result, "screw_reception")[0]
        through = named(result, "through_fastener")[0]
        self.assertIn("receiving_thread_or_self_tapping_specification_unknown", screw["unresolved_conditions"])
        self.assertFalse(through["connector_requirements"][0]["catalog_sku_selected"])
        self.assertEqual(through["connector_requirements"][0]["length_status"], "requires_common_placement_and_stack")
        self.assertNotIn('"M2"', json.dumps(result))

    def test_threaded_receiver_pilot_bore_does_not_limit_major_shank_diameter(self):
        parts, catalog = fixture([feature("a", "clearance", radius=.0011),
                                  feature("b", "receiver", radius=.0008, thread={"nominal_diameter_m": .002, "pitch_m": .0004})])
        candidate = named(build_candidates(parts, catalog), "screw_reception")[0]
        options = query_primitive_pairs(candidate)["items"][0]["checks"][0]["options"]
        option = next(option for option in options if option["receiver_endpoint_index"] == 1)
        self.assertAlmostEqual(option["shank_diameter_upper_bound_m"], .0022)

    def test_finite_plane_cartesian_relation_is_compressed_without_dropping_pairs(self):
        parts, catalog = fixture([feature(owner, str(i), "planar_patch", shape="plane") for owner in "ab" for i in range(60)])
        candidate = named(build_candidates(parts, catalog), "planar_seating")[0]
        self.assertEqual(candidate["mapping_family"]["kind"], "cartesian_feature_relation")
        self.assertEqual(candidate["mapping_family"]["pair_count"], 3600)
        found, cursor = [], None
        while True:
            page = query_primitive_pairs(candidate, cursor=cursor, page_size=499)
            found.extend((p["feature_a_ref"], p["feature_b_ref"]) for p in page["items"])
            cursor = page["next_cursor"]
            if cursor is None:
                break
        self.assertEqual(len(found), 3600)
        self.assertEqual(len(set(found)), 3600)
        self.assertIn("seating_does_not_establish_retention", candidate["unresolved_conditions"])

    def test_redundant_old_geometry_and_opposite_entry_mixing_are_excluded(self):
        parts, catalog, _, _ = pattern_fixture([(0., 0.), (.01, 0.), (.01, .01), (0., .01)])
        old = feature("a", "redundant", candidate_eligible=False)
        catalog["features"].append(old)
        catalog["interfaces"][0]["members"][0]["direction"] = [0., 0., -1.]
        result = build_candidates(parts, catalog)
        self.assertIn(old["id"], result["coverage"]["excluded_redundant_features"])
        self.assertFalse(named(result, "through_fastener")[0]["mapping_family"]["pattern_families"])
        self.assertTrue(all(old["id"] not in e["feature_refs"] for c in result["candidates"] for e in c["endpoints"]))

    def test_bearing_conical_key_and_latch_template_families_execute(self):
        parts, catalog = fixture([feature("a", "shaft", "shaft_wall", .001), feature("b", "ring", radius=.00105)], {"b": "bearing"})
        self.assertTrue(named(build_candidates(parts, catalog), "bearing_fit"))
        parts, catalog = fixture([feature("a", "pin", "shaft_wall", .001, "conical_frustum"),
                                  feature("b", "bore", radius=.0012, shape="conical_frustum")])
        self.assertTrue(named(build_candidates(parts, catalog), "conical_insertion"))
        parts, catalog = fixture([feature("a", "key", "rectangular_key", shape="source_region", profile_dimensions_m=[.002, .001]),
                                  feature("b", "slot", "rectangular_slot", shape="source_region", profile_dimensions_m=[.0011, .0022])])
        self.assertTrue(named(build_candidates(parts, catalog), "keyed_guidance"))
        catalog["features"][0]["semantic_role"] = "latch_head"
        candidate = named(build_candidates(parts, catalog), "latch_engagement")[0]
        self.assertIn("elastic_material_and_deformation_unverified", candidate["unresolved_conditions"])

    def test_replacement_segments_preserve_authored_member_and_entry_identity(self):
        parts, catalog, _, _ = pattern_fixture([(0., 0.), (.01, 0.), (.01, .01), (0., .01)])
        old = catalog["features"][0]
        replacement = deepcopy(old)
        replacement["id"] = old["id"]+":measured"
        old["candidate_eligible"] = False
        old["replacement_feature_refs"] = [replacement["id"]]
        catalog["features"].append(replacement)
        catalog["resources"] = [{"id": "resource:a", "owner_ref": "a", "kind": "logical_hole",
                                  "feature_refs": [replacement["id"]],
                                  "entries": [{"id": "entry:a", "feature_ref": replacement["id"], "side": "low",
                                               "position": [0., 0., 0.], "direction": [0., 0., 1.]}]}]
        candidate = named(build_candidates(parts, catalog), "through_fastener")[0]
        family = candidate["mapping_family"]["pattern_families"][0]
        self.assertEqual(len(query_mappings(family, size=4)["items"]), 4)
        edge = next(item for item in query_primitive_pairs(candidate)["items"] if item["feature_a_ref"] == replacement["id"])
        self.assertEqual(edge["members_a"][0]["member_ref"], "a:member:0")
        self.assertEqual(edge["entry_refs_a"], ["entry:a"])

    def test_large_pcb_pattern_has_quadratic_handedness_data_and_bounded_query(self):
        points = [(index*.002, (index % 3)*.002) for index in range(61)]
        _, _, _, family = pattern_fixture(points)
        group = family["a"]
        self.assertEqual(sum(len(row) for row in group["reference_area_lower_triangle_m2"]), 61*60//2)
        self.assertNotIn("oriented_triple_areas_m2", group)
        page = query_mappings(family, size=61, page_size=2, max_examined=25)
        self.assertFalse(page["complete"])
        self.assertEqual(page["stop_reason"], "max_examined")
        self.assertLessEqual(page["events_examined"], 25)
        self.assertIsNotNone(page["next_cursor"])

    def test_key_witness_preserves_dimensions_polarity_and_finite_length(self):
        parts, catalog = fixture([feature("a", "profile", "surface_region", shape="source_region",
            profile_dimensions_m={"width_m": .002, "height_m": .001, "length_m": .006},
            measurement={"profile_polarity": "convex"}),
            feature("b", "profile", "surface_region", shape="source_region",
            profile_dimensions_m={"width_m": .0021, "height_m": .0011, "length_m": .004},
            measurement={"profile_polarity": "concave"})])
        candidate = named(build_candidates(parts, catalog), "keyed_guidance")[0]
        checks = query_primitive_pairs(candidate)["items"][0]["checks"]
        rectangle = next(check for check in checks if check["kind"] == "rectangular_envelope")
        self.assertEqual(rectangle["dimensions_a_m"], [.002, .001])
        self.assertEqual(rectangle["dimensions_b_m"], [.0021, .0011])
        self.assertEqual(rectangle["profile_polarities"], ["convex", "concave"])
        self.assertEqual(rectangle["axis_order_options"], [0])
        self.assertAlmostEqual(rectangle["clearance_options"][0]["clearance_intervals_m"][0][0], .00006)
        length = next(check for check in checks if check["kind"] == "finite_segments")
        self.assertEqual(length["lengths_m"], [.006, .004])
        self.assertEqual(length["maximum_possible_overlap_m"], .004)
        self.assertTrue(length["required_overlap_unknown"])

    def test_stepped_parallel_patterns_keep_axial_offsets_as_unverified_measurements(self):
        parts, catalog, _, _ = pattern_fixture([(0., 0.), (.01, 0.), (.01, .01), (0., .01)])
        for interface, offsets in zip(catalog["interfaces"], ([0., .002, -.001, .004], [.01, .014, .006, .011])):
            for member, offset in zip(interface["members"], offsets):
                member["position"][2] = offset
        result = build_candidates(parts, catalog)
        family = named(result, "through_fastener")[0]["mapping_family"]["pattern_families"][0]
        self.assertEqual(family["a"]["relative_axial_offsets_m"], [0., .002, -.001, .004])
        self.assertEqual(len(query_mappings(family, size=4)["items"]), 4)
        self.assertIn("finite_axial_registration_and_insertion_depth_not_evaluated", family["conditions"])
        self.assertNotIn("same_local_motion_frame", family["constraints"])

    def test_source_measurement_frames_do_not_claim_or_require_common_rigid_motion(self):
        parts, catalog, _, _ = pattern_fixture([(0., 0.), (.01, 0.), (.01, .01), (0., .01)])
        catalog["features"][0]["frame_ref"] = "frame:a:source-unknown-one"
        catalog["features"][1]["frame_ref"] = "frame:a:source-unknown-two"
        family = named(build_candidates(parts, catalog), "through_fastener")[0]["mapping_family"]["pattern_families"][0]
        self.assertEqual(family["a"]["motion_ownership_status"], "unverified")
        self.assertIsNone(family["a"]["frame_ref"])
        self.assertEqual(len(query_mappings(family, size=4)["items"]), 4)
        self.assertIn("common_motion_ownership_not_verified", family["conditions"])

    def nonparallel_family(self, gap_b=.004, angle_b=math.pi/2, angle_a=math.pi/2):
        parts, catalog = fixture([feature(owner, str(i)) for owner in "ab" for i in range(2)])
        # B uses a different source coordinate basis, and each entry is shifted
        # freely along its own axis. Axis distances/angles still agree.
        specifications = {"a": [([0., 0., 0.], [0., 0., 1.]), ([0., .004, 0.], [math.sin(angle_a), 0., math.cos(angle_a)])],
            "b": [([.05, .02, .01], [1., 0., 0.]),
                  ([.03, .02+gap_b, .02], [math.cos(angle_b), 0., math.sin(angle_b)])]}
        for owner in "ab":
            members = []
            for i, (position, direction) in enumerate(specifications[owner]):
                members.append({"id": owner+":member:"+str(i), "feature_refs": [owner+":"+str(i)],
                                "position": position, "direction": direction})
            catalog["interfaces"].append({"id": owner+":multi-axis", "owner_ref": owner, "members": members})
        candidate = named(build_candidates(parts, catalog), "through_fastener")[0]
        return candidate["mapping_family"]["pattern_families"][0]

    def test_nonparallel_axes_compare_invariant_line_distance_and_angle(self):
        family = self.nonparallel_family()
        self.assertEqual(family["kind"], "axis_line_member_relation")
        self.assertAlmostEqual(family["a"]["axis_line_distance_lower_triangle_m"][1][0], .004)
        self.assertAlmostEqual(family["b"]["axis_line_distance_lower_triangle_m"][1][0], .004)
        answer = query_mappings(family, size=2)
        self.assertTrue(answer["complete"])
        self.assertEqual(len(answer["items"]), 2)
        self.assertFalse(answer["handedness_evaluated"])
        self.assertFalse(answer["placement_evaluated"])
        self.assertIn("nonparallel_handedness_and_common_placement_unverified", answer["conditions"])

    def test_nonparallel_angle_and_line_distance_mismatches_are_scope_negatives(self):
        for family in (self.nonparallel_family(angle_b=math.pi/3), self.nonparallel_family(gap_b=.006)):
            with self.subTest(family=family["id"]):
                answer = query_mappings(family, size=2)
                self.assertTrue(answer["complete"])
                self.assertEqual(answer["items"], [])
                self.assertEqual(answer["assessment_scope"], "pose_independent_necessary_invariants")

    def test_unconfirmed_entry_directions_do_not_reject_supplementary_axis_angles(self):
        family = self.nonparallel_family(angle_a=math.pi/3, angle_b=2*math.pi/3)
        self.assertEqual(len(query_mappings(family, size=2)["items"]), 2)
        self.assertAlmostEqual(family["a"]["axis_angle_lower_triangle_rad"][1][0], math.pi/3)
        self.assertAlmostEqual(family["b"]["axis_angle_lower_triangle_rad"][1][0], math.pi/3)
        self.assertAlmostEqual(family["b"]["directed_entry_angle_lower_triangle_rad"][1][0], 2*math.pi/3)


if __name__ == "__main__":
    unittest.main()
