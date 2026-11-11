"""Finite raw geometry checks, independent of device names and declarations."""
from __future__ import annotations

import math
from pathlib import Path
import struct
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2.capability_geometry import discover, extract
from psop_build_v2.capability_profiles import discover_profiles


def _stl(triangles):
    return b"Capability geometry test".ljust(80, b"\0") + struct.pack("<I", len(triangles)) + b"".join(
        struct.pack("<12fH", 0., 0., 0., *(x for p in triangle for x in p), 0) for triangle in triangles)


def _basis(axis):
    length = math.sqrt(sum(x * x for x in axis))
    axis = tuple(x / length for x in axis)
    helper = (1., 0., 0.) if abs(axis[0]) < .8 else (0., 1., 0.)
    u = (axis[1] * helper[2] - axis[2] * helper[1], axis[2] * helper[0] - axis[0] * helper[2], axis[0] * helper[1] - axis[1] * helper[0])
    length = math.sqrt(sum(x * x for x in u));u = tuple(x / length for x in u)
    v = (axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0])
    return axis, u, v


def _wall(radius_start, radius_end, minimum, maximum, inward=True, axis=(0., 0., 1.),
          origin=(0., 0., 0.), sectors=72, warped_ends=False, ellipse=1.):
    axis, u, v = _basis(axis)
    def point(angle, top):
        t = maximum if top else minimum
        if warped_ends:
            t += .0003 * (math.sin(angle) if top else math.cos(angle))
        radius = radius_end if top else radius_start
        return tuple(origin[k] + axis[k] * t + u[k] * radius * math.cos(angle) + v[k] * radius * ellipse * math.sin(angle) for k in range(3))
    triangles = []
    for i in range(sectors):
        a, b = i * 2 * math.pi / sectors, (i + 1) * 2 * math.pi / sectors
        p, q, r, s = point(a, False), point(b, False), point(b, True), point(a, True)
        for triangle in ((p, q, r), (p, r, s)):
            triangles.append(triangle[::-1] if inward else triangle)
    return triangles


def _voxel_boundary(xs, ys, zs, occupied):
    """Exterior of an independently specified solid cell union, with winding."""
    coordinates = (xs, ys, zs)
    triangles = []
    for cell in sorted(occupied):
        for axis in range(3):
            u, v = (axis + 1) % 3, (axis + 2) % 3
            for step in (-1, 1):
                neighbor = list(cell);neighbor[axis] += step
                if tuple(neighbor) in occupied:
                    continue
                quad = []
                for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    index = list(cell);index[axis] += int(step > 0);index[u] += du;index[v] += dv
                    quad.append(tuple(coordinates[k][index[k]] for k in range(3)))
                if step < 0:
                    quad.reverse()
                triangles.extend(((quad[0], quad[1], quad[2]), (quad[0], quad[2], quad[3])))
    return triangles


def _convex_prism(polygon, length):
    triangles = []
    low, high = [(*p, 0.) for p in polygon], [(*p, length) for p in polygon]
    for i in range(1, len(polygon) - 1):
        triangles.append((low[0], low[i + 1], low[i]))
        triangles.append((high[0], high[i], high[i + 1]))
    for i in range(len(polygon)):
        j = (i + 1) % len(polygon)
        triangles.extend(((low[i], low[j], high[j]), (low[i], high[j], high[i])))
    return triangles


