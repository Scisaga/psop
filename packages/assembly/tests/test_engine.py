"""Meaningful selection, handedness, shared-pose and completion regressions."""
from copy import deepcopy
import json
import math
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from psop_assembly import evaluate, query_definition, selection_sets, selection_status


def fixture(mode="exact-four-examples"):
    definition = json.loads((ROOT / "fixtures/four-hole-modes.json").read_text(encoding="utf-8"))
    definition["query"]["mode_a"] = definition["query"]["mode_b"] = mode
    return definition


def explicit(roles=("A", "B", "C", "D")):
    return {"selected_roles_a": list(roles), "selected_roles_b": list(roles),
            "member_mapping": [{"role_a": role, "role_b": role} for role in roles]}


class AssemblyEngine(unittest.TestCase):
    def test_exact_sets_are_not_anchor_supersets_and_open_examples_stay_unknown(self):
        definition = fixture()
        interface = definition["interfaces"][0]
        modes = {mode["id"]: mode for mode in interface["modes"]}
        exact = selection_sets(interface, modes["exact-four-examples"])
        self.assertEqual({tuple(v) for v in exact["admissible_sets"]}, {("A", "B"), ("C", "D"), ("A", "B", "C"), ("A", "B", "C", "D")})
        self.assertEqual(selection_status(interface, modes["exact-four-examples"], ["A", "B", "D"]), "fail")
        self.assertEqual(selection_status(interface, modes["contains-anchor-pair"], ["A", "B", "D"]), "pass")
        opened = selection_sets(interface, modes["open-two-examples"])
        self.assertEqual(len(opened["admissible_sets"]), 2)
        self.assertEqual(len(opened["unknown_sets"]), 13)
        self.assertEqual(selection_status(interface, modes["open-two-examples"], ["A", "B", "C"]), "unknown")

    def test_cardinality_anchor_and_paired_rules_generate_11_7_3(self):
        interface = fixture()["interfaces"][0]
        counts = {mode["id"]: len(selection_sets(interface, mode)["admissible_sets"]) for mode in interface["modes"]}
        self.assertEqual([counts[name] for name in ("cardinality-2-to-4", "contains-anchor-pair", "paired-dependencies")], [11, 7, 3])
        paired = next(mode for mode in interface["modes"] if mode["id"] == "paired-dependencies")
        self.assertEqual(selection_status(interface, paired, ["A", "B", "C"]), "fail")

    def test_full_pattern_preserves_four_proper_rotations_and_rejects_reflections(self):
        result = query_definition(fixture("full-pattern"))
        self.assertTrue(result["search"]["complete"])
        self.assertEqual(result["search"]["mappings_examined"], 24)
        self.assertEqual(len(result["proposals"]), 4)
        rotations = []
        for proposal in result["proposals"]:
            transform = proposal["pose"]["transform"]
            self.assertAlmostEqual(transform["determinant"], 1.)
            self.assertEqual(transform["maps_frame_b_to_a"], ["frame:synthetic:right", "frame:synthetic:left"])
            self.assertLess(proposal["assessments"]["geometry"]["max_position_residual_m"], 1e-12)
            rotation = transform["rotation"]
            rotations.append(round(math.degrees(math.atan2(rotation[1][0], rotation[0][0]))) % 360)
        self.assertEqual(sorted(rotations), [0, 90, 180, 270])

    def test_per_hole_fit_cannot_replace_one_shared_rigid_transform(self):
        definition = fixture("full-pattern")
        next(h for h in definition["logical_holes"] if h["id"] == "hole:synthetic:right:D")["center_m"][0] += .0008
        result = query_definition(definition)
        self.assertEqual(result["status"], "no_solution_in_declared_scope")
        self.assertEqual(result["proposals"], [])
        evaluated = evaluate(definition, explicit())
        self.assertEqual(evaluated["pose"]["status"], "incompatible")
        self.assertEqual(evaluated["assessments"]["geometry"]["status"], "fail")

    def test_chiral_point_mapping_cannot_use_an_improper_transform(self):
        definition = fixture("full-pattern")
        points = {"A": [0., 0., 0.], "B": [.01, 0., 0.], "C": [.003, .007, 0.], "D": [.002, .001, .009]}
        for hole in definition["logical_holes"]:
            center = list(points[hole["id"][-1]])
            if ":right:" in hole["id"]:
                center[0] *= -1
            hole["center_m"] = center
        proposal = evaluate(definition, explicit())
        self.assertEqual(proposal["assessments"]["geometry"]["status"], "fail")

    def test_single_point_axis_retains_a_pose_family_and_never_fakes_unique_pose(self):
        result = query_definition(fixture("single-hole"))
        self.assertEqual(len(result["proposals"]), 1)
        proposal = result["proposals"][0]
        self.assertEqual(proposal["pose"]["status"], "underdetermined")
        self.assertIsNone(proposal["pose"]["transform"])
        self.assertEqual(proposal["assessments"]["geometry"]["status"], "unknown")

    def test_missing_warrant_does_not_turn_geometric_pattern_into_interface_authority(self):
        definition = fixture("full-pattern")
        definition["interfaces"][0].pop("warrant")
        with self.assertRaises(ValueError):
            query_definition(definition)

    def test_missing_connectors_paths_elasticity_and_engagement_never_complete(self):
        proposal = query_definition(fixture("full-pattern"))["proposals"][0]
        self.assertEqual(proposal["assessments"]["geometry"]["status"], "pass")
        for dimension in ("mechanical", "engineering", "task", "completion"):
            self.assertEqual(proposal["assessments"][dimension]["status"], "unknown")
        self.assertEqual(proposal["engaged_member_pairs"], [])
        text = " ".join(proposal["unresolved_requirements"])
        self.assertIn("third-party", text)
        self.assertIn("path", text)
        self.assertIn("Elastic", text)

    def test_selected_S_is_distinct_from_evidenced_engaged_subset(self):
        definition = fixture("full-pattern")
        definition["context"]["engagement"] = [{"member_pair": [role, role], "status": "engaged", "basis_refs": ["synthetic:state"]} for role in ("A", "B")]
        proposal = evaluate(definition, explicit())
        self.assertEqual(proposal["selected_roles_a"], ["A", "B", "C", "D"])
        self.assertEqual(proposal["engaged_member_pairs"], [["A", "A"], ["B", "B"]])
        self.assertEqual(proposal["assessments"]["completion"]["status"], "unknown")

    def sharing_definition(self):
        definition = fixture("single-hole")
        warrant = deepcopy(definition["interfaces"][0]["warrant"])
        definition["participants"] = [{"id": "connector:one", "kind": "synthetic_fastener", "basis_refs": ["fixture:connector"]}]
        definition["context"] = {"existing_uses": [{"id": "use:layer-one", "hole_ref": "hole:synthetic:left:A", "axial_interval_m": [-.002, 0.], "participant_ref": "connector:one", "sharing_group": "stack:one"}],
                                 "connector_bindings": [{"role_ref": "fastener", "member_pair": ["A", "A"], "participant_ref": "connector:one", "uses": [{"hole_ref": "hole:synthetic:left:A", "axial_interval_m": [-.002, 0.], "sharing_group": "stack:one"}]}],
                                 "sharing_rules": [{"id": "share:one", "kind": "common_participant_multilayer", "sharing_group": "stack:one", "participant_ref": "connector:one", "warrant": warrant}]}
        return definition

    def test_shared_multilayer_hole_uses_explicit_sharing_not_capacity_one(self):
        definition = self.sharing_definition()
        proposal = evaluate(definition, explicit(("A",)))
        self.assertEqual(proposal["assessments"]["occupancy"]["status"], "pass")
        definition["context"]["sharing_rules"] = []
        self.assertEqual(evaluate(definition, explicit(("A",)))["assessments"]["occupancy"]["status"], "unknown")

    def test_distinct_participants_need_explicit_exclusion_to_reject_shared_interval(self):
        definition = self.sharing_definition()
        definition["participants"].append({"id": "connector:two", "kind": "synthetic_fastener", "basis_refs": ["fixture:connector"]})
        definition["context"]["connector_bindings"][0]["participant_ref"] = "connector:two"
        definition["context"]["sharing_rules"] = []
        self.assertEqual(evaluate(definition, explicit(("A",)))["assessments"]["occupancy"]["status"], "unknown")
        definition["context"]["sharing_rules"].append({"id": "exclusive:A", "kind": "exclusive_intervals", "hole_ref": "hole:synthetic:left:A", "warrant": deepcopy(definition["interfaces"][0]["warrant"])})
        self.assertEqual(evaluate(definition, explicit(("A",)))["assessments"]["occupancy"]["status"], "fail")

    def test_disjoint_atomic_members_of_same_interface_are_not_globally_consumed(self):
        definition = self.sharing_definition()
        definition["query"]["mode_a"] = definition["query"]["mode_b"] = "exact-four-examples"
        definition["context"]["sharing_rules"] = []
        definition["context"]["connector_bindings"] = []
        proposal = evaluate(definition, explicit(("C", "D")))
        self.assertEqual(proposal["assessments"]["occupancy"]["status"], "pass")

    def test_search_bounds_report_unknown_even_with_partial_proposals(self):
        definition = fixture("full-pattern")
        definition["query"]["limits"]["max_mappings"] = 1
        result = query_definition(definition)
        self.assertEqual(result["status"], "unknown")
        self.assertFalse(result["search"]["complete"])
        self.assertEqual(result["search"]["stop_reason"], "max_mappings")
        definition["query"]["limits"]["max_members"] = 3
        self.assertEqual(query_definition(definition)["status"], "unknown")

    def test_invalid_references_raise_value_error_and_source_input_is_unchanged(self):
        definition = fixture()
        original = deepcopy(definition)
        query_definition(definition)
        self.assertEqual(definition, original)
        definition["query"]["mode_a"] = "not-a-mode"
        with self.assertRaises(ValueError):
            query_definition(definition)

    def test_unoriented_two_hole_mapping_retains_both_axis_sign_branches(self):
        definition = fixture("exact-four-examples")
        definition["query"]["axis_relation"] = "unoriented"
        for interface in definition["interfaces"]:
            interface["modes"][0]["selection"]["allowed_sets"] = [["A", "B"]]
        result = query_definition(definition)
        self.assertTrue(result["search"]["complete"])
        self.assertEqual(len(result["proposals"]), 4)
        self.assertEqual(len({p["id"] for p in result["proposals"]}), 4)
        identity_mapping = [p for p in result["proposals"] if all(m["role_a"] == m["role_b"] for m in p["member_mapping"])]
        self.assertEqual(len(identity_mapping), 2)
        signs = [round(p["pose"]["transform"]["rotation"][2][2]) for p in identity_mapping]
        self.assertEqual(sorted(signs), [-1, 1])
        for proposal in identity_mapping:
            replay = evaluate(definition, proposal)
            self.assertEqual(replay["id"], proposal["id"])
        undecided = evaluate(definition, explicit(("A", "B")))
        self.assertEqual(undecided["pose"]["status"], "underdetermined")
        self.assertIsNone(undecided["pose"]["transform"])

    def test_engineering_and_task_whitelists_do_not_lock_geometric_query_space(self):
        for dimension in ("engineering", "task"):
            definition = fixture("exact-four-examples")
            for interface in definition["interfaces"]:
                interface["modes"][0]["selection"]["dimension"] = dimension
            result = query_definition(definition)
            outside = [p for p in result["proposals"] if p["selected_roles_a"] == ["A", "C"] and p["selected_roles_b"] == ["A", "C"]]
            self.assertTrue(outside)
            self.assertTrue(all(p["assessments"][dimension]["status"] == "fail" for p in outside))
            self.assertTrue(all(p["assessments"]["mechanical"]["status"] == "unknown" for p in outside))

    def test_missing_selection_dimension_defaults_to_engineering_and_is_reported(self):
        definition = fixture()
        for interface in definition["interfaces"]:
            interface["modes"][0]["selection"].pop("dimension")
        proposal = evaluate(definition, explicit(("A", "C")))
        self.assertEqual(proposal["assessments"]["engineering"]["status"], "fail")
        self.assertEqual(proposal["assessments"]["mechanical"]["status"], "unknown")
        self.assertTrue(all(r["dimension"] == "engineering" and r["dimension_defaulted"] for r in proposal["selection_results"]))

    def test_unknown_rules_internal_q_and_authority_fields_are_rejected_at_runtime(self):
        definition = fixture()
        definition["interfaces"][0]["modes"][0]["selection"]["excludes"] = ["A"]
        with self.assertRaises(ValueError):
            query_definition(definition)
        definition = fixture()
        definition["context"]["internal_q"] = {"joint:invented": .2}
        with self.assertRaises(ValueError):
            query_definition(definition)
        for field in ("retaining", "held", "complete"):
            proposal = explicit(("A", "B"))
            proposal[field] = True
            with self.subTest(field=field), self.assertRaises(ValueError):
                evaluate(fixture(), proposal)
        proposal = explicit(("A", "B"))
        proposal["member_mapping"][0]["held"] = True
        with self.assertRaises(ValueError):
            evaluate(fixture(), proposal)

    def test_definition_digest_and_pose_are_part_of_proposal_identity(self):
        definition = fixture()
        first = evaluate(definition, explicit(("A", "B")))
        for change in ("geometry", "rule", "warrant", "context"):
            changed = deepcopy(definition)
            if change == "geometry":
                changed["logical_holes"][0]["radius_m"] += .0001
            elif change == "rule":
                changed["interfaces"][0]["modes"][0]["selection"]["dimension"] = "engineering"
            elif change == "warrant":
                changed["interfaces"][0]["warrant"]["refs"].append("来源:修订")
            else:
                changed["context"]["assessments"] = {"task": {"status": "unknown", "basis_refs": []}}
            second = evaluate(changed, explicit(("A", "B")))
            with self.subTest(change=change):
                self.assertNotEqual(first["definition_digest"], second["definition_digest"])
                self.assertNotEqual(first["id"], second["id"])

    def test_resolved_hole_identity_and_supplied_pose_are_revalidated(self):
        definition = fixture()
        proposal = explicit(("A", "B"))
        proposal["member_mapping"][0]["hole_a_ref"] = "hole:synthetic:left:D"
        with self.assertRaises(ValueError):
            evaluate(definition, proposal)
        proposal = evaluate(definition, explicit(("A", "B")))
        proposal["pose"]["transform"]["translation_m"][0] += .01
        with self.assertRaises(ValueError):
            evaluate(definition, proposal)

    def test_sharing_context_must_bind_declared_participants_and_finite_hole_regions(self):
        for change in ("participant", "hole", "interval"):
            definition = self.sharing_definition()
            if change == "participant":
                definition["context"]["connector_bindings"][0]["participant_ref"] = "connector:invented"
            elif change == "hole":
                definition["context"]["existing_uses"][0]["hole_ref"] = "hole:invented"
            else:
                definition["context"]["existing_uses"][0]["axial_interval_m"] = [-.02, 0.]
            with self.subTest(change=change), self.assertRaises(ValueError):
                evaluate(definition, explicit(("A",)))


if __name__ == "__main__":
    unittest.main()
