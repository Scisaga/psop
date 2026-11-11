"""Independent finite fixtures for the small authored assembly contract."""
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory
import unittest

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from psop_build_v2 import assembly_catalog as catalog


def cylinder_triangles(origin, radius, low, high):
    rings = [[(origin[0]+x, origin[1]+radius*math.cos(i*math.pi/4),
               origin[2]+radius*math.sin(i*math.pi/4)) for i in range(8)] for x in (low, high)]
    return [(rings[0][i], rings[1][i], rings[1][(i+1)%8]) for i in range(8)] + [
        (rings[0][i], rings[1][(i+1)%8], rings[0][(i+1)%8]) for i in range(8)]


def binary_stl(triangles):
    return b"independent assembly fixture".ljust(80, b"\0") + struct.pack("<I", len(triangles)) + b"".join(
        struct.pack("<12fH", 0, 0, 0, *(v for point in triangle for v in point), 0) for triangle in triangles)


class AssemblyCatalog(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory(prefix="psop-assembly-catalog-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.scene = {"parts": [], "sources": [], "evidence": [], "meta": {"counts": {}}}
        self.value = {"schema": catalog.INPUT_SCHEMA, "device_id": "fixture", "provenance": {"basis": "independent finite fixture"},
                      "catalog": {"features": [], "interfaces": [], "connections": [], "part_notes": []},
                      "evidence": [{"id": "e:fixture", "sourceId": catalog.SOURCE_ID, "title": "Fixture source selection",
                                    "kind": "source-file", "excerpt": "Independently specified local dimensions and sides."}],
                      "supporting_documents": []}
        self.required = {"schema": catalog.REQUIREMENTS_SCHEMA, "device_id": "fixture", "sources": [], "interfaces": []}
        self.add_servo()
        self.add_bearing("large", .008, .011, .004)
        self.add_bearing("small", .005, .0075, .003)
        self.add_foot_latch()
        self.value["requirements"] = deepcopy(self.required)

    def add_source(self, name, triangles):
        identifier = "SRC-"+name.upper()
        path = "sources/"+identifier+".stl"
        raw = binary_stl(triangles)
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        digest = hashlib.sha256(raw).hexdigest()
        owner = "part:fixture:"+name
        self.scene["sources"].append({"id": identifier, "url": path, "digest": digest})
        self.scene["parts"].append({"id": owner, "geometryUrl": path, "sourceIds": [identifier]})
        self.required["sources"].append({"id": identifier, "sha256": digest})
        return owner, identifier, digest

    def add_interface(self, owner, key, members, selection=None):
        item = {"id": "interface:"+owner+":"+key, "owner_ref": owner, "key": key, "name": key,
                "purpose": "Fixture connection capability", "geometry_summary": "Finite source geometry",
                "members": members, "selection": selection or {"kind": "unspecified"},
                "origin": "source_geometry", "evidence_refs": ["e:fixture"]}
        self.value["catalog"]["interfaces"].append(item)
        return item

    def add_servo(self):
        # These are four physically different interfaces. The housing rectangle
        # has 16 and 30 mm edges, hence a 34 mm diagonal, not a 34 mm PCD.
        specifications = [
            ("end_minus", -.0145, [1., 0., 0.], [(-.006, 0), (0, .006), (.006, 0), (0, -.006)]),
            ("end_plus", .0145, [-1., 0., 0.], [(-.006, 0), (0, .006), (.006, 0), (0, -.006)]),
            ("housing_a", -.0115, [1., 0., 0.], [(-.008, .0075), (.008, .0075), (.008, -.0225), (-.008, -.0225)]),
            ("housing_b", .0115, [-1., 0., 0.], [(-.008, .0075), (.008, .0075), (.008, -.0225), (-.008, -.0225)]),
        ]
        triangles, facts = [], []
        for key, x, direction, points in specifications:
            records = []
            for name, (y, z) in zip("ABCD", points):
                start = len(triangles)
                triangles.extend(cylinder_triangles([x, y, z], .0008, -.001, .001))
                records.append((name, [x, y, z], list(range(start, len(triangles)))))
            facts.append((key, direction, records))
        owner, source, digest = self.add_source("servo", triangles)
        for key, direction, records in facts:
            members = []
            for name, position, indices in records:
                feature = {"id": "feature:"+key+":"+name, "owner_ref": owner, "geometry_source_ref": source,
                           "geometry_digest": "sha256:"+digest, "kind": "bore_wall",
                           "geometry": {"type": "cylinder", "origin": position, "axis": [1., 0., 0.], "radius_m": .0008,
                                        "axial_range_m": [-.001, .001], "triangle_indices": indices}}
                self.value["catalog"]["features"].append(feature)
                members.append({"id": name, "label": name, "feature_refs": [feature["id"]], "position": position, "direction": direction})
            self.add_interface(owner, key, members, {"kind": "adjacent_pair", "allowed_pairs": [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]]})
            self.required["interfaces"].append({"owner_ref": owner, "key": key, "exact_members": True,
                "members": [{"position": position, "direction": direction, "geometry_type": "cylinder", "radius_m": .0008}
                            for _, position, _ in records]})

    def add_bearing(self, name, inner, outer, thickness):
        triangles = cylinder_triangles([0, 0, 0], inner, 0, thickness)
        triangles += cylinder_triangles([0, 0, 0], outer, 0, thickness)
        owner, source, digest = self.add_source(name, triangles)
        for key, radius, indices in [("inner_ring", inner, list(range(16))), ("outer_ring", outer, list(range(16, 32)))]:
            feature = {"id": "feature:"+name+":"+key, "owner_ref": owner, "geometry_source_ref": source,
                       "geometry_digest": "sha256:"+digest, "kind": "bore_wall" if key == "inner_ring" else "shaft_wall",
                       "geometry": {"type": "cylinder", "origin": [0, 0, 0], "axis": [1., 0., 0.], "radius_m": radius,
                                    "axial_range_m": [0, thickness], "triangle_indices": indices}}
            self.value["catalog"]["features"].append(feature)
            self.add_interface(owner, key, [{"id": "radial", "label": "radial wall", "feature_refs": [feature["id"]],
                                           "position": [thickness/2, 0, 0], "direction": [1., 0., 0.]}])
            self.required["interfaces"].append({"owner_ref": owner, "key": key, "members": [
                {"position": [thickness/2, 0, 0], "geometry_type": "cylinder", "radius_m": radius}]})

    def add_foot_latch(self):
        owner, source, digest = self.add_source("foot", [((0, 0, 0), (.01, 0, 0), (.01, .001, 0))])
        feature = {"id": "feature:foot:latch", "owner_ref": owner, "geometry_source_ref": source,
                   "geometry_digest": "sha256:"+digest, "kind": "latch_surface",
                   "geometry": {"type": "source_region", "origin": [.005, .0005, 0], "normal": [0., 0., 1.], "triangle_indices": [0]}}
        self.value["catalog"]["features"].append(feature)
        self.add_interface(owner, "ankle_mount", [{"id": "hook", "label": "hook bearing face", "feature_refs": [feature["id"]],
                                                  "position": [.005, .0005, 0], "direction": [0., 0., 1.]}])
        self.required["interfaces"].append({"owner_ref": owner, "key": "ankle_mount", "members": [
            {"position": [.005, .0005, 0], "geometry_type": "source_region", "feature_kind": "latch_surface"}]})

    def test_four_servo_interfaces_preserve_entry_sides_and_rectangle(self):
        catalog.augment_scene(self.scene, self.root, self.value)
        self.assertNotIn("analysis", self.scene)
        interfaces = {item["key"]: item for item in self.scene["assembly"]["interfaces"] if item["owner_ref"] == "part:fixture:servo"}
        self.assertEqual(set(interfaces), {"end_minus", "end_plus", "housing_a", "housing_b"})
        self.assertEqual(interfaces["end_minus"]["members"][0]["direction"], [1., 0., 0.])
        self.assertEqual(interfaces["end_plus"]["members"][0]["direction"], [-1., 0., 0.])
        points = [member["position"] for member in interfaces["housing_a"]["members"]]
        distance = lambda a, b: math.dist(points[a], points[b])
        self.assertAlmostEqual(distance(0, 1), .016)
        self.assertAlmostEqual(distance(1, 2), .030)
        self.assertAlmostEqual(distance(0, 2), .034)

    def test_diagonal_and_cross_side_selections_are_rejected(self):
        for mutation in ("diagonal", "side"):
            value = deepcopy(self.value)
            interface = value["catalog"]["interfaces"][2]
            if mutation == "diagonal":
                interface["selection"]["allowed_pairs"].append(["A", "C"])
            else:
                interface["members"][1]["direction"] = [-1., 0., 0.]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                catalog.validate_input(value, self.scene, self.root)

    def test_independent_requirements_reject_deletion_after_cleanup(self):
        for mutation in ("interface", "member"):
            value = deepcopy(self.value)
            value["catalog"]["connections"] = []
            if mutation == "interface":
                value["catalog"]["interfaces"].pop(3)
            else:
                item = value["catalog"]["interfaces"][0]
                item["members"] = item["members"][1:]
                item["selection"]["allowed_pairs"] = [["B", "C"], ["C", "D"]]
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "independently required"):
                catalog.validate_input(value, self.scene, self.root)

    def test_foot_region_cannot_be_replaced_by_a_fake_hole(self):
        value = deepcopy(self.value)
        feature = next(item for item in value["catalog"]["features"] if item["id"] == "feature:foot:latch")
        feature["kind"] = "bore_wall"
        with self.assertRaisesRegex(ValueError, "independently required member"):
            catalog.validate_input(value, self.scene)

    def test_bearing_sizes_and_source_regions_cannot_be_interchanged(self):
        value = deepcopy(self.value)
        feature = next(item for item in value["catalog"]["features"] if item["id"] == "feature:small:inner_ring")
        feature["geometry"]["radius_m"] = .008
        with self.assertRaisesRegex(ValueError, "diameter"):
            catalog.validate_input(value, self.scene, self.root)
        with self.assertRaisesRegex(ValueError, "independently required member"):
            catalog.validate_input(value, self.scene)

    def test_bad_source_bytes_triangle_bounds_and_owner_fail(self):
        for mutation in ("sha", "triangle", "owner"):
            value = deepcopy(self.value)
            if mutation == "sha":
                value["catalog"]["features"][0]["geometry_digest"] = "sha256:"+"0"*64
            elif mutation == "triangle":
                value["catalog"]["features"][0]["geometry"]["triangle_indices"] = [1000000]
            else:
                value["catalog"]["interfaces"][0]["members"][0]["feature_refs"] = ["feature:small:inner_ring"]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                catalog.validate_input(value, self.scene, self.root)
        source = self.root / self.scene["sources"][0]["url"]
        source.write_bytes(source.read_bytes()+b"corrupt")
        with self.assertRaisesRegex(ValueError, "SHA mismatch"):
            catalog.validate_input(self.value, self.scene, self.root)

    def test_connections_keep_exclusions_out_of_used_list_and_enforce_members(self):
        interfaces = self.value["catalog"]["interfaces"]
        connection = {"id": "connection:fixture", "name": "Excluded direct pair", "mechanism": "diameter mismatch",
                      "basis": "incompatible", "endpoints": [{"interface_ref": interfaces[0]["id"], "member_refs": ["A", "B"]},
                                                             {"interface_ref": interfaces[4]["id"], "member_refs": ["radial"]}],
                      "evidence_refs": ["e:fixture"], "note": "Disk diameter differs from this bearing bore."}
        self.value["catalog"]["connections"].append(connection)
        catalog.validate_input(self.value, self.scene, self.root)
        self.assertEqual(catalog.used_connections(self.value["catalog"]), [])
        connection["endpoints"][1]["member_refs"] = ["A"]
        with self.assertRaisesRegex(ValueError, "different interface"):
            catalog.validate_input(self.value, self.scene, self.root)

    def test_evidence_merge_is_idempotent_and_conflicts_fail(self):
        catalog.augment_scene(self.scene, self.root, self.value)
        catalog.augment_scene(self.scene, self.root, self.value)
        self.assertEqual(len(self.scene["evidence"]), 1)
        changed = deepcopy(self.value)
        changed["evidence"][0]["excerpt"] = "Different content under same ID"
        with self.assertRaisesRegex(ValueError, "conflicts"):
            catalog.validate_input(changed, self.scene)

    def test_two_entry_sides_can_share_one_published_physical_wall(self):
        interfaces = self.value["catalog"]["interfaces"]
        shared = interfaces[2]["members"][0]["feature_refs"][0]
        interfaces[2]["members"][0]["resource_ref"] = shared
        interfaces[3]["members"][0]["resource_ref"] = shared
        catalog.validate_input(self.value, self.scene, self.root)
        interfaces[3]["members"][0]["resource_ref"] = "feature:small:inner_ring"
        with self.assertRaisesRegex(ValueError, "another Part"):
            catalog.validate_input(self.value, self.scene, self.root)

    def test_same_owner_hole_cannot_be_bound_to_another_holes_highlight(self):
        value = deepcopy(self.value)
        members = value["catalog"]["interfaces"][0]["members"]
        members[0]["feature_refs"] = members[1]["feature_refs"][:]
        with self.assertRaisesRegex(ValueError, "finite wall"):
            catalog.validate_input(value, self.scene, self.root)

    def test_independent_requirement_locks_are_not_unrelated_metadata(self):
        value = deepcopy(self.value)
        value["requirements"]["sources"][0]["sha256"] = "0"*64
        with self.assertRaisesRegex(ValueError, "source SHA"):
            catalog.validate_input(value, self.scene, self.root)
        # Even a standalone acceptance check binds required members to source
        # digests, so replacing both claimed radii and labels is insufficient.
        with self.assertRaisesRegex(ValueError, "independently required member"):
            catalog.validate_requirements(value["catalog"], value["requirements"])