class CapabilityGeometry(unittest.TestCase):
    def assert_census(self, raw, result):
        count = struct.unpack_from("<I", raw, 80)[0]
        support = [i for f in result["features"] for i in f["geometry"]["triangle_indices"]]
        self.assertEqual(sorted(support), list(range(count)))
        self.assertEqual(len(support), len(set(support)))
        self.assertEqual(result["coverage"]["represented_fraction"], 1.)
        self.assertTrue(all(f["function_status"] == "unknown" for f in result["features"]))

    def test_arbitrary_axis_inner_cylinder_is_measured_in_source_frame(self):
        axis = (1., 2., 3.);unit_axis = _basis(axis)[0]
        raw = _stl(_wall(.0011, .0011, -.004, .003, axis=axis, origin=(.013, -.021, .008)))
        result = extract(raw)
        walls = [f for f in result["features"] if f["kind"] == "bore_wall"]
        self.assertEqual(len(walls), 1)
        self.assertEqual(walls[0]["geometry"]["type"], "cylinder")
        self.assertGreater(abs(sum(a * b for a, b in zip(walls[0]["geometry"]["axis"], unit_axis))), .999999)
        self.assertAlmostEqual(walls[0]["geometry"]["radius_m"], .0011, places=8)
        self.assertEqual(len(walls[0]["geometry"]["triangle_indices"]), 144)
        self.assert_census(raw, result)

    def test_inner_and_outer_cones_include_draft_and_45_degree_sink(self):
        for r0, r1, inward, axis in ((.0011, .0011 + math.tan(math.radians(3)) * .003, True, (1., 0., 0.)),
                                      (.002, .005, True, (1., -2., 1.)),
                                      (.0009, .000795184, False, (0., 1., 0.))):
            with self.subTest(inward=inward, axis=axis):
                raw = _stl(_wall(r0, r1, 0., .003, inward=inward, axis=axis))
                result = extract(raw)
                walls = [f for f in result["features"] if f["geometry"]["type"] == "conical_frustum"]
                self.assertEqual(len(walls), 1)
                wall = walls[0]
                self.assertEqual(wall["kind"], "bore_wall" if inward else "shaft_wall")
                radii = sorted((wall["geometry"]["radius_start_m"], wall["geometry"]["radius_end_m"]))
                self.assertAlmostEqual(radii[0], min(r0, r1), places=8)
                self.assertAlmostEqual(radii[1], max(r0, r1), places=8)
                self.assert_census(raw, result)

    def test_stepped_and_separated_material_is_not_filled_by_the_analytic_wall(self):
        triangles = _wall(.0011, .0011, -.004, -.001) + _wall(.0022, .0022, -.001, 0.) + _wall(.0011, .0011, .004, .005)
        raw = _stl(triangles);result = extract(raw)
        walls = [f for f in result["features"] if f["kind"] == "bore_wall"]
        self.assertEqual(len(walls), 3)
        self.assertEqual(sorted(len(f["geometry"]["triangle_indices"]) for f in walls), [144, 144, 144])
        for wall in walls:
            geometry = wall["geometry"]
            self.assertLess(geometry["axial_range_m"][1] - geometry["axial_range_m"][0], .003001)
        self.assert_census(raw, result)

    def test_radial_wall_with_nonplanar_clipped_rims_keeps_every_source_triangle(self):
        raw = _stl(_wall(.001, .001, .003, .006, axis=(0., 0., 1.), warped_ends=True))
        result = extract(raw)
        walls = [f for f in result["features"] if f["kind"] == "bore_wall"]
        self.assertEqual(len(walls), 1)
        self.assertEqual(len(walls[0]["geometry"]["triangle_indices"]), 144)
        self.assertAlmostEqual(walls[0]["geometry"]["radius_m"], .001, places=8)
        self.assert_census(raw, result)

    def test_elliptical_material_stays_unparameterized_and_is_not_invented_as_a_round_hole(self):
        raw = _stl(_wall(.001, .001, 0., .003, ellipse=1.5))
        result = extract(raw)
        self.assertFalse(any(f["kind"] in ("bore_wall", "shaft_wall") for f in result["features"]))
        self.assertTrue(result["regions"])
        self.assert_census(raw, result)

    def test_rectangular_plane_has_finite_boundary_and_cache_cannot_be_mutated_by_the_caller(self):
        a, b, c, d = (0., 0., 0.), (.004, 0., 0.), (.004, .002, 0.), (0., .002, 0.)
        raw = _stl([(a, b, c), (a, c, d)])
        result = extract(raw)
        self.assertEqual(len(result["features"]), 1)
        plane = result["features"][0]
        self.assertEqual(plane["semantic_role"], "rectangular_planar_surface")
        self.assertAlmostEqual(plane["profile_dimensions_m"]["width"], .004, places=8)
        self.assertEqual(len(plane["geometry"]["boundary_loops"][0]), 5)
        plane["geometry"]["triangle_indices"].clear()
        self.assertEqual(len(discover(raw)[0]["geometry"]["triangle_indices"]), 2)
        self.assert_census(raw, extract(raw))

    def test_invalid_binary_source_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "binary STL"):
            extract(b"not a mesh")

    def test_connected_piecewise_draft_is_segmented_with_a_separately_established_axis(self):
        # The middle seam changes taper by only a few degrees and has no
        # sharp circular rim. A separate coaxial wall establishes its axis.
        first = _wall(.002, .00215, 0., .003, inward=False)
        second = _wall(.00215, .00216, .003, .0035, inward=False)
        reference = _wall(.003, .00315, .005, .008, inward=False)
        raw = _stl(first + second + reference)
        result = extract(raw)
        walls = [f for f in result["features"] if f["geometry"]["type"] == "conical_frustum"]
        self.assertEqual(len(walls), 3)
        self.assertEqual(sorted(len(f["geometry"]["triangle_indices"]) for f in walls), [144, 144, 144])
        self.assert_census(raw, result)

    def test_circular_rim_can_establish_axis_before_any_single_wall_model_is_accepted(self):
        shallow = _wall(.0016, .0016 - .14 * .0001, 0., .0001, inward=True, axis=(1., 2., 3.))
        steeper = _wall(.0016, .0016 - .23 * .0001, 0., .0001, inward=True, axis=(1., 2., 3.))
        _, u, v = _basis((1., 2., 3.))
        rim = [tuple(.0016 * (u[k] * math.cos(i * 2 * math.pi / 72) + v[k] * math.sin(i * 2 * math.pi / 72)) for k in range(3)) for i in range(72)]
        cap = [((0., 0., 0.), rim[(i + 1) % 72], rim[i]) for i in range(72)]
        raw = _stl(shallow[:72] + steeper[72:] + cap)
        result = extract(raw)
        cones = [f for f in result["features"] if f["geometry"]["type"] == "conical_frustum"]
        self.assertEqual(len(cones), 2)
        self.assertTrue(all(f["measurement"]["axis_source"] == "circular_rim" for f in cones))
        self.assertEqual(sum(len(f["geometry"]["triangle_indices"]) for f in cones), 144)
        self.assert_census(raw, result)

    def test_small_conical_arc_needs_independent_axis_evidence(self):
        partial = _wall(.0035626773, .0033952378, -.0017948766, .003, inward=False)[:12]
        isolated = extract(_stl(partial))
        self.assertFalse(any(f["geometry"]["type"] == "conical_frustum" for f in isolated["features"]))
        reference = _wall(.001, .001, 0., .001, inward=True)
        raw = _stl(reference + partial)
        result = extract(raw)
        cones = [f for f in result["features"] if f["geometry"]["type"] == "conical_frustum"]
        self.assertEqual(len(cones), 1)
        self.assertEqual(len(cones[0]["geometry"]["triangle_indices"]), 12)
        self.assertAlmostEqual(cones[0]["measurement"]["angular_coverage"], 1 / 12, places=6)
        self.assertTrue(cones[0]["measurement"]["axis_support_triangle_indices"])
        self.assert_census(raw, result)


