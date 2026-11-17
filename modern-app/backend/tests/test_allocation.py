import io
import unittest

from fastapi import HTTPException
from openpyxl import load_workbook

from backend.main import normalize_upload_columns
from backend.allocation import AllocationValidationError, allocate_animals, create_export_workbook


ANIMALS = [
    {"animal_id": "A1", "genotype": "WT", "sex": "M", "age": 8},
    {"animal_id": "A2", "genotype": "WT", "sex": "F", "age": 9},
    {"animal_id": "A3", "genotype": "KO", "sex": "M", "age": 10},
    {"animal_id": "A4", "genotype": "KO", "sex": "F", "age": 11},
    {"animal_id": "A5", "genotype": "WT", "sex": "M", "age": 12},
    {"animal_id": "A6", "genotype": "KO", "sex": "F", "age": 13},
]


def request(**overrides):
    values = {
        "animals": ANIMALS,
        "group_sizes": [3, 3],
        "group_names": ["Control", "Treatment"],
        "method": "balanced",
        "seed": 42,
        "age_unit": "weeks",
        "selected_sexes": ["M", "F"],
        "selected_genotypes": ["WT", "KO"],
        "balance_priorities": ["sex", "genotype", "age"],
        "locks": [],
        "together": [],
        "apart": [],
    }
    values.update(overrides)
    return values


