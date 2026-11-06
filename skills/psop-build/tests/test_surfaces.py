"""Finite-region, transform and uncertainty regressions for planar candidates."""
from __future__ import annotations

import copy
import hashlib
import math
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2 import mechanics, surfaces


def binary_stl(triangles):
    return b"Synthetic finite planar surfaces".ljust(80, b"\0") + struct.pack("<I", len(triangles)) + b"".join(
        struct.pack("<12fH", 0., 0., 0., *(x for vertex in triangle for x in vertex), 0) for triangle in triangles)


def quad(minimum=(-.002, -.002), maximum=(.002, .002), z=0., up=True):
    a, b = minimum, maximum
    v = [(a[0], a[1], z), (b[0], a[1], z), (b[0], b[1], z), (a[0], b[1], z)]
    triangles = [(v[0], v[1], v[2]), (v[0], v[2], v[3])]
    return triangles if up else [triangle[::-1] for triangle in triangles]


def ring(up=True):
    outer = [(-.002, -.002, 0.), (.002, -.002, 0.), (.002, .002, 0.), (-.002, .002, 0.)]
    inner = [(-.001, -.001, 0.), (.001, -.001, 0.), (.001, .001, 0.), (-.001, .001, 0.)]
    triangles = []
    for i in range(4):
        j = (i + 1) % 4
        triangles.extend(((outer[i], outer[j], inner[j]), (outer[i], inner[j], inner[i])))
    return triangles if up else [triangle[::-1] for triangle in triangles]


def box(minimum, maximum):
    x, y, z = minimum
    a, b, c = maximum
    vertices = [(x, y, z), (a, y, z), (a, b, z), (x, b, z), (x, y, c), (a, y, c), (a, b, c), (x, b, c)]
    sides = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    return [(vertices[q[0]], vertices[q[1]], vertices[q[2]]) for q in sides] + [(vertices[q[0]], vertices[q[2]], vertices[q[3]]) for q in sides]


