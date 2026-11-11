"""Finite resource continuity and independent typed review requirements."""
from __future__ import annotations

import copy
import hashlib
import math
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from psop_build_v2.capability_catalog import _physical_resources, build_catalog, validate_catalog
from test_capability_geometry import _stl, _wall


def _round_feature(identity, support, radius=.001, minimum=0., maximum=.001):
    return {"id": identity, "kind": "bore_wall", "owner_ref": "part:test:one", "geometry": {
        "type": "cylinder", "axis": [0., 0., 1.], "origin": [0., 0., (minimum + maximum) / 2],
        "radius_m": radius, "axial_range_m": [(minimum - maximum) / 2, (maximum - minimum) / 2],
        "triangle_indices": support}}


class PhysicalResourceContinuity(unittest.TestCase):
    def test_semantic_plane_alias_shares_material_under_the_explicit_new_policy(self):
        raw=_stl(_wall(.001,.001,0.,.003))
        original={"id":"plane","kind":"planar_patch","owner_ref":"part:test:one","geometry":{"type":"plane","triangle_indices":[0]}}
        alias={**copy.deepcopy(original),"id":"named-seat","replacement_feature_refs":["plane"]}
        historical=_physical_resources([original,alias],raw, "part:test:one")
        current=_physical_resources([original,alias],raw, "part:test:one",share_surface_aliases=True)
        self.assertEqual(len(historical),2)
        self.assertEqual(len(current),1)
        self.assertEqual(set(current[0]["feature_refs"]),{"plane","named-seat"})

    def test_coaxial_ears_across_empty_space_remain_two_resources(self):
        raw = _stl(_wall(.001, .001, -.003, -.002) + _wall(.001, .001, .002, .003))
        features = [_round_feature("a", list(range(144)), minimum=-.003, maximum=-.002),
                    _round_feature("b", list(range(144, 288)), minimum=.002, maximum=.003)]
        resources = _physical_resources(features, raw, "part:test:one")
        holes = [r for r in resources if r["kind"] == "logical_hole"]
        self.assertEqual(len(holes), 2)
        self.assertTrue(all(len(r["entries"]) == 2 for r in holes))
        self.assertTrue(all(not e["open_entrance_confirmed"] for r in holes for e in r["entries"]))

    def test_shared_finite_annular_shoulder_joins_two_stepped_segments(self):
        walls = _wall(.001, .001, -.003, 0.) + _wall(.002, .002, 0., .001)
        shoulder = []
        for i in range(72):
            a, b = i * 2 * math.pi / 72, (i + 1) * 2 * math.pi / 72
            p, q = (.001 * math.cos(a), .001 * math.sin(a), 0.), (.001 * math.cos(b), .001 * math.sin(b), 0.)
            r, s = (.002 * math.cos(b), .002 * math.sin(b), 0.), (.002 * math.cos(a), .002 * math.sin(a), 0.)
            shoulder.extend(((p, q, r), (p, r, s)))
        raw = _stl(walls + shoulder)
        features = [_round_feature("a", list(range(144)), minimum=-.003, maximum=0.),
                    _round_feature("b", list(range(144, 288)), radius=.002),
                    {"id": "shoulder", "kind": "planar_patch", "geometry": {"type": "plane", "normal": [0., 0., 1.],
                     "origin": [0., 0., 0.], "triangle_indices": list(range(288, 432))}}]
        holes = [r for r in _physical_resources(features, raw, "part:test:one") if r["kind"] == "logical_hole"]
        self.assertEqual(len(holes), 1)
        self.assertEqual(holes[0]["continuity"]["witnesses"][0]["method"], "finite_shoulder_adjacency")

    def test_two_shared_vertices_without_a_shared_source_edge_do_not_prove_continuity(self):
        def p(degrees, z):
            angle = math.radians(degrees)
            return .001 * math.cos(angle), .001 * math.sin(angle), z
        a, b = p(0, 0.), p(180, .001)
        triangles = [(a, p(20, 0.), p(20, .001)), (b, p(160, 0.), p(160, .001)),
                     (a, p(-20, 0.), p(-20, .001)), (b, p(200, 0.), p(200, .001))]
        raw = _stl(triangles)
        features = [_round_feature("a", [0, 1]), _round_feature("b", [2, 3])]
        holes = [r for r in _physical_resources(features, raw, "part:test:one") if r["kind"] == "logical_hole"]
        self.assertEqual(len(holes), 2, "A pair of common points is not necessarily a common source mesh edge")