class FinitePolyhedralProfiles(unittest.TestCase):
    def test_plain_box_faces_do_not_become_keys_or_guides(self):
        raw = _stl(_voxel_boundary([0., .004], [0., .003], [0., .002], {(0, 0, 0)}))
        self.assertEqual(discover_profiles(raw), [])

    def test_local_capped_protrusion_requires_sides_and_a_larger_same_facing_base(self):
        occupied = {(i, j, 0) for i in range(3) for j in range(3)} | {(1, 1, 1)}
        raw = _stl(_voxel_boundary([-.004, -.001, .001, .004], [-.003, -.0008, .0008, .003], [0., .001, .002], occupied))
        profiles = discover_profiles(raw)
        keys = [f for f in profiles if f["semantic_role"] == "key"]
        self.assertEqual(len(keys), 1)
        key = keys[0]
        self.assertEqual(key["function_status"], "unknown")
        self.assertAlmostEqual(key["profile_dimensions_m"]["height_m"], .001, places=8)
        self.assertGreater(key["measurement"]["base_area_ratio"], 1.5)
        self.assertTrue(key["measurement"]["shared_edge_triangle_pairs"])
        key["geometry"]["triangle_indices"].clear()
        self.assertTrue(discover_profiles(raw)[0]["geometry"]["triangle_indices"])

    def test_open_channel_requires_inward_walls_and_actual_empty_source_gap(self):
        occupied = {(i, 0, 0) for i in range(3)} | {(0, 0, 1), (2, 0, 1)}
        raw = _stl(_voxel_boundary([-.004, -.001, .001, .004], [-.003, .003], [0., .001, .003], occupied))
        profiles = discover_profiles(raw)
        slots = [f for f in profiles if f["semantic_role"] == "slot" and f["profile_form"] == "opposed_empty_channel"]
        self.assertTrue(slots)
        self.assertAlmostEqual(slots[0]["profile_dimensions_m"]["width_m"], .002, places=8)
        self.assertEqual(slots[0]["measurement"]["empty_gap_sample_results"], [True] * 5)
        self.assertTrue(slots[0]["measurement"]["source_closed"])

    def test_oblique_extruded_face_profile_is_conditional_and_keeps_dihedral_evidence(self):
        polygon = [(0., 0.), (.01, 0.), (.01, .002), (.009, .003), (0., .003)]
        raw = _stl(_convex_prism(polygon, .02))
        guides = [f for f in discover_profiles(raw) if f["semantic_role"] == "guide"]
        self.assertTrue(guides)
        self.assertTrue(all(f["function_status"] == "unknown" and f["conditions"] for f in guides))
        self.assertTrue(all(f["measurement"]["shared_edge_triangle_pairs"] for f in guides))
        self.assertTrue(any(abs(f["measurement"]["face_angle_rad"] - math.pi / 4) < 1e-5 for f in guides))

    def test_supplied_plane_hints_are_rechecked_against_raw_even_with_a_warm_profile_cache(self):
        occupied = {(i, j, 0) for i in range(3) for j in range(3)} | {(1, 1, 1)}
        raw = _stl(_voxel_boundary([-.004, -.001, .001, .004], [-.003, -.0008, .0008, .003], [0., .001, .002], occupied))
        features = extract(raw)["features"]
        discover_profiles(raw, features)
        plane = next(f for f in features if f["geometry"]["type"] == "plane")
        plane["geometry"]["origin"][0] += .1
        plane["geometry"]["origin"][1] += .1
        plane["geometry"]["origin"][2] += .1
        with self.assertRaisesRegex(ValueError, "raw source"):
            discover_profiles(raw, features)


if __name__ == "__main__":
    unittest.main()
