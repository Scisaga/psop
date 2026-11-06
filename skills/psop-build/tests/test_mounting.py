"""Independent mounting-entry/rule/reference and rounded-opening regressions."""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2 import mechanics, mounting, semantics
from test_semantics import binary, cap, wall


def pad(radius, center):
    return wall(radius + .001, -.004, 0., center=center) + wall(radius, -.004, 0., True, center)


def pierced_pad(radius, center):
    return pad(radius, center) + cap(radius, radius + .001, 0., center=center) + cap(radius, radius + .001, -.004, False, center)


def rounded_loop(length, width, radius, angle=0.):
    points = []
    for cx, cy, low in ((length / 2 - radius, width / 2 - radius, 0.),
                        (-length / 2 + radius, width / 2 - radius, math.pi / 2),
                        (-length / 2 + radius, -width / 2 + radius, math.pi),
                        (length / 2 - radius, -width / 2 + radius, math.pi * 1.5)):
        for i in range(19):
            a = low + i * math.pi / 36
            x, y = cx + radius * math.cos(a), cy + radius * math.sin(a)
            p = [math.cos(angle) * x - math.sin(angle) * y, math.sin(angle) * x + math.cos(angle) * y, .003]
            if not points or math.dist(p, points[-1]) > 1e-10:
                points.append(p)
    if math.dist(points[0], points[-1]) < 1e-10:
        points.pop()
    return points + [points[0]]