class FiniteSurfaces(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="psop-surfaces-")
        self.root = Path(self.directory.name)
        (self.root / "sources").mkdir()
        self.scene = {"parts": [], "sources": [], "bodies": [], "joints": []}

    def tearDown(self):
        self.directory.cleanup()

    def part(self, name, triangles, position=(0., 0., 0.), quaternion=(0., 0., 0., 1.), scale=(1., 1., 1.)):
        raw = binary_stl(triangles)
        relative, source_id = "sources/" + name + ".stl", "SRC-" + name
        (self.root / relative).write_bytes(raw)
        self.scene["sources"].append({"id": source_id, "url": relative, "digest": hashlib.sha256(raw).hexdigest()})
        part = {"id": "part:synthetic:" + name, "name": name, "body": "reference_group", "geometryUrl": relative,
                "position": list(position), "quaternion": list(quaternion), "scale": list(scale),
                "sourceIds": [source_id], "evidenceIds": ["evidence:" + name + ":stl"]}
        self.scene["parts"].append(part)
        return part

    def surface_candidates(self, result):
        return [c for c in result["connection_candidates"] if c.get("kind") == "surface_fit"]

    def test_hole_boundaries_are_preserved_and_bounds_overlap_does_not_fill_hole(self):
        self.part("annulus", ring())
        self.part("inside_hole", quad((-.0005, -.0005), (.0005, .0005), up=False))
        result = surfaces.analysis_for(self.scene, self.root)
        patches = surfaces._planar_mesh((self.root / "sources/annulus.stl").read_bytes())["patches"]
        self.assertEqual(len(patches), 1)
        self.assertEqual(len(patches[0]["loops"]), 2)
        self.assertTrue(all(loop[0] == loop[-1] for loop in patches[0]["loops"]))
        self.assertAlmostEqual(patches[0]["area"], 12e-6, places=11)
        self.assertEqual(self.surface_candidates(result), [])
        self.assertEqual(result["analysis"]["coverage"]["unpaired_planar_regions_count"], 2)

    def test_real_triangle_intersection_excludes_hole_area(self):
        self.part("annulus", ring())
        self.part("cover", quad(up=False))
        result = surfaces.analysis_for(self.scene, self.root)
        candidates = self.surface_candidates(result)
        self.assertEqual(len(candidates), 1)
        pair = candidates[0]["surface_pairs"][0]
        self.assertAlmostEqual(pair["overlap_area_m2"], 12e-6, places=11)
        self.assertAlmostEqual(pair["normal_angle_rad"], math.pi)
        self.assertEqual(candidates[0]["direction_assessment"]["status"], "unknown")
        self.assertTrue(all(d["result"] == "unknown" for d in candidates[0]["direction_assessment"]["directions"]))

    def test_same_normals_and_disjoint_finite_regions_do_not_match(self):
        self.part("one", quad())
        self.part("same_normal", quad())
        self.part("apart", quad(up=False), position=(.01, 0., 0.))
        self.assertEqual(self.surface_candidates(surfaces.analysis_for(self.scene, self.root)), [])

    def test_full_rotation_translation_and_nonuniform_scale_are_used_only_for_pairing(self):
        half = math.sqrt(.5)
        triangles = quad((0., 0.), (.002, .003))
        left = self.part("left", triangles, position=(.1, -.2, .3), quaternion=(half, 0., 0., half), scale=(2., 3., 4.))
        self.part("right", [triangle[::-1] for triangle in triangles], position=(.1, -.2, .3), quaternion=(half, 0., 0., half), scale=(2., 3., 1.))
        result = surfaces.analysis_for(self.scene, self.root)
        candidates = self.surface_candidates(result)
        self.assertEqual(len(candidates), 1)
        self.assertAlmostEqual(candidates[0]["surface_pairs"][0]["overlap_area_m2"], 36e-6, places=10)
        feature = next(f for f in result["features"] if f["owner_ref"] == left["id"] and f["kind"] == "planar_patch")
        self.assertAlmostEqual(feature["geometry"]["area_m2"], 6e-6, places=11)
        self.assertEqual(feature["geometry"]["normal"], [0., 0., 1.])

    def test_plane_gap_is_bounded_and_clearance_is_not_instantaneous_blocking(self):
        self.part("one", box((0., 0., 0.), (.004, .004, .002)))
        self.part("near", box((0., 0., .00202), (.004, .004, .00402)))
        self.part("far", quad(up=False), position=(0., 0., .01))
        candidates = self.surface_candidates(surfaces.analysis_for(self.scene, self.root))
        self.assertEqual(len(candidates), 1)
        self.assertAlmostEqual(candidates[0]["surface_pairs"][0]["plane_gap_m"], .00002, places=9)
        self.assertEqual(candidates[0]["direction_assessment"]["status"], "partial")
        self.assertTrue(all(d["result"] == "not_blocked_by_selected_surfaces" for d in candidates[0]["direction_assessment"]["directions"]))

    def test_closed_outward_mesh_allows_only_local_halfspace_assessment(self):
        left = self.part("one", box((0., 0., 0.), (.004, .004, .002)))
        self.part("other", box((0., 0., .002), (.004, .004, .004)))
        candidates = self.surface_candidates(surfaces.analysis_for(self.scene, self.root))
        self.assertEqual(len(candidates), 1)
        assessment = candidates[0]["direction_assessment"]
        self.assertEqual(assessment["moving_part_ref"], left["id"])
        self.assertEqual(assessment["status"], "partial")
        self.assertEqual(next(d for d in assessment["directions"] if d["vector"] == [0., 0., 1.])["result"], "locally_blocked")
        self.assertEqual(next(d for d in assessment["directions"] if d["vector"] == [0., 0., -1.])["result"], "not_blocked_by_selected_surfaces")
        self.assertTrue(any("reachable" in text for text in assessment["limitations"]))

    def test_stationary_open_surface_keeps_direction_unknown_even_with_closed_moving_mesh(self):
        self.part("one", box((0., 0., 0.), (.004, .004, .002)))
        self.part("open_peer", quad((0., 0.), (.004, .004), z=.002, up=False))
        candidates = self.surface_candidates(surfaces.analysis_for(self.scene, self.root))
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["direction_assessment"]["status"], "unknown")
        self.assertTrue(all(d["result"] == "unknown" for d in candidates[0]["direction_assessment"]["directions"]))

    def test_two_perpendicular_seats_are_one_compound_pair_but_not_an_enclosure(self):
        horizontal = quad((0., 0.), (.004, .004))
        vertical = [[(v[2], v[1], v[0]) for v in triangle[::-1]] for triangle in horizontal]
        self.part("corner", horizontal + vertical)
        self.part("peer", [triangle[::-1] for triangle in horizontal + vertical])
        result = surfaces.analysis_for(self.scene, self.root)
        candidates = self.surface_candidates(result)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(len(candidates[0]["surface_pairs"]), 2)
        surface_interfaces = [i for i in result["interfaces"] if i.get("kind") == "surface_fit"]
        self.assertEqual(len(surface_interfaces), 2)
        self.assertTrue(all(i["mechanism_candidates"] == ["surface_seating"] for i in surface_interfaces))

    def test_known_cylinder_facets_are_excluded_without_losing_annular_end_face(self):
        triangles = []
        count = 72
        for i in range(count):
            angle, following = 2 * math.pi * i / count, 2 * math.pi * (i + 1) / count
            outer = [(.005 * math.cos(a), .005 * math.sin(a), z) for a, z in ((angle, 0.), (following, 0.), (following, .004), (angle, .004))]
            inner = [(.003 * math.cos(a), .003 * math.sin(a), .004) for a in (angle, following)]
            triangles.extend(((outer[0], outer[1], outer[2]), (outer[0], outer[2], outer[3]),
                              (outer[3], outer[2], inner[1]), (outer[3], inner[1], inner[0])))
        self.part("round_wall_and_seat", triangles)
        self.part("annular_peer", [triangle[::-1] for i, triangle in enumerate(triangles) if i % 4 in (2, 3)])
        result = surfaces.analysis_for(self.scene, self.root)
        planes = [f for f in result["features"] if f["kind"] == "planar_patch" and f["owner_ref"].endswith(":round_wall_and_seat")]
        self.assertEqual(len(planes), 1)
        self.assertEqual(len(planes[0]["geometry"]["boundary_loops"]), 2)
        self.assertTrue(all(t % 4 in (2, 3) for t in planes[0]["geometry"]["triangle_indices"]))

    def test_source_binding_and_frozen_cylinders_are_preserved_without_scene_mutation(self):
        self.part("one", quad())
        self.part("peer", quad(up=False))
        original = copy.deepcopy(self.scene)
        before = mechanics.analysis_for(self.scene, self.root)
        result = surfaces.analysis_for(self.scene, self.root)
        self.assertEqual(self.scene, original)
        self.assertEqual(before, mechanics.analysis_for(self.scene, self.root))
        self.assertEqual(result["frames"], before["frames"])
        feature = next(f for f in result["features"] if f["kind"] == "planar_patch" and f["owner_ref"].endswith(":one"))
        self.assertEqual(feature["geometry_source_ref"], "SRC-one")
        self.assertEqual(feature["geometry_digest"], "sha256:" + self.scene["sources"][0]["digest"])
        self.assertEqual(feature["geometry"]["triangle_indices"], [0, 1])
        self.assertEqual(feature["evidence_refs"], ["evidence:one:stl"])
        self.assertEqual(result["analysis"]["coverage"]["feature_type_status"]["snap_geometry"], "not_analyzed")
        self.scene["sources"][0]["digest"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "digest"):
            surfaces.analysis_for(self.scene, self.root)


if __name__ == "__main__":
    unittest.main()