class MicroduckIndependentCatalogRequirements(unittest.TestCase):
    """Device evidence stays in its own locked input, outside output counts."""
    @classmethod
    def setUpClass(cls):
        repo = SKILL.parents[1]
        cls.input = json.loads((repo / "device-materials/microduck-assembly-interfaces.json").read_text(encoding="utf-8"))
        cls.expected = json.loads((repo / "device-materials/assembly/microduck-interface-requirements.json").read_text(encoding="utf-8"))

    def interface(self, value, owner, key):
        return next(item for item in value["interfaces"] if item["owner_ref"] == "part:microduck:"+owner and item["key"] == key)

    def test_real_catalog_keeps_the_independent_frozen_requirements(self):
        # Historical requirements are immutable and must remain byte-for-byte
        # equivalent records; new independently reviewed structures may add
        # requirements without invalidating the original acceptance baseline.
        actual = self.input["requirements"]
        for key, expected in self.expected.items():
            if isinstance(expected, list):
                for record in expected:
                    self.assertIn(record, actual[key], (key, record))
            else:
                self.assertEqual(actual[key], expected)
        catalog.validate_requirements(self.input["catalog"], self.expected)

    def test_deleting_right_ankle_servo_housing_b_cannot_pass_by_cleaning_connections(self):
        value = deepcopy(self.input["catalog"])
        missing = self.interface(value, "0820b4025f26a004", "servo_housing_b")
        value["interfaces"].remove(missing)
        value["connections"] = [item for item in value["connections"] if all(end["interface_ref"] != missing["id"] for end in item["endpoints"])]
        with self.assertRaisesRegex(ValueError, "independently required interface"):
            catalog.validate_requirements(value, self.expected)

    def test_deleting_one_end_plus_member_cannot_pass_by_recounting(self):
        value = deepcopy(self.input["catalog"])
        interface = self.interface(value, "0820b4025f26a004", "servo_end_plus")
        hole = next(member for member in interface["members"] if math.dist(member["position"], [.0145, -.006, 0]) < 1e-6)
        interface["members"].remove(hole)
        value["connections"] = []
        with self.assertRaisesRegex(ValueError, "independently required member"):
            catalog.validate_requirements(value, self.expected)

    def test_right_ankle_bearing_stays_ten_mm_bore(self):
        value = deepcopy(self.input["catalog"])
        interface = self.interface(value, "e196235810184adf", "inner_ring")
        ref = next(member["feature_refs"][0] for member in interface["members"] if math.dist(member["position"], [0, 0, .0015]) < 1e-6)
        feature = next(item for item in value["features"] if item["id"] == ref)
        feature["geometry"]["radius_m"] = .008
        with self.assertRaisesRegex(ValueError, "independently required member"):
            catalog.validate_requirements(value, self.expected)

    def test_foot_sole_surface_does_not_turn_into_a_bore(self):
        value = deepcopy(self.input["catalog"])
        interface = self.interface(value, "f9955f19a691a1f4", "sole_fit")
        for ref in interface["members"][0]["feature_refs"]:
            next(item for item in value["features"] if item["id"] == ref)["kind"] = "bore_wall"
        with self.assertRaisesRegex(ValueError, "independently required member"):
            catalog.validate_requirements(value, self.expected)


if __name__ == "__main__":
    unittest.main()
