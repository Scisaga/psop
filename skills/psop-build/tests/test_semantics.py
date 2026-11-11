"""Topology and grouping tests independent of Microduck part names or IDs."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2.semantics import analysis_for


def wall(radius, low, high, inward=False, center=(0., 0.)):
    triangles = []
    for i in range(72):
        angle, following = i * math.tau / 72, (i + 1) * math.tau / 72
        a = (center[0] + radius * math.cos(angle), center[1] + radius * math.sin(angle), low)
        b = (center[0] + radius * math.cos(following), center[1] + radius * math.sin(following), low)
        c, d = (b[0], b[1], high), (a[0], a[1], high)
        triangles.extend(((a, b, c), (a, c, d)))
    return [t[::-1] for t in triangles] if inward else triangles


def cap(inner, outer, z, up=True, center=(0., 0.)):
    triangles = []
    for i in range(72):
        angle, following = i * math.tau / 72, (i + 1) * math.tau / 72
        a, b = [(center[0] + outer * math.cos(t), center[1] + outer * math.sin(t), z) for t in (angle, following)]
        if inner:
            c, d = [(center[0] + inner * math.cos(t), center[1] + inner * math.sin(t), z) for t in (following, angle)]
            triangles.extend(((a, b, c), (a, c, d)))
        else:
            triangles.append(((center[0], center[1], z), a, b))
    return triangles if up else [t[::-1] for t in triangles]


def washer(center=(0., 0.)):
    return wall(.0015, -.004, 0., center=center) + wall(.0008, -.004, 0., True, center) + cap(.0008, .0015, 0., center=center) + cap(.0008, .0015, -.004, False, center)


def binary(triangles):
    return b"Synthetic passage topology".ljust(80, b"\0") + struct.pack("<I", len(triangles)) + b"".join(
        struct.pack("<12fH", 0., 0., 0., *(v for point in triangle for v in point), 0) for triangle in triangles)


class SemanticGeometry(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="psop-semantics-")
        self.root = Path(self.directory.name)
        (self.root / "sources").mkdir()
        self.scene = {"parts": [], "sources": [], "bodies": [], "joints": []}

    def tearDown(self):
        self.directory.cleanup()

    def part(self, name, triangles, position=(0., 0., 0.)):
        raw = binary(triangles)
        relative = "sources/" + name + ".stl"
        (self.root / relative).write_bytes(raw)
        self.scene["sources"].append({"id": "SRC-" + name, "url": relative, "digest": hashlib.sha256(raw).hexdigest()})
        part = {"id": "part:synthetic:" + name, "name": name, "body": "reference_only", "geometryUrl": relative,
                "position": list(position), "quaternion": [0., 0., 0., 1.], "scale": [1., 1., 1.],
                "sourceIds": ["SRC-" + name], "evidenceIds": ["evidence:" + name + ":stl"]}
        self.scene["parts"].append(part)
        return part

    def test_real_annular_shoulder_joins_two_walls_into_one_stepped_passage(self):
        triangles = wall(.003, -.007, 0.) + cap(0., .003, -.007, False) + cap(.0015, .003, 0.)
        triangles += wall(.0015, -.0005, 0., True) + cap(.0008, .0015, -.0005)
        triangles += wall(.0008, -.006, -.0005, True) + cap(0., .0008, -.006)
        self.part("stepped", triangles)
        result = analysis_for(self.scene, self.root)
        self.assertEqual(len(result["logical_holes"]), 1)
        hole = result["logical_holes"][0]
        self.assertEqual(hole["kind"], "stepped_bore")
        self.assertEqual(len(hole["wall_feature_refs"]), 2)
        self.assertEqual(len(hole["topology_links"]), 1)
        self.assertEqual(len(hole["topology_links"][0]["triangle_indices"]), 144)
        self.assertEqual(sorted(p["status"] for p in hole["portals"]), ["closed", "opening"])
        self.assertTrue(all(len(p["boundary_vertices"]) == 72 for p in hole["portals"]))

    def test_back_to_back_blind_bores_are_not_joined_through_their_solid_web(self):
        triangles = wall(.003, -.006, .006) + cap(.001, .003, -.006, False) + cap(.001, .003, .006)
        triangles += wall(.001, -.006, -.00025, True) + cap(0., .001, -.00025, False)
        triangles += wall(.001, .00025, .006, True) + cap(0., .001, .00025)
        self.part("two_blind_bores", triangles)
        result = analysis_for(self.scene, self.root)
        self.assertEqual(len(result["logical_holes"]), 2)
        self.assertTrue(all(h["kind"] == "single_bore" and h["topology_links"] == [] for h in result["logical_holes"]))
        self.assertTrue(all(sorted(p["status"] for p in h["portals"]) == ["closed", "opening"] for h in result["logical_holes"]))

    def test_through_bore_has_two_opening_portals_but_one_logical_identity(self):
        self.part("through", washer())
        result = analysis_for(self.scene, self.root)
        self.assertEqual(len(result["logical_holes"]), 1)
        self.assertEqual([p["status"] for p in result["logical_holes"][0]["portals"]], ["opening", "opening"])
        self.assertEqual(result["logical_holes"][0]["motion_ownership"], "unresolved")
        self.assertNotIn("attached_to", result["frames"][0])

    def test_four_portals_form_source_geometry_pattern_without_function_or_modes(self):
        triangles = sum((washer(center) for center in ((-.006, 0.), (0., -.006), (0., .006), (.006, 0.))), [])
        self.part("array", triangles)
        result = analysis_for(self.scene, self.root)
        self.assertEqual(len(result["logical_holes"]), 4)
        self.assertEqual(len(result["feature_patterns"]), 2)  # Two portals of the same four through holes.
        for pattern in result["feature_patterns"]:
            self.assertEqual(pattern["geometry"]["type"], "circular")
            self.assertAlmostEqual(pattern["geometry"]["pitch_circle_diameter_m"], .012, places=8)
            self.assertEqual(pattern["geometry"]["rotational_symmetry_order"], 4)
            self.assertEqual(pattern["status"], "geometry_only")
        self.assertEqual(result["interfaces"], [])
        self.assertEqual(result["connection_candidates"], [])

    def test_atomic_observations_survive_and_pattern_parent_uses_the_same_source_pose(self):
        triangles = sum((washer(center) for center in ((-.006, 0.), (0., -.006), (0., .006), (.006, 0.))), [])
        self.part("array_a", triangles)
        self.part("array_b", triangles, position=(0., 0., .004))
        result = analysis_for(self.scene, self.root)
        atoms = {o["id"]: o for o in result["reference_observations"] if o["kind"] != "hole_pattern_alignment"}
        parents = [o for o in result["reference_observations"] if o["kind"] == "hole_pattern_alignment"]
        self.assertEqual(len(parents), 1)
        self.assertEqual(len(parents[0]["member_observation_refs"]), 4)
        self.assertTrue(all(ref in atoms for ref in parents[0]["member_observation_refs"]))
        self.assertEqual(parents[0]["reference_placements"][1]["position"], [0., 0., .004])
        self.assertEqual(result["analysis"]["raw_observations_count"], len(atoms))
        for observation in atoms.values():
            self.assertTrue(all("interface_ref" not in p for p in observation["participants"]))
            if "normal_halfspace_test" in observation:
                test = observation["normal_halfspace_test"]
                self.assertEqual(test["status"], "numerical_only")
                self.assertTrue(all(-1 <= p["value"] <= 1 for sample in test["samples"] for p in sample["projections"]))
                self.assertNotIn("blocked", json.dumps(test))


if __name__ == "__main__":
    unittest.main()
