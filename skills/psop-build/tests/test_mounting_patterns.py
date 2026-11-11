"""Independent topology, declaration and source-phase regressions for 1.5."""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2 import mechanics, mounting, mounting_patterns, semantics
from test_semantics import binary, cap, wall
from test_mounting import pierced_pad


def taper(base=.001, tip=.0008, height=.004, inward=False):
    triangles = []
    for i in range(72):
        a, b = i * math.tau / 72, (i + 1) * math.tau / 72
        p, q = [(base * math.cos(t), base * math.sin(t), 0.) for t in (a, b)]
        r, s = [(tip * math.cos(t), tip * math.sin(t), height) for t in (b, a)]
        triangles += [(p, q, r), (p, r, s)]
    return [t[::-1] for t in triangles] if inward else triangles


def pin():
    return taper() + cap(0., .001, 0., False) + cap(0., .0008, .004)


class FiniteTaperedPins(unittest.TestCase):
    def test_closed_tip_taper_has_finite_source_witnesses_and_no_bore(self):
        raw = binary(pin())
        result = mounting_patterns._frustum_geometry(raw)
        self.assertEqual(len(result), 1)
        primitive = result[0]
        g = primitive["geometry"]
        self.assertEqual(g["axis"], [0., 0., 1.])
        self.assertAlmostEqual(g["radius_start_m"], .001, places=8)
        self.assertAlmostEqual(g["radius_end_m"], .0008, places=8)
        self.assertAlmostEqual(g["length_m"], .004, places=8)
        self.assertEqual(set(g["triangle_indices"]), set(range(144)))
        self.assertEqual(set(primitive["cap_triangle_indices"]), set(range(216, 288)))
        self.assertEqual(len(primitive["tip_boundary_vertices"]), 72)
        self.assertLess(primitive["fit_max_m"], 1e-8)
        self.assertLessEqual(primitive["fit_rms_m"], primitive["fit_max_m"])
        self.assertEqual(mechanics._extract(raw)["features"], [])

    def test_open_wall_disk_alone_inward_bore_and_reversed_shell_do_not_create_pins(self):
        bore = (wall(.004, 0., .004) + taper(inward=True)
                + cap(.001, .004, 0., False) + cap(.0008, .004, .004))
        fixtures = [taper(), cap(0., .0008, .004), pin()[:-72], bore, [t[::-1] for t in pin()]]
        for triangles in fixtures:
            with self.subTest(triangles=len(triangles)):
                self.assertEqual(mounting_patterns._frustum_geometry(binary(triangles)), [])

    def test_source_axis_permutation_keeps_actual_triangles_and_tip_direction(self):
        triangles = [tuple((p[2], p[0], p[1]) for p in t) for t in pin()]
        result = mounting_patterns._frustum_geometry(binary(triangles))
        self.assertEqual(len(result), 1)
        g = result[0]["geometry"]
        self.assertEqual(g["axis"], [1., 0., 0.])
        self.assertAlmostEqual(g["origin"][0] + g["length_m"], .004, places=8)
        self.assertEqual(g["triangle_indices"], list(range(144)))

    def test_nonplanar_clipped_base_is_bounded_by_source_triangles_without_filling_a_ring(self):
        lower, upper = [], []
        for i in range(72):
            angle = i * math.tau / 72
            z = .0002 * math.sin(2 * angle)
            r = .001 - .05 * z
            lower.append((r * math.cos(angle), r * math.sin(angle), z))
            upper.append((.0008 * math.cos(angle), .0008 * math.sin(angle), .004))
        triangles = []
        for i in range(72):
            j = (i + 1) % 72
            triangles += [(lower[i], lower[j], upper[j]), (lower[i], upper[j], upper[i])]
        # An irregular solid backing closes the source mesh below the clipped
        # wall. Its triangles are outside the analytic draft wall witnesses.
        triangles += [((0., 0., -.0004), lower[(i + 1) % 72], lower[i]) for i in range(72)]
        triangles += cap(0., .0008, .004)
        result = mounting_patterns._frustum_geometry(binary(triangles))
        self.assertEqual(len(result), 1)
        primitive = result[0]
        g = primitive["geometry"]
        self.assertEqual(g["triangle_indices"], list(range(144)))
        self.assertGreater(max(p[2] for p in primitive["base_boundary_vertices"]) - min(p[2] for p in primitive["base_boundary_vertices"]), .00039)
        self.assertAlmostEqual(g["length_m"], .0042, places=8)
        self.assertEqual(len(primitive["base_boundary_vertices"]), 72)
        self.assertLess(primitive["fit_max_m"], 1e-8)


