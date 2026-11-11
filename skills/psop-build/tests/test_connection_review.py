"""Finite cavity witnesses and pair review regressions independent of Microduck."""
from copy import deepcopy
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2 import connection_review
from test_semantics import binary, cap, wall
from test_mounting_patterns import taper


def through_taper():
    return (wall(.004, 0., .004) + taper(.001, .002, .004, inward=True)
            + cap(.001, .004, 0., False) + cap(.002, .004, .004))


def two_blind_cavities():
    upper = [tuple((p[0], p[1], p[2] + .006) for p in t) for t in taper(.001, .0015, .004, inward=True)]
    return (wall(.004, 0., .010) + cap(.0015, .004, 0., False) + cap(.0015, .004, .010)
            + taper(.0015, .001, .004, inward=True) + cap(0., .001, .004, False)
            + upper + cap(0., .001, .006))


class FiniteCircularCavities(unittest.TestCase):
    def test_true_inner_rings_and_variable_wall_have_source_edge_witnesses(self):
        result = connection_review._mesh_openings(binary(through_taper()))
        self.assertEqual(len(result["openings"]), 2)
        self.assertEqual(sorted(round(x["geometry"]["radius_m"], 7) for x in result["openings"]), [.001, .002])
        self.assertTrue(all(len(x["geometry"]["boundary_vertices"]) == 73 for x in result["openings"]))
        self.assertEqual(len(result["cavities"]), 1)
        cavity = result["cavities"][0]
        self.assertEqual(cavity["status"], "topology_witnessed")
        self.assertTrue(cavity["connectivity"]["boundary_closed"])
        self.assertEqual(len(cavity["opening_tokens"]), 2)
        # Exterior end plates and outer wall do not become cavity wall area.
        self.assertEqual(cavity["wall_triangle_indices"], list(range(144, 288)))
        self.assertAlmostEqual(cavity["geometry"]["radius_range_m"][0], .001, places=8)
        self.assertAlmostEqual(cavity["geometry"]["radius_range_m"][1], .002, places=8)

    def test_two_coaxial_blind_cavities_do_not_connect_through_the_closed_bottoms(self):
        result = connection_review._mesh_openings(binary(two_blind_cavities()))
        self.assertEqual(len(result["openings"]), 2)
        self.assertEqual(len(result["cavities"]), 2)
        self.assertTrue(all(cavity["status"] == "partial" and len(cavity["opening_tokens"]) == 1 for cavity in result["cavities"]))
        self.assertTrue(all(cavity["geometry"]["axial_range_m"][1] - cavity["geometry"]["axial_range_m"][0] < .004001 for cavity in result["cavities"]))

    def test_coaxial_rings_without_source_walls_do_not_create_a_passage(self):
        result = connection_review._mesh_openings(binary(cap(.001, .003, 0.) + cap(.001, .003, .004, False)))
        self.assertEqual(len(result["openings"]), 2)
        self.assertEqual(result["cavities"], [])

    def test_closed_disk_does_not_become_an_inner_opening(self):
        result = connection_review._mesh_openings(binary(wall(.002, 0., .004) + cap(0., .002, 0., False) + cap(0., .002, .004)))
        self.assertEqual(result["openings"], [])
        self.assertEqual(result["cavities"], [])

    def test_reversed_shell_and_open_wall_cannot_certify_complete_topology(self):
        for triangles in ([t[::-1] for t in through_taper()], through_taper()[:-1]):
            with self.subTest(triangles=len(triangles)):
                result = connection_review._mesh_openings(binary(triangles))
                self.assertFalse(any(c["status"] == "topology_witnessed" for c in result["cavities"]))

    def test_axis_permutation_and_cache_do_not_change_source_identity(self):
        raw = binary([tuple((p[2], p[0], p[1]) for p in t) for t in through_taper()])
        first = connection_review._mesh_openings(raw)
        self.assertEqual(first["cavities"][0]["geometry"]["axis"], [1., 0., 0.])
        self.assertEqual(first["cavities"][0]["wall_triangle_indices"], list(range(144, 288)))
        original = deepcopy(first)
        first["openings"][0]["geometry"]["center"][0] += 1.
        self.assertEqual(connection_review._mesh_openings(raw), original)