class CatalogValidation(unittest.TestCase):
    def test_multiple_semantic_names_resolve_to_measurements_instead_of_alias_chains(self):
        source=next(f for f in self.catalog["features"] if f["kind"]=="bore_wall")
        old=[]
        for name in ("first-role","second-role"):
            f={k:copy.deepcopy(source[k]) for k in ("owner_ref","geometry_source_ref","geometry_digest","kind","geometry")}
            f["id"]=name;old.append(f)
        result=build_catalog(self.scene,self.root,{"features":old,"interfaces":[],"connections":[],"part_notes":[]})
        measured={f["id"] for f in result["features"] if f.get("basis")=="mesh_measurement"}
        for name in ("first-role","second-role"):
            f=next(f for f in result["features"] if f["id"]==name)
            self.assertTrue(f["replacement_feature_refs"])
            self.assertLessEqual(set(f["replacement_feature_refs"]),measured)
        validate_catalog(result,self.scene,self.root,self.requirements)

    def setUp(self):
        self.directory = TemporaryDirectory(prefix="psop-capability-catalog-")
        self.root = Path(self.directory.name)
        raw = _stl(_wall(.001, .001, 0., .003))
        (self.root / "wall.stl").write_bytes(raw)
        digest = hashlib.sha256(raw).hexdigest()
        self.scene = {"meta": {"deviceId": "test"}, "evidence": [], "sources": [{"id": "SRC-WALL", "url": "wall.stl", "format": "stl", "digest": digest}],
                      "parts": [{"id": "part:test:one", "name": "one", "meshKey": "wall", "geometryUrl": "wall.stl", "sourceIds": ["SRC-WALL"], "evidenceIds": []}]}
        self.catalog = build_catalog(self.scene, self.root)
        self.requirements = {"schema": "psop.assembly.requirements/2", "id": "independent-test", "date": "2026-11-08",
            "method": "synthetic_known_wall", "provenance": [], "first_regression_findings": [], "limits": ["No functional confirmation"],
            "meshes": [{"source_ref": "SRC-WALL", "source_sha256": digest, "mesh_key": "wall", "review_basis": ["Independently generated circular source"],
                        "review_scope": "finite wall", "finding_refs": ["known-wall"], "regions": [{"id": "known-wall", "triangle_indices": list(range(144)),
                        "geometry_types": ["cylinder"], "kind": "bore_wall", "minimum_coverage": 1., "require_entries": True}]}]}

    def tearDown(self):
        self.directory.cleanup()

    def test_valid_catalog_has_independently_checked_source_and_finite_entries(self):
        result = validate_catalog(self.catalog, self.scene, self.root, self.requirements)
        self.assertEqual(result["checks"][0]["coverage"], 1.)

    def test_source_region_cannot_replace_an_independently_required_typed_wall(self):
        feature = self.catalog["features"][0]
        feature["kind"] = "surface_region"
        feature["geometry"] = {"type": "source_region", "origin": [0., 0., 0.], "normal": [0., 0., 1.], "triangle_indices": list(range(144))}
        raw = (self.root / "wall.stl").read_bytes()
        self.catalog["resources"] = _physical_resources(self.catalog["features"], raw, "part:test:one")
        # Reseal the output's own dispositions as well: the independent typed
        # requirement must still reject an arbitrary finite-region substitute.
        self.catalog["instance_reviews"][0]["regions"][0]["geometry_type"] = "source_region"
        feature["capability"]["resource_refs"] = [self.catalog["resources"][0]["id"]]
        with self.assertRaisesRegex(ValueError, "Independent required region missing"):
            validate_catalog(self.catalog, self.scene, self.root, self.requirements)

    def test_forged_boundary_direction_is_rejected_even_when_the_endpoint_position_matches(self):
        self.catalog["resources"][0]["entries"][0]["direction"] = [1., 0., 0.]
        with self.assertRaisesRegex(ValueError, "continuity witnesses differ"):
            validate_catalog(self.catalog, self.scene, self.root, self.requirements)

    def test_mesh_bytes_are_rechecked_and_missing_independent_mesh_review_is_rejected(self):
        requirements = copy.deepcopy(self.requirements)
        requirements["meshes"].clear()
        with self.assertRaisesRegex(ValueError, "every input mesh"):
            validate_catalog(self.catalog, self.scene, self.root, requirements)
        raw = bytearray((self.root / "wall.stl").read_bytes());raw[12] ^= 1
        (self.root / "wall.stl").write_bytes(raw)
        with self.assertRaisesRegex(ValueError, "disagree with registry"):
            validate_catalog(self.catalog, self.scene, self.root, self.requirements)


if __name__ == "__main__":
    unittest.main()
