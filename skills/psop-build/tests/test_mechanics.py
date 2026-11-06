"""Independent synthetic geometry checks for derived interface candidates."""
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
from psop_build_v2.mechanics import analysis_for


def stl(walls):
    """Create finite circular walls; each tuple is radius, z-min, z-max, inward."""
    triangles = []
    for radius, minimum, maximum, inward in walls:
        for i in range(72):
            angle, next_angle = i * 2 * math.pi / 72, (i + 1) * 2 * math.pi / 72
            a = (radius * math.cos(angle), radius * math.sin(angle), minimum)
            b = (radius * math.cos(next_angle), radius * math.sin(next_angle), minimum)
            c = (b[0], b[1], maximum)
            d = (a[0], a[1], maximum)
            for triangle in ((a, b, c), (a, c, d)):
                if inward:
                    triangle = triangle[::-1]
                triangles.append(struct.pack("<12fH", 0., 0., 0., *(x for vertex in triangle for x in vertex), 0))
    return b"Synthetic cylinder walls".ljust(80, b"\0") + struct.pack("<I", len(triangles)) + b"".join(triangles)


class MechanicalCandidates(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="psop-mechanics-")
        self.root = Path(self.directory.name)
        (self.root / "sources").mkdir()
        self.scene = {"parts": [], "sources": [], "bodies": [], "joints": []}

    def tearDown(self):
        self.directory.cleanup()

    def part(self, name, walls, position=(0., 0., 0.), quaternion=(0., 0., 0., 1.)):
        raw = stl(walls)
        relative = "sources/" + name + ".stl"
        (self.root / relative).write_bytes(raw)
        source_id = "SRC-" + name
        self.scene["sources"].append({"id": source_id, "url": relative, "digest": hashlib.sha256(raw).hexdigest()})
        part_id = "part:synthetic:" + name
        part = {"id": part_id, "name": name, "body": "same_reference_body", "geometryUrl": relative,
                "position": list(position), "quaternion": list(quaternion), "scale": [1., 1., 1.],
                "sourceIds": [source_id], "evidenceIds": ["evidence:" + name + ":stl"]}
        self.scene["parts"].append(part)
        return part

    def test_stepped_hole_is_one_interface_with_replayable_triangle_support(self):
        part = self.part("stepped", [(.0008, -.006, -.0005, True), (.0015, -.0005, 0., True)])
        result = analysis_for(self.scene, self.root)
        self.assertEqual(len(result["features"]), 2)
        self.assertEqual(len(result["interfaces"]), 1)
        self.assertEqual(len(result["interfaces"][0]["feature_refs"]), 2)
        self.assertEqual(result["frames"][0]["attached_to"], part["id"] + "#source-mesh")
        for feature in result["features"]:
            self.assertEqual(feature["kind"], "bore_wall")
            self.assertEqual(feature["geometry"]["axis"], [0., 0., 1.])
            self.assertAlmostEqual(feature["measurement"]["coverage"], 1., places=7)
            self.assertLess(feature["measurement"]["fit_rms_m"], 1e-9)
            self.assertEqual(len(feature["geometry"]["triangle_indices"]), 144)
            self.assertTrue(all(0 <= t < 288 for t in feature["geometry"]["triangle_indices"]))
            self.assertEqual(feature["geometry_digest"], "sha256:" + self.scene["sources"][0]["digest"])

    def test_pairing_uses_world_transform_and_finite_bores_not_body_membership(self):
        half = math.sqrt(.5)
        left = self.part("left", [(.0008, -.006, 0., True)], quaternion=(0., half, 0., half))
        right = self.part("right", [(.0011, -.002, 0., True)], quaternion=(0., -half, 0., half))
        self.part("distant", [(.0011, 0., .002, True)], position=(0., .01, 0.))
        self.scene["bodies"] = [{"name": "same_reference_body", "id": "model-body:synthetic:one", "partIds": [p["id"] for p in self.scene["parts"]]}]
        result = analysis_for(self.scene, self.root)
        self.assertEqual(len(result["connection_candidates"]), 1)
        candidate = result["connection_candidates"][0]
        self.assertEqual({e["part_ref"] for e in candidate["endpoint_refs"]}, {left["id"], right["id"]})
        self.assertEqual(candidate["status"], "geometric_candidate")
        difference = next(c for c in candidate["checks"] if c["kind"] == "bore_radius_difference")
        self.assertAlmostEqual(difference["residual"], .0003, places=9)
        self.assertEqual(len(result["reference_relations"]), 1)
        self.assertNotIn("interface_connections", result)

    def test_coaxial_overlapping_holes_or_axially_distant_holes_are_not_paired(self):
        self.part("one", [(.0008, -.006, 0., True)])
        self.part("overlap", [(.0011, -.003, 0., True)])
        self.part("far", [(.0011, .01, .012, True)])
        result = analysis_for(self.scene, self.root)
        self.assertEqual(result["connection_candidates"], [])

    def test_finite_shaft_bore_match_reports_clearance_but_not_confirmed_joint(self):
        self.part("bore", [(.008, -.002, .002, True)])
        self.part("shaft", [(.0079, -.0015, .0015, False)])
        result = analysis_for(self.scene, self.root)
        self.assertEqual(len(result["connection_candidates"]), 1)
        candidate = result["connection_candidates"][0]
        clearance = next(c for c in candidate["checks"] if c["kind"] == "radial_clearance")
        self.assertAlmostEqual(clearance["residual"], .0001, places=8)
        self.assertTrue(any("tolerances" in text for text in candidate["unresolved_requirements"]))

    def test_digest_is_rechecked_with_warm_cache_and_results_do_not_share_mutable_state(self):
        self.part("one", [(.0008, -.006, 0., True)])
        first = analysis_for(self.scene, self.root)
        expected = copy.deepcopy(first)
        first["features"][0]["geometry"]["triangle_indices"].clear()
        self.assertEqual(analysis_for(self.scene, self.root), expected)
        self.scene["sources"][0]["digest"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "digest"):
            analysis_for(self.scene, self.root)


if __name__ == "__main__":
    unittest.main()
