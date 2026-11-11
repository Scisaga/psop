"""Regress the independently found installation gaps against unchanged sources."""
from copy import deepcopy
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "skills/psop-build/scripts"))
from psop_build_v2.assembly_catalog import validate_requirements
from psop_build_v2.capability_package import _load_catalog
from psop_build_v2.reference_usage import validate_reference_uses


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def rotate(q, v):
    x, y, z, w = q
    a, b, c = v
    return [(1-2*(y*y+z*z))*a+2*(x*y-z*w)*b+2*(x*z+y*w)*c,
            2*(x*y+z*w)*a+(1-2*(x*x+z*z))*b+2*(y*z-x*w)*c,
            2*(x*z-y*w)*a+2*(y*z+x*w)*b+(1-2*(x*x+y*y))*c]


class InstallationFollowup(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.package = Path(os.environ.get("PSOP_ASSEMBLY_TEST_DKP", str(ROOT / "build/microduck/source-1.15/microduck-capabilities-9.dkp")))
        cls.scene = read(cls.package / "indexes/scene.json")
        cls.parts = {p["id"]: p for p in cls.scene["parts"]}
        cls.catalog = _load_catalog(cls.package, cls.scene)
        cls.interfaces = {i["id"]: i for i in cls.catalog["interfaces"]}
        cls.features = {f["id"]: f for f in cls.catalog["features"]}
        cls.connections = {c["id"]: c for c in cls.catalog["reference_connections"]}
        cls.authored = read(ROOT / "device-materials/microduck-assembly-interfaces.json")
        cls.review = read(ROOT / "device-materials/assembly/installation-followup-review.json")

    def test_source_bytes_and_external_identity_captures_are_unchanged(self):
        for relative, digest in self.review["source_locks"].items():
            self.assertEqual(hashlib.sha256((self.package / relative).read_bytes()).hexdigest(), digest)
        for capture in self.review["source_captures"]:
            self.assertEqual(hashlib.sha256(capture["utf8"].encode("utf-8")).hexdigest(), capture["sha256"])
        self.assertEqual(len(self.review["seven_item_review"]), 7)

    def test_hip_supports_keep_18mm_pair_separate_from_servo_holes(self):
        for a, b in [("55970da91992f38c", "cb253f38c818b9d8"), ("48099e14105d3289", "c703574f50f6a46a")]:
            for short, radius in [(a, .001025), (b, .0011)]:
                interface = self.interfaces[f"interface:assembly:{short}:hip_support_two_holes"]
                self.assertEqual(len(interface["members"]), 2)
                geometries = [self.features[m["feature_refs"][0]]["geometry"] for m in interface["members"]]
                self.assertAlmostEqual(math.dist(geometries[0]["origin"], geometries[1]["origin"]), .018, places=8)
                for g in geometries:
                    self.assertAlmostEqual(g["radius_m"], radius, places=8)
                    self.assertEqual(g["axis"], [0., 1., 0.])
            relation = self.connections[f"connection:assembly:{a}:hip_support_two_holes"]
            self.assertEqual({e["interface_ref"].split(":")[2] for e in relation["endpoints"]}, {a, b})
            self.assertEqual(relation["basis"], "hypothesis")
            self.assertFalse(relation.get("fastener_paths"))

    def test_partial_head_cradles_preserve_both_specific_outer_ring_peers(self):
        for side, bearing in [("drive", "ea69e2c6bba10a23"), ("opposite", "55121c0b36f62219")]:
            interface = self.interfaces[f"interface:assembly:986b5adf27910138:roll_bearing_{side}_cradle"]
            feature = self.features[interface["members"][0]["feature_refs"][0]]
            self.assertEqual(len(feature["geometry"]["triangle_indices"]), 42)
            self.assertAlmostEqual(feature["geometry"]["radius_m"], .0111, places=8)
            relation = self.connections[f"connection:assembly:986b5adf27910138:roll_bearing_{side}_cradle"]
            self.assertIn(f"interface:assembly:{bearing}:outer_ring", [e["interface_ref"] for e in relation["endpoints"]])
            # No pre-existing bottom-shell receiver was replaced by the new one.
            outer = f"interface:assembly:{bearing}:outer_ring"
            self.assertTrue(any(any(e["interface_ref"] == outer for e in c["endpoints"]) and
                                any(e["interface_ref"].startswith("interface:assembly:52fdcacf474a463f:") for e in c["endpoints"])
                                for c in self.connections.values()))

    def test_shell_member_selection_preserves_pair_rule_and_source_conflict(self):
        for row in self.review["shell_fastening"]:
            short = row["owner_ref"].split(":")[-1]
            source = self.interfaces[row["servo_interface_ref"]]
            self.assertEqual(source["selection"]["kind"], "adjacent_pair")
            original = next(m for m in source["members"] if m["id"] == row["servo_member_ref"])
            servo = row["servo_owner_ref"].split(":")[-1]
            selected = self.interfaces[f"interface:assembly:{servo}:vertical_shell_receiver"]["members"][0]
            self.assertEqual(selected["feature_refs"], original["feature_refs"])
            shell = self.interfaces[f"interface:assembly:{short}:vertical_servo_fastening"]["members"][0]
            points = []
            for owner, member in [(row["owner_ref"], shell), (row["servo_owner_ref"], selected)]:
                p = self.parts[owner]
                points.append([a+b for a, b in zip(p["position"], rotate(p["quaternion"], member["position"]))])
            offset = math.hypot(points[0][0]-points[1][0], points[0][1]-points[1][1])
            relation = self.connections[f"connection:assembly:{short}:vertical_servo_fastening"]
            if short == "e27cbdd6c07a264e":
                self.assertLess(offset, 1e-8)
                self.assertEqual(relation["basis"], "hypothesis")
            else:
                self.assertAlmostEqual(offset, .0005, places=8)
                self.assertEqual(relation["basis"], "incompatible")

    def test_three_eye_slots_have_real_boundaries_and_positive_profile_margin(self):
        relation = self.connections["connection:assembly:2559a4c412bcda3e:eye_three_tabs"]
        self.assertEqual(relation["basis"], "source_fit")
        self.assertEqual(relation["mechanism"], "keyed_registration")
        source = self.package / self.parts["part:microduck:2559a4c412bcda3e"]["geometryUrl"]
        raw = source.read_bytes()
        for row in self.review["eye_tab_registration"]["tabs"]:
            slot = self.interfaces["interface:assembly:afa52198f7fad203:eye_three_slots"]
            member = next(m for m in slot["members"] if m["id"].endswith(":"+row["key"]))
            indices = {t for ref in member["feature_refs"] for t in self.features[ref]["geometry"]["triangle_indices"]}
            self.assertEqual(indices, set(row["slot_wall_triangle_indices"]))
            loop = [[v/1000 for v in p] for p in row["slot_boundary_vertices_mm"]]
            def inside(p):
                crossings = 0
                for a, b in zip(loop, loop[1:]+loop[:1]):
                    if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]):
                        crossings += 1
                return crossings % 2 == 1
            cap = self.features[next(m for m in self.interfaces["interface:assembly:2559a4c412bcda3e:eye_three_tabs"]["members"] if m["id"].endswith(":"+row["key"]))["feature_refs"][0]]
            for index in cap["geometry"]["triangle_indices"]:
                values = struct.unpack_from("<12fH", raw, 84+index*50)
                for j in (3, 6, 9):
                    self.assertTrue(inside([values[j], values[j+2]]))
            self.assertGreater(row["minimum_vertex_to_slot_edge_mm"], .04)
            self.assertAlmostEqual(row["source_tab_length_mm"]-row["source_panel_thickness_mm"], .2)

    def test_missing_parts_are_not_replaced_with_unrelated_board_envelopes(self):
        for interface in ["interface:assembly:78cf36c41e4fde06:pcb_locating_ears", "interface:assembly:2d2cde8ae8ebacac:lens_radial_retaining_port"]:
            self.assertIn(interface, self.interfaces)
            self.assertFalse(any(any(e["interface_ref"] == interface for e in c["endpoints"]) for c in self.connections.values()))
        review = read(ROOT / "device-materials/assembly/reference-use-review.json")
        rows = {p["owner_ref"]: p for p in review["parts"]}
        self.assertFalse(rows["part:microduck:e27cbdd6c07a264e"]["open_items"])
        for short in ["78cf36c41e4fde06", "2d2cde8ae8ebacac", "6b884b140f6e283c", "22f2cd114e324ec5"]:
            self.assertTrue(rows["part:microduck:"+short]["open_items"])

    def test_omitting_new_hip_or_cradle_is_rejected_by_independent_requirements(self):
        for ref in ["interface:assembly:55970da91992f38c:hip_support_two_holes", "interface:assembly:986b5adf27910138:roll_bearing_drive_cradle"]:
            catalog = deepcopy(self.authored["catalog"])
            catalog["interfaces"] = [i for i in catalog["interfaces"] if i["id"] != ref]
            catalog["connections"] = [c for c in catalog["connections"] if all(e["interface_ref"] != ref for e in c["endpoints"])]
            with self.assertRaisesRegex(ValueError, "Missing independently required interface"):
                validate_requirements(catalog, self.authored["requirements"], self.scene)
        requirements = read(self.package / "sources/SRC-CAPABILITY-REQUIREMENTS.json")
        output = validate_reference_uses(self.catalog, self.scene, self.package, requirements)
        self.assertEqual(output["functional_interface_count"], 257)
        self.assertEqual(output["reference_connection_count"], 145)


if __name__ == "__main__":
    unittest.main()