class AllocationTests(unittest.TestCase):
    def allocate(self, **overrides):
        return allocate_animals(**request(**overrides))

    def test_balanced_allocation_respects_capacities_and_keeps_every_animal(self):
        result = self.allocate()
        self.assertTrue(result["allocation_found"])
        self.assertEqual([len(group["animals"]) for group in result["groups"]], [3, 3])
        assigned = [animal["animal_id"] for group in result["groups"] for animal in group["animals"]]
        self.assertCountEqual(assigned + [a["animal_id"] for a in result["unassigned_animals"]],
                              [a["animal_id"] for a in ANIMALS])
        self.assertEqual(result["balance"]["eligible_pool"]["count"], 6)
        self.assertEqual(result["age_unit"], "weeks")

    def test_seed_repeats_exact_allocation_for_both_methods(self):
        for method in ("simple_random", "balanced"):
            first = self.allocate(method=method)
            second = self.allocate(method=method)
            self.assertEqual(first["groups"], second["groups"])

    def test_filters_are_reported_and_unassigned_animals_are_retained(self):
        result = self.allocate(group_sizes=[1, 1], selected_genotypes=["WT"])
        self.assertEqual(result["balance"]["eligible_pool"]["count"], 3)
        self.assertEqual(sum(group["count"] for group in result["balance"]["groups"]), 2)
        self.assertEqual(len(result["unassigned_animals"]), 1)
        self.assertEqual([a["animal_id"] for a in result["excluded_animals"]], ["A3", "A4", "A6"])

    def test_locks_and_together_apart_rules_hold_before_balance_scoring(self):
        result = self.allocate(
            locks=[{"animal_id": "A1", "group_number": 1}],
            together=[{"animal_id_a": "A1", "animal_id_b": "A3"}],
            apart=[{"animal_id_a": "A2", "animal_id_b": "A4"}],
        )
        groups_by_id = {
            animal["animal_id"]: group["group_number"]
            for group in result["groups"]
            for animal in group["animals"]
        }
        self.assertEqual(groups_by_id["A1"], 1)
        self.assertEqual(groups_by_id["A1"], groups_by_id["A3"])
        self.assertNotEqual(groups_by_id["A2"], groups_by_id["A4"])

    def test_locked_together_cluster_is_placed_as_a_unit(self):
        animals = [
            {"animal_id": f"M{index}", "genotype": "WT", "sex": "M" if index % 2 else "F", "age": 8 + index}
            for index in range(1, 21)
        ]
        together = [{"animal_id_a": "M1", "animal_id_b": f"M{index}"} for index in range(2, 6)]
        for method in ("simple_random", "balanced"):
            with self.subTest(method=method):
                result = allocate_animals(
                    animals=animals,
                    group_sizes=[5, 5, 5, 5],
                    group_names=["A", "B", "C", "D"],
                    method=method,
                    seed=42,
                    age_unit="weeks",
                    selected_sexes=["M", "F"],
                    selected_genotypes=["WT"],
                    balance_priorities=["sex", "age"],
                    locks=[{"animal_id": "M1", "group_number": 1}],
                    together=together,
                    apart=[],
                )
                self.assertTrue(result["allocation_found"])
                self.assertEqual([group["count"] for group in result["groups"]], [5, 5, 5, 5])
                group_by_id = {
                    animal["animal_id"]: group["group_number"]
                    for group in result["groups"]
                    for animal in group["animals"]
                }
                self.assertTrue(all(group_by_id[f"M{index}"] == 1 for index in range(1, 6)))

    def test_conflicting_locks_are_rejected_before_search(self):
        with self.assertRaisesRegex(AllocationValidationError, "locked to different groups"):
            self.allocate(
                locks=[
                    {"animal_id": "A1", "group_number": 1},
                    {"animal_id": "A2", "group_number": 2},
                ],
                together=[{"animal_id_a": "A1", "animal_id_b": "A2"}],
            )

    def test_impossible_rules_report_search_exhaustion_without_a_false_assignment(self):
        result = self.allocate(
            group_sizes=[6],
            group_names=["Only group"],
            apart=[
                {"animal_id_a": "A1", "animal_id_b": "A2"},
                {"animal_id_a": "A2", "animal_id_b": "A3"},
                {"animal_id_a": "A1", "animal_id_b": "A3"},
            ],
        )
        self.assertFalse(result["allocation_found"])
        self.assertTrue(result["search_exhausted"])
        self.assertEqual(result["groups"], [])
        self.assertCountEqual([a["animal_id"] for a in result["unassigned_animals"]],
                              [a["animal_id"] for a in ANIMALS])

    def test_invalid_age_and_capacity_are_rejected(self):
        malformed = [dict(ANIMALS[0], age=float("nan")), *ANIMALS[1:]]
        with self.assertRaisesRegex(AllocationValidationError, "finite, non-negative age"):
            self.allocate(animals=malformed)
        with self.assertRaisesRegex(AllocationValidationError, "capacities exceed"):
            self.allocate(group_sizes=[4, 4])
        with self.assertRaisesRegex(AllocationValidationError, "Select at least one"):
            self.allocate(selected_sexes=[])
        with self.assertRaisesRegex(AllocationValidationError, "exact integer range"):
            self.allocate(seed=9_007_199_254_740_992)

    def test_declared_source_age_units_must_match_the_selected_unit(self):
        with self.assertRaisesRegex(AllocationValidationError, "selected age unit"):
            self.allocate(animals=[dict(ANIMALS[0], source_age_unit="days"), *ANIMALS[1:]])

    def test_export_contains_the_reviewed_group_membership_and_run_metadata(self):
        result = self.allocate(method="simple_random", seed=101)
        workbook_bytes = create_export_workbook(
            input_animals=ANIMALS,
            allocation=result,
            run_name="Fixture run",
        )
        workbook = load_workbook(io.BytesIO(workbook_bytes), data_only=True)
        metadata = dict(workbook["Method and balance"].iter_rows(min_row=2, values_only=True))
        self.assertEqual(metadata["Run name"], "Fixture run")
        self.assertEqual(metadata["Seed"], 101)
        self.assertEqual(metadata["Algorithm version"], result["algorithm_version"])
        for group in result["groups"]:
            sheet = workbook[f"Group {group['group_number']}"]
            exported_ids = [row[0] for row in sheet.iter_rows(min_row=2, values_only=True)]
            self.assertCountEqual(exported_ids, [animal["animal_id"] for animal in group["animals"]])

    def test_export_rejects_changed_animal_data(self):
        result = self.allocate(method="simple_random")
        result["groups"][0]["animals"][0]["age"] += 1
        with self.assertRaisesRegex(AllocationValidationError, "no longer matches the input data"):
            create_export_workbook(input_animals=ANIMALS, allocation=result, run_name="Changed record")

    def test_export_rechecks_apart_rules_in_the_reviewed_assignments(self):
        result = self.allocate(apart=[{"animal_id_a": "A1", "animal_id_b": "A2"}])
        result["groups"][0]["animals"] = ANIMALS[:3]
        result["groups"][1]["animals"] = ANIMALS[3:]
        with self.assertRaisesRegex(AllocationValidationError, "violates the apart rule"):
            create_export_workbook(input_animals=ANIMALS, allocation=result, run_name="Invalid group")


class UploadColumnTests(unittest.TestCase):
    def test_age_unit_headers_and_extra_columns_are_preserved(self):
        import pandas as pd

        source = pd.DataFrame(
            [["A1", "WT", "F", 8, "weeks", "Cage 4"]],
            columns=["Animal ID No.", "Genotype Class", "Sex", "Age (w)", "Age Unit", "Cage"],
        )
        normalized = normalize_upload_columns(source)
        self.assertEqual(list(normalized.columns), ["animal_id_no.", "genotype_class", "sex", "age_(w)", "age_unit", "cage"])
        self.assertEqual(normalized.iloc[0]["age_(w)"], 8)
        self.assertEqual(normalized.iloc[0]["age_unit"], "weeks")
        self.assertEqual(normalized.iloc[0]["cage"], "Cage 4")

    def test_upload_requires_an_age_value_column_not_only_age_unit(self):
        import pandas as pd

        with self.assertRaisesRegex(HTTPException, "Missing required columns: \['age'\]"):
            normalize_upload_columns(pd.DataFrame([["A1", "WT", "F", "weeks"]],
                                                   columns=["Animal ID", "Genotype", "Sex", "Age Unit"]))


if __name__ == "__main__":
    unittest.main()
