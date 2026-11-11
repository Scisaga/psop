"""Finite geometry regressions separate from functional mounting declarations."""
from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2 import mechanics


FIXTURE = Path(__file__).parent / "fixtures/left-shell-z-bore.stl"


def binary_stl(triangles):
    return b"Synthetic finite wall for discovery regression".ljust(80, b"\0") + struct.pack("<I", len(triangles)) + b"".join(
        struct.pack("<12fH", 0., 0., 0., *(value for point in triangle for value in point), 0) for triangle in triangles)


def wall(inward=True, ellipse=1., taper=0., angle=2 * math.pi):
    triangles = []
    for i in range(72):
        a, b = i * angle / 72, (i + 1) * angle / 72
        radius = .0011
        points = [(radius * math.cos(a), radius * ellipse * math.sin(a), -.001),
                  (radius * math.cos(b), radius * ellipse * math.sin(b), -.001),
                  ((radius + taper) * math.cos(b), (radius + taper) * ellipse * math.sin(b), .001),
                  ((radius + taper) * math.cos(a), (radius + taper) * ellipse * math.sin(a), .001)]
        for triangle in ((points[0], points[1], points[2]), (points[0], points[2], points[3])):
            triangles.append(triangle[::-1] if inward else triangle)
    return triangles


def transform(raw, quaternion, position):
    count = struct.unpack_from("<I", raw, 80)[0]
    triangles = []
    for i in range(count):
        values = struct.unpack_from("<12fH", raw, 84 + 50 * i)
        triangle = []
        for offset in (3, 6, 9):
            rotated = mechanics._rotate(values[offset:offset + 3], quaternion)
            triangle.append(tuple(rotated[j] + position[j] for j in range(3)))
        triangles.append(triangle)
    return binary_stl(triangles)


class StructureDiscovery(unittest.TestCase):
    def test_original_shell_wall_recovers_same_source_location_and_triangle_identity(self):
        raw = FIXTURE.read_bytes()
        metadata = json.loads(FIXTURE.with_suffix(".json").read_text(encoding="utf-8"))
        self.assertEqual(hashlib.sha256(raw).hexdigest(), metadata["fixture_sha256"])
        self.assertEqual(metadata["source_sha256"], "2abde8e2b79c9b011cdb11957c67ab4287b45d7301affd4235ab81141118e331")
        self.assertEqual(metadata["source_part_ref"], "part:microduck:e27cbdd6c07a264e")
        self.assertEqual(mechanics._extract(raw)["features"], [], "Frozen normals fragment the actual source wall")
        result = mechanics.discover_structures(raw)
        self.assertEqual(len(result), 1)
        candidate = result[0]
        self.assertEqual(candidate["kind"], "bore_wall")
        self.assertEqual(candidate["geometry"]["axis"], [0., 0., 1.])
        self.assertAlmostEqual(candidate["geometry"]["origin"][0], .0255, places=8)
        self.assertAlmostEqual(candidate["geometry"]["origin"][1], -.0095, places=8)
        self.assertAlmostEqual(candidate["geometry"]["radius_m"], .0011, places=8)
        self.assertEqual(candidate["support_triangle_indices"], list(range(180)))
        mapped_source = [metadata["source_triangle_indices"][index] for index in candidate["support_triangle_indices"]]
        self.assertEqual(mapped_source[:4], [4213, 4214, 4215, 4216])
        self.assertEqual(len(set(mapped_source)), 180)
        self.assertAlmostEqual(candidate["measurement"]["coverage"], 1., places=7)
        self.assertLess(candidate["measurement"]["fit_max_m"], 1e-8)

    def test_arbitrary_source_mesh_rotation_and_translation_preserve_finite_wall(self):
        # Neither a coordinate permutation nor a placement-only rotation: the
        # actual source STL is rotated about an oblique axis before discovery.
        quaternion = [math.sin(.43) / math.sqrt(14), 2 * math.sin(.43) / math.sqrt(14),
                      3 * math.sin(.43) / math.sqrt(14), math.cos(.43)]
        position = [.017, -.023, .031]
        result = mechanics.discover_structures(transform(binary_stl(wall()), quaternion, position))
        self.assertEqual(len(result), 1)
        candidate = result[0]
        expected_axis = mechanics._rotate([0., 0., 1.], quaternion)
        self.assertGreater(abs(mechanics._dot(candidate["geometry"]["axis"], expected_axis)), 1 - 1e-8)
        for actual, expected in zip(candidate["geometry"]["origin"], position):
            self.assertAlmostEqual(actual, expected, places=7)
        self.assertAlmostEqual(candidate["geometry"]["radius_m"], .0011, places=7)
        self.assertAlmostEqual(candidate["geometry"]["axial_range_m"][1] - candidate["geometry"]["axial_range_m"][0], .002, places=7)
        self.assertEqual(candidate["kind"], "bore_wall")

    def test_rotated_real_shell_wall_does_not_depend_on_xyz_special_cases(self):
        quaternion = [.2, .3, -.1, math.sqrt(.86)]
        raw = transform(FIXTURE.read_bytes(), quaternion, [.01, .02, -.03])
        result = mechanics.discover_structures(raw)
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[0]["support_triangle_indices"]), 180)
        self.assertAlmostEqual(result[0]["geometry"]["radius_m"], .0011, places=7)

    def test_elliptical_and_drafted_walls_are_not_misreported_as_cylinders(self):
        for triangles in (wall(ellipse=1.12), wall(taper=.00015)):
            with self.subTest(triangles=triangles[:1]):
                self.assertEqual(mechanics.discover_structures(binary_stl(triangles)), [])

    def test_flat_fan_and_short_angular_arcs_do_not_create_holes(self):
        triangles = [((0., 0., 0.), (.002 * math.cos(i * math.pi / 36), .002 * math.sin(i * math.pi / 36), 0.),
                      (.002 * math.cos((i + 1) * math.pi / 36), .002 * math.sin((i + 1) * math.pi / 36), 0.)) for i in range(72)]
        self.assertEqual(mechanics.discover_structures(binary_stl(triangles)), [])
        self.assertEqual(mechanics.discover_structures(binary_stl(wall(angle=.2 * math.pi))), [])

    def test_outward_wall_retains_shaft_geometry_without_a_function_claim(self):
        result = mechanics.discover_structures(binary_stl(wall(inward=False)))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["kind"], "shaft_wall")
        self.assertNotIn("mechanism", result[0])
        self.assertNotIn("interface_ref", result[0])
        self.assertTrue(any("not a functional interface" in value for value in result[0]["limitations"]))

    def test_cache_does_not_alias_candidate_geometry_or_triangle_witnesses(self):
        raw = binary_stl(wall())
        first = mechanics.discover_structures(raw)
        expected = copy.deepcopy(first)
        first[0]["geometry"]["origin"][0] = 10.
        first[0]["support_triangle_indices"].clear()
        self.assertEqual(mechanics.discover_structures(raw), expected)


if __name__ == "__main__":
    unittest.main()