def part(name, mesh="unclassified"):
    return {"id": "part:synthetic:" + name, "name": name, "meshKey": mesh, "kind": "structure", "body": "same_body_is_not_a_connection",
            "position": [0., 0., 0.], "quaternion": [0., 0., 0., 1.], "scale": [1., 1., 1.], "sourceIds": ["SRC-" + name], "evidenceIds": ["evidence:" + name]}


class PairConnectionReview(unittest.TestCase):
    def test_every_pair_is_screened_and_nearness_never_becomes_mechanical_success(self):
        parts = [part("a"), part("b"), part("c"), part("d")]
        bounds = {p["id"]: [[i * .02, 0., 0.], [i * .02 + .001, .001, .001]] for i, p in enumerate(parts)}
        bounds[parts[1]["id"]] = [[.002, 0., 0.], [.003, .001, .001]]
        base = {"features": [], "reference_observations": [], "reference_mounts": [], "mounting_sites": []}
        screening, reviews, supplements = connection_review._pair_reviews(base, {"parts": parts}, [], bounds, None)
        self.assertEqual(len(screening), 6)
        self.assertEqual(len({tuple(x["part_refs"]) for x in screening}), 6)
        self.assertEqual(len(reviews), 1)
        self.assertEqual(supplements, [])
        self.assertEqual(reviews[0]["basis"], ["source_bounds"])
        self.assertTrue(all(x == "unknown" for x in reviews[0]["assessments"].values()))
        self.assertTrue(all(x["status"] == "unresolved" for x in reviews[0]["role_paths"]))
        self.assertTrue(all(not p["site_refs"] and not p["feature_refs"] for p in reviews[0]["participants"]))

    def test_explicit_reference_relationship_survives_a_smaller_proximity_threshold(self):
        a, b = part("a"), part("b")
        bounds = {a["id"]: [[0., 0., 0.], [.001, .001, .001]], b["id"]: [[.01, 0., 0.], [.011, .001, .001]]}
        reference = {"id": "reference:synthetic:known", "participants": [{"part_ref": a["id"], "site_refs": []}, {"part_ref": b["id"], "site_refs": []}], "site_pairs": []}
        base = {"features": [], "reference_observations": [], "reference_mounts": [reference], "mounting_sites": []}
        screening, reviews, supplements = connection_review._pair_reviews(base, {"parts": [a, b]}, [], bounds, None)
        self.assertGreater(screening[0]["distance_m"], screening[0]["threshold_m"])
        self.assertEqual(screening[0]["status"], "review_required")
        self.assertEqual(screening[0]["review_ref"], reviews[0]["id"])
        self.assertEqual(reviews[0]["reference_mount_refs"], [reference["id"]])
        self.assertEqual(reviews[0]["status"], "reference_supported")
        self.assertTrue(all(x == "unknown" for x in reviews[0]["assessments"].values()))

    def test_pin_role_is_not_assigned_to_every_neighbor_of_a_part(self):
        a, b = part("pin-bracket"), part("neighbor")
        sites = [{"id": "site:pin", "owner_ref": a["id"], "site_kind": "integral_pin", "role": "mounting_feature", "position": [0., 0., 0.], "entry_direction": [0., 0., 1.], "feature_refs": ["feature:pin"]}]
        features = [{"id": "feature:pin", "geometry": {"length_m": .003}}]
        self.assertEqual(connection_review._pin_matches(sites, features, a, b, .00002), [])

    def test_schematic_is_a_synthetic_option_and_has_a_proper_world_orientation(self):
        value = connection_review._supplement("supplement:synthetic:x", "review:synthetic:x", "Unconfirmed", "screw", [1., 2., 3.], [0., -1., 0.], ["manufacturer:general"], ["evidence:general"])
        self.assertEqual(value["status"], "illustrative_unconfirmed")
        self.assertEqual(value["domain"], "synthetic")
        self.assertEqual(value["bom_status"], "not_confirmed")
        self.assertAlmostEqual(sum(x * x for x in value["pose"]["quaternion"]), 1.)
        self.assertIn("exact geometry and dimensions", value["unconfirmed_fields"])


if __name__ == "__main__":
    unittest.main()