class MountingKnowledge(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="psop-mounting-")
        self.root = Path(self.directory.name)
        (self.root / "sources").mkdir()
        self.scene = {"parts": [], "sources": [], "evidence": [], "bodies": [], "joints": []}
        a = sum((pierced_pad(.001, center) for center in ((-.008, -.015), (-.008, .015), (.008, -.015), (.008, .015))), [])
        b = sum((pierced_pad(.0012, center) for center in ((-.008, -.015), (.008, -.015))), [])
        self.a = self.part("housing", a)
        self.b = self.part("bracket", b, [.0, .0, .0045])
        self.knowledge = {
            "schema": mounting.KNOWLEDGE_SCHEMA, "device_id": "synthetic",
            "provenance": {"kind": "user_statement", "recorded_at": "2026-11-06", "statement": "Synthetic test declaration", "interpretation": "Only this declared fixture"},
            "interface_families": [{"id": "housing", "selector": self.selector(self.a), "layout": {"type": "rectangular", "hole_diameter_m": .002, "spacing_m": [.016, .030], "side_count": 2},
                                    "mechanism": "fastener_mount", "role": "housing_mount", "selection": {"same_side": True, "min_count": 2, "require_adjacent_pair": True, "adjacency": "rectangle_edges"}, "statement": "Two adjacent entries from one side"}],
            "reference_assemblies": [{"id": "fixture-reference", "interface_family_ref": "housing", "counterpart_selector": self.selector(self.b), "occurrence_selector": "same_source_body",
                                       "counterpart": {"hole_diameter_m": .0024, "hole_spacing_m": .016}, "expected_pair_count": 2, "role": "bracket_mount", "statement": "Declared source-reference two-hole mount"}],
        }
        self.base = semantics.analysis_for(self.scene, self.root)

    def tearDown(self):
        self.directory.cleanup()

    def part(self, name, triangles, position=None):
        raw = binary(triangles)
        url = "sources/" + name + ".stl"
        (self.root / url).write_bytes(raw)
        self.scene["sources"].append({"id": "SRC-" + name, "url": url, "digest": hashlib.sha256(raw).hexdigest()})
        part = {"id": "part:synthetic:" + name, "meshKey": name, "name": name, "geometryUrl": url, "body": "declared_reference_scope",
                "position": position or [0., 0., 0.], "quaternion": [0., 0., 0., 1.], "scale": [1., 1., 1.], "sourceIds": ["SRC-" + name], "evidenceIds": ["evidence:" + name]}
        self.scene["parts"].append(part)
        return part

    def selector(self, part):
        return {"mesh_key": part["meshKey"], "geometry_sha256": next(s["digest"] for s in self.scene["sources"] if s["url"] == part["geometryUrl"])}

    def captured(self, knowledge=None):
        knowledge = self.knowledge if knowledge is None else knowledge
        raw = json.dumps(knowledge, allow_nan=False).encode()
        url = "sources/assembly.json"
        (self.root / url).write_bytes(raw)
        self.scene["sources"] = [s for s in self.scene["sources"] if s["id"] != mounting.KNOWLEDGE_SOURCE] + [{"id": mounting.KNOWLEDGE_SOURCE, "url": url, "digest": hashlib.sha256(raw).hexdigest()}]
        self.scene["evidence"] = [{"id": mounting.KNOWLEDGE_EVIDENCE}]
        return mounting.augment_analysis(self.base, self.scene, self.root, knowledge)

    def test_eight_entries_share_four_holes_and_have_directional_identity(self):
        result = self.captured()
        sites = [s for s in result["mounting_sites"] if s["owner_ref"] == self.a["id"]]
        self.assertEqual(len(sites), 8)
        self.assertEqual(len({s["hole_ref"] for s in sites}), 4)
        self.assertEqual(len({s["portal_ref"] for s in sites}), 8)
        self.assertEqual({s["label"] for s in sites}, {f"{side}{i}" for side in "AB" for i in range(1, 5)})
        self.assertTrue(all(s["status"] == "user_asserted" for s in sites))
        for site in sites:
            hole = next(h for h in result["logical_holes"] if h["id"] == site["hole_ref"])
            portal = next(p for p in hole["portals"] if p["id"] == site["portal_ref"])
            self.assertEqual(site["position"], portal["position"])
            self.assertEqual(site["entry_direction"], [-x for x in portal["normal"]])
        self.assertEqual(result["interfaces"], [])
        self.assertEqual(result["connection_candidates"], [])

    def test_same_side_edge_rule_is_not_all_four_or_any_two(self):
        result = self.captured()
        interface = next(i for i in result["mounting_interfaces"] if i["owner_ref"] == self.a["id"])
        a, b = [side["site_refs"] for side in interface["sides"]]
        self.assertEqual(len(interface["selection_rule"]["allowed_adjacent_pairs"]), 8)
        self.assertEqual(mounting.selection_status(interface, a, result["mounting_sites"]), "pass")
        self.assertEqual(mounting.selection_status(interface, a[:3], result["mounting_sites"]), "pass")
        self.assertEqual(mounting.selection_status(interface, [a[0], a[1]], result["mounting_sites"]), "pass")
        self.assertEqual(mounting.selection_status(interface, [a[0], a[3]], result["mounting_sites"]), "fail")
        self.assertEqual(mounting.selection_status(interface, [a[0], b[1]], result["mounting_sites"]), "fail")
        self.assertEqual(mounting.selection_status(interface, a[:1], result["mounting_sites"]), "fail")

    def test_declared_standard_mapping_retains_gap_and_unbound_connectors(self):
        self.assertFalse(any(o["kind"] == "coaxial_bores" for o in self.base["reference_observations"]))
        result = self.captured()
        self.assertEqual(len(result["reference_mounts"]), 1)
        reference = result["reference_mounts"][0]
        self.assertEqual(len(reference["site_pairs"]), 2)
        for pair in reference["site_pairs"]:
            self.assertLess(pair["axis_distance_m"], 1e-7)
            self.assertAlmostEqual(pair["axial_gap_m"], .0005, places=7)
            self.assertGreater(pair["axial_gap_m"], mechanics.AXIAL_GAP_M)
        self.assertEqual(reference["assessment"]["reference_alignment"], "pass")
        self.assertTrue(all(reference["assessment"][key] == "unknown" for key in ("mechanical", "engineering", "task", "completion")))
        self.assertEqual([r["status"] for r in reference["connector_roles"]], ["unbound", "unbound"])
        self.assertNotIn("engaged", reference)
        self.assertNotIn("mounting_sites", self.base)

    def test_no_statement_means_no_functional_upgrade(self):
        result = mounting.augment_analysis(self.base, self.scene, self.root)
        self.assertTrue(result["mounting_sites"])
        self.assertTrue(all(s["status"] == "geometry_candidate" and s["role"] == "unqualified" for s in result["mounting_sites"]))
        self.assertEqual(result["mounting_interfaces"], [])
        self.assertEqual(result["reference_mounts"], [])

    def test_declared_relationship_does_not_override_the_common_source_pose(self):
        self.b["position"][0] += .001
        with self.assertRaisesRegex(ValueError, "no jointly aligned"):
            self.captured()

    def test_missing_source_or_changed_capture_cannot_supply_function(self):
        with self.assertRaisesRegex(ValueError, "explicitly captured"):
            mounting.augment_analysis(self.base, self.scene, self.root, self.knowledge)
        self.captured()
        (self.root / "sources/assembly.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "captured source bytes"):
            mounting.augment_analysis(self.base, self.scene, self.root, self.knowledge)

    def test_unknown_fields_numeric_booleans_and_wrong_reference_type_are_rejected(self):
        mutations = [lambda k: k.update(extra=True),
                     lambda k: k["interface_families"][0]["selection"].update(same_side=1),
                     lambda k: k["interface_families"][0]["selection"].update(min_count=2.0),
                     lambda k: k["interface_families"][0]["layout"].update(side_count=2.0),
                     lambda k: k["reference_assemblies"][0].update(expected_pair_count=2.0),
                     lambda k: k["interface_families"][0].update(statement=[]),
                     lambda k: k["reference_assemblies"][0].update(interface_family_ref="fixture-reference"),
                     lambda k: k["interface_families"][0]["layout"]["spacing_m"].__setitem__(0, True)]
        for mutate in mutations:
            knowledge = deepcopy(self.knowledge)
            mutate(knowledge)
            with self.subTest(knowledge=knowledge), self.assertRaises(ValueError):
                mounting.validate_knowledge(knowledge)

    def test_wrong_device_missing_selector_and_digest_mismatch_are_rejected(self):
        for field, value in (("device_id", "another-device"), ("mesh_key", "missing"), ("geometry_sha256", "0" * 64)):
            knowledge = deepcopy(self.knowledge)
            if field == "device_id": knowledge[field] = value
            else: knowledge["interface_families"][0]["selector"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.captured(knowledge)


class RoundedOpenings(unittest.TestCase):
    def test_rotated_rounded_rectangle_and_capsule_are_fitted_without_depth_claim(self):
        for length, width, radius, kind in ((.010, .005, .0015, "rounded_rectangle_opening"), (.0065, .001, .0005, "capsule_opening")):
            loop = rounded_loop(length, width, radius, .43)
            geometry, maximum = mounting._rounded_boundary(loop, [0., 0., 1.])
            self.assertEqual(geometry["type"], kind)
            self.assertAlmostEqual(geometry["length_m"], length, places=7)
            self.assertAlmostEqual(geometry["width_m"], width, places=7)
            self.assertAlmostEqual(geometry["corner_radius_m"], radius, places=7)
            self.assertLess(maximum, 1e-7)
            self.assertNotIn("depth_m", geometry)
            self.assertNotIn("through", geometry)

    def test_circle_irregular_contour_and_exterior_solid_are_not_slot_openings(self):
        circle = [[math.cos(i * math.tau / 72) * .003, math.sin(i * math.tau / 72) * .003, 0.] for i in range(73)]
        self.assertIsNone(mounting._rounded_boundary(circle, [0., 0., 1.]))
        irregular = rounded_loop(.010, .005, .0015)
        irregular[4][0] += .0005
        self.assertIsNone(mounting._rounded_boundary(irregular, [0., 0., 1.]))
        loop = rounded_loop(.010, .005, .0015)
        triangles = []
        for a, b in zip(loop, loop[1:]):
            low_a, low_b = [[p[0], p[1], .0] for p in (a, b)]
            triangles.extend((([0., 0., .003], a, b), ([0., 0., .0], low_b, low_a), (low_a, low_b, b), (low_a, b, a)))
        self.assertEqual(mounting._slot_geometry(binary(triangles)), [])


if __name__ == "__main__":
    unittest.main()