class ExplicitMountingPatterns(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory(prefix="psop-mounting-patterns-")
        self.root = Path(self.directory.name)
        (self.root / "sources").mkdir()
        self.scene = {"parts": [], "sources": [], "evidence": [], "bodies": [], "joints": []}
        positions = [(.006 * math.cos(math.pi / 4 + i * math.pi / 2), .006 * math.sin(math.pi / 4 + i * math.pi / 2)) for i in range(4)]
        self.bracket = self.part("circular-bracket", sum((pierced_pad(.0011, p) for p in positions), []))
        peer_positions = [(.006 * math.cos(i * math.pi / 2), .006 * math.sin(i * math.pi / 2)) for i in range(4)]
        self.peer = self.part("phase-peer", sum((pierced_pad(.0011, p) for p in peer_positions), []), [.0, .0, .00405])
        self.knowledge = {"schema": mounting_patterns.KNOWLEDGE_SCHEMA, "device_id": "synthetic",
                          "provenance": {"kind": "user_statement", "recorded_at": "2026-11-06", "statement": "Original claim", "interpretation": "Original scope retained"},
                          "interface_families": [], "reference_assemblies": [],
                          "mounting_assertions": [{"id": "upper-sites", "label": "Upper four entries",
                             "provenance": {"kind": "user_statement", "recorded_at": "2026-11-06", "statement": "These four positions mount", "interpretation": "No subset rule or mechanism supplied"},
                             "selectors": [self.selector(self.bracket)],
                             "layout": {"type": "circular", "member_count": 4, "hole_diameter_m": .0022, "pitch_circle_diameter_m": .012, "entry_side": "positive_axis"},
                             "mechanism": "unknown", "role": "bracket_mount", "selection": {"status": "unknown"}, "statement": "Mounting identity only"}]}
        self.base = semantics.analysis_for(self.scene, self.root)

    def tearDown(self):
        self.directory.cleanup()

    def part(self, name, triangles, position=None):
        raw = binary(triangles)
        url = "sources/" + name + ".stl"
        (self.root / url).write_bytes(raw)
        self.scene["sources"].append({"id": "SRC-" + name, "url": url, "digest": hashlib.sha256(raw).hexdigest()})
        part = {"id": "part:synthetic:" + name, "meshKey": name, "name": name, "geometryUrl": url, "body": "not-a-mechanical-proof",
                "position": position or [0., 0., 0.], "quaternion": [0., 0., 0., 1.], "scale": [1., 1., 1.], "sourceIds": ["SRC-" + name], "evidenceIds": ["evidence:" + name]}
        self.scene["parts"].append(part)
        return part

    def selector(self, part):
        return {"mesh_key": part["meshKey"], "geometry_sha256": next(s["digest"] for s in self.scene["sources"] if s["url"] == part["geometryUrl"])}

    def captured(self, knowledge=None):
        knowledge = knowledge or self.knowledge
        raw = json.dumps(knowledge).encode()
        (self.root / "sources/assembly.json").write_bytes(raw)
        self.scene["sources"] = [s for s in self.scene["sources"] if s["id"] != mounting.KNOWLEDGE_SOURCE] + [{"id": mounting.KNOWLEDGE_SOURCE, "url": "sources/assembly.json", "digest": hashlib.sha256(raw).hexdigest()}]
        self.scene["evidence"] = [{"id": mounting.KNOWLEDGE_EVIDENCE}] + [{"id": "evidence:microduck:mounting-assertion:" + a["id"]} for a in knowledge["mounting_assertions"]]
        return mounting_patterns.augment_analysis(self.base, self.scene, self.root, knowledge)

    def test_four_positions_leave_opposite_entries_and_selection_unknown(self):
        result = self.captured()
        interface = result["mounting_interfaces"][0]
        owned = [s for s in result["mounting_sites"] if s["owner_ref"] == self.bracket["id"]]
        self.assertEqual(len(owned), 8)
        self.assertEqual(sum(s["status"] == "user_asserted" for s in owned), 4)
        self.assertEqual(len(interface["member_site_refs"]), 4)
        self.assertIsNone(interface["selection_rule"]["min_count"])
        self.assertEqual(interface["mechanism"], "unknown")
        for count in (0, 1, 2, 3, 4):
            self.assertEqual(mounting_patterns.selection_status(interface, interface["member_site_refs"][:count], result["mounting_sites"]), "unknown")
        self.assertEqual(result["reference_mounts"], [])

    def test_common_reference_phase_mismatch_is_retained_without_independent_hole_alignment(self):
        result = self.captured()
        interface = result["mounting_interfaces"][0]
        self.assertIn("reference_hole_axes_unaligned", interface["unresolved_requirements"])
        self.assertTrue(any("phase 45." in note or "phase 44.999" in note for note in interface["unresolved_requirements"]))
        self.assertEqual(self.peer["position"], [0., 0., .00405])
        self.assertEqual(result["reference_mounts"], [])
        self.assertEqual(result["interfaces"], [])

    def test_unqualified_geometry_and_missing_or_changed_evidence_cannot_supply_mounting_function(self):
        result = mounting_patterns.augment_analysis(self.base, self.scene, self.root)
        self.assertFalse(result["mounting_interfaces"])
        self.assertTrue(all(s["status"] == "geometry_candidate" for s in result["mounting_sites"]))
        with self.assertRaisesRegex(ValueError, "explicitly captured"):
            mounting_patterns.augment_analysis(self.base, self.scene, self.root, self.knowledge)
        self.captured()
        self.scene["evidence"] = [{"id": mounting.KNOWLEDGE_EVIDENCE}]
        with self.assertRaisesRegex(ValueError, "captured evidence"):
            mounting_patterns.augment_analysis(self.base, self.scene, self.root, self.knowledge)
        self.captured()
        (self.root / "sources/assembly.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "captured source bytes"):
            mounting_patterns.augment_analysis(self.base, self.scene, self.root, self.knowledge)

    def test_integral_pin_stays_geometry_only_without_warrant_and_never_becomes_a_hole(self):
        part = self.part("integral-pin", pin())
        base = semantics.analysis_for(self.scene, self.root)
        result = mounting_patterns.augment_analysis(base, self.scene, self.root)
        sites = [s for s in result["mounting_sites"] if s["owner_ref"] == part["id"]]
        self.assertEqual(len(sites), 1)
        site = sites[0]
        self.assertEqual(site["site_kind"], "integral_pin")
        self.assertEqual(site["status"], "geometry_candidate")
        self.assertIsNone(site["hole_ref"])
        self.assertIsNone(site["portal_ref"])
        self.assertFalse(any(h["owner_ref"] == part["id"] for h in result["logical_holes"]))
        feature = next(f for f in result["features"] if f["id"] in site["feature_refs"])
        g = feature["geometry"]
        self.assertEqual(site["position"], [g["origin"][i] + g["axis"][i] * g["length_m"] for i in range(3)])
        self.assertEqual(site["entry_direction"], g["axis"])
        self.assertEqual(result["mounting_interfaces"], [])

    def test_invalid_scope_unknown_rules_or_layouts_are_rejected(self):
        mutations = [lambda a: a.update(layout=None), lambda a: a.update(layout=[]),
                     lambda a: a["selection"].update(min_count=2), lambda a: a.update(mechanism="fastener_mount"),
                     lambda a: a["layout"].update(member_count=True), lambda a: a["layout"].update(entry_side="both"),
                     lambda a: a["selectors"].append(deepcopy(a["selectors"][0])),
                     lambda a: a["selectors"][0].update(geometry_sha256="invalid")]
        for mutate in mutations:
            value = deepcopy(self.knowledge)
            mutate(value["mounting_assertions"][0])
            with self.subTest(value=value), self.assertRaises(ValueError):
                mounting_patterns.validate_knowledge(value)
        wrong = deepcopy(self.knowledge)
        wrong["mounting_assertions"][0]["selectors"][0]["geometry_sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "digest"):
            self.captured(wrong)


if __name__ == "__main__":
    unittest.main()
