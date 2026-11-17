"""Seeded animal allocation for the guided grouping workflow."""

from __future__ import annotations

import math
import random
from collections import Counter
from statistics import fmean, pstdev
from typing import Any, Dict, Iterable, List, Mapping, Sequence, Tuple


ALGORITHM_VERSION = "animal-allocation-v2"
BALANCED_SEARCH_LIMIT = 300
SIMPLE_SEARCH_LIMIT = 600
AGE_UNITS = {"days", "weeks", "months", "years"}
BALANCE_FIELDS = {"sex", "genotype", "age"}


class AllocationValidationError(ValueError):
    """An input or hard constraint cannot be used for allocation."""


def _clean_animals(rows: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    animals: List[Dict[str, Any]] = []
    seen_ids = set()

    for row_number, raw in enumerate(rows, start=1):
        animal_id = str(raw.get("animal_id", "")).strip()
        genotype = str(raw.get("genotype", "")).strip()
        sex = str(raw.get("sex", "")).strip()
        if not animal_id:
            raise AllocationValidationError(f"Animal row {row_number} has no ID.")
        normalized_id = animal_id.casefold()
        if normalized_id in seen_ids:
            raise AllocationValidationError(f"Animal ID {animal_id} appears more than once.")
        seen_ids.add(normalized_id)
        if not genotype:
            raise AllocationValidationError(f"Animal {animal_id} has no genotype.")
        if not sex:
            raise AllocationValidationError(f"Animal {animal_id} has no sex or category.")

        if isinstance(raw.get("age"), bool):
            raise AllocationValidationError(f"Animal {animal_id} has an invalid age.")
        try:
            age = float(raw.get("age"))
        except (TypeError, ValueError):
            raise AllocationValidationError(f"Animal {animal_id} has an invalid age.") from None
        if not math.isfinite(age) or age < 0:
            raise AllocationValidationError(f"Animal {animal_id} must have a finite, non-negative age.")

        animals.append({**raw, "animal_id": animal_id, "genotype": genotype, "sex": sex, "age": age})

    if not animals:
        raise AllocationValidationError("Enter at least one animal.")
    return animals


def _categorical_summary(animals: Sequence[Mapping[str, Any]], field: str) -> Dict[str, Any]:
    counts = Counter(str(animal[field]) for animal in animals)
    total = len(animals)
    return {
        value: {"count": count, "proportion": count / total if total else 0.0}
        for value, count in sorted(counts.items())
    }


def _age_summary(animals: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    ages = [float(animal["age"]) for animal in animals]
    if not ages:
        return {"n": 0, "mean": None, "sd": None, "minimum": None, "maximum": None}
    return {
        "n": len(ages),
        "mean": fmean(ages),
        "sd": pstdev(ages),
        "minimum": min(ages),
        "maximum": max(ages),
    }


def _allocation_summary(
    eligible: Sequence[Mapping[str, Any]],
    groups: Sequence[Mapping[str, Any]],
    priorities: Sequence[str],
) -> Dict[str, Any]:
    group_summaries = []
    for group in groups:
        members = group["animals"]
        group_summaries.append({
            "group_number": group["group_number"],
            "group_name": group["group_name"],
            "count": len(members),
            "capacity": group["capacity"],
            "sex": _categorical_summary(members, "sex"),
            "genotype": _categorical_summary(members, "genotype"),
            "age": _age_summary(members),
        })
    return {
        "eligible_pool": {
            "count": len(eligible),
            "sex": _categorical_summary(eligible, "sex"),
            "genotype": _categorical_summary(eligible, "genotype"),
            "age": _age_summary(eligible),
        },
        "groups": group_summaries,
        "priority_order": list(priorities),
    }


def _score(
    eligible: Sequence[Mapping[str, Any]],
    groups: Sequence[Mapping[str, Any]],
    priorities: Sequence[str],
) -> Tuple[float, ...]:
    scores = []
    for field in priorities:
        if field in {"sex", "genotype"}:
            overall = Counter(str(animal[field]) for animal in eligible)
            target = {value: count / len(eligible) for value, count in overall.items()}
            error = 0.0
            for group in groups:
                members = group["animals"]
                observed = Counter(str(animal[field]) for animal in members)
                error += sum(
                    abs(observed.get(value, 0) / len(members) - proportion)
                    for value, proportion in target.items()
                )
            scores.append(error / len(groups))
            continue

        pool_ages = [float(animal["age"]) for animal in eligible]
        pool_mean = fmean(pool_ages)
        pool_sd = pstdev(pool_ages)
        scale = pool_sd if pool_sd > 0 else 1.0
        age_error = 0.0
        for group in groups:
            ages = [float(animal["age"]) for animal in group["animals"]]
            age_error += abs(fmean(ages) - pool_mean) / scale
            age_error += abs(pstdev(ages) - pool_sd) / scale
        scores.append(age_error / len(groups))
    return tuple(scores)


def _validated_rules(
    eligible: Sequence[Mapping[str, Any]],
    group_sizes: Sequence[int],
    locks: Sequence[Mapping[str, Any]],
    together: Sequence[Mapping[str, Any]],
    apart: Sequence[Mapping[str, Any]],
) -> Tuple[Dict[str, int], List[Tuple[str, str]], List[Tuple[str, str]], List[List[str]]]:
    by_id = {str(animal["animal_id"]): animal for animal in eligible}
    known_ids = set(by_id)
    locked: Dict[str, int] = {}
    for lock in locks:
        animal_id = str(lock.get("animal_id", "")).strip()
        try:
            group_number = int(lock.get("group_number"))
        except (TypeError, ValueError):
            raise AllocationValidationError(f"Lock for {animal_id or 'an animal'} has an invalid group.") from None
        if animal_id not in known_ids:
            raise AllocationValidationError(f"Locked animal {animal_id or '(blank)'} is not in the eligible pool.")
        if group_number < 1 or group_number > len(group_sizes):
            raise AllocationValidationError(f"Lock for {animal_id} refers to a group that does not exist.")
        if animal_id in locked and locked[animal_id] != group_number:
            raise AllocationValidationError(f"Animal {animal_id} is locked to two different groups.")
        locked[animal_id] = group_number

    lock_counts = Counter(locked.values())
    for group_number, count in lock_counts.items():
        if count > group_sizes[group_number - 1]:
            raise AllocationValidationError(
                f"Group {group_number} has {count} locked animals but capacity {group_sizes[group_number - 1]}."
            )

    def normalize_pairs(raw_pairs: Sequence[Mapping[str, Any]], label: str) -> List[Tuple[str, str]]:
        result = []
        for pair in raw_pairs:
            first = str(pair.get("animal_id_a", "")).strip()
            second = str(pair.get("animal_id_b", "")).strip()
            if first == second:
                raise AllocationValidationError(f"A {label} rule must name two different animals.")
            if first not in known_ids or second not in known_ids:
                raise AllocationValidationError(f"A {label} rule refers to an animal outside the eligible pool.")
            result.append(tuple(sorted((first, second))))
        return sorted(set(result))

    together_pairs = normalize_pairs(together, "together")
    apart_pairs = normalize_pairs(apart, "apart")
    conflict = set(together_pairs).intersection(apart_pairs)
    if conflict:
        first, second = next(iter(conflict))
        raise AllocationValidationError(f"Animals {first} and {second} are marked both together and apart.")

    parent = {animal_id: animal_id for animal_id in known_ids}

    def find(animal_id: str) -> str:
        while parent[animal_id] != animal_id:
            parent[animal_id] = parent[parent[animal_id]]
            animal_id = parent[animal_id]
        return animal_id

    for first, second in together_pairs:
        parent[find(second)] = find(first)

    components: Dict[str, List[str]] = {}
    for animal_id in sorted(known_ids):
        components.setdefault(find(animal_id), []).append(animal_id)
    component_by_id = {animal_id: root for root, members in components.items() for animal_id in members}
    for root, members in components.items():
        if len(members) > max(group_sizes):
            raise AllocationValidationError(
                f"The together rule for {', '.join(sorted(members))} exceeds every group capacity."
            )
        locked_groups = {locked[animal_id] for animal_id in members if animal_id in locked}
        if len(locked_groups) > 1:
            raise AllocationValidationError(
                f"Together animals {', '.join(sorted(members))} are locked to different groups."
            )
        if locked_groups:
            locked_group = next(iter(locked_groups))
            if len(members) > group_sizes[locked_group - 1]:
                raise AllocationValidationError(
                    f"Together animals {', '.join(sorted(members))} exceed the capacity of locked group {locked_group}."
                )

    for first, second in apart_pairs:
        if component_by_id[first] == component_by_id[second]:
            raise AllocationValidationError(f"Animals {first} and {second} are connected by conflicting together/apart rules.")
        if first in locked and second in locked and locked[first] == locked[second]:
            raise AllocationValidationError(f"Apart animals {first} and {second} are locked to the same group.")

    component_members = sorted((sorted(members) for members in components.values()), key=lambda members: members[0])
    return locked, together_pairs, apart_pairs, component_members


def _constrained_candidate(
    *,
    eligible: Sequence[Mapping[str, Any]],
    group_sizes: Sequence[int],
    group_names: Sequence[str],
    locked: Mapping[str, int],
    components: Sequence[Sequence[str]],
    apart_pairs: Sequence[Tuple[str, str]],
    rng: random.Random,
    node_limit: int = 20_000,
) -> Tuple[List[Dict[str, Any]] | None, int]:
    """Place together-connected animal groups as units, backtracking around hard rules."""
    animals_by_id = {str(animal["animal_id"]): animal for animal in eligible}
    component_index = {
        animal_id: index
        for index, members in enumerate(components)
        for animal_id in members
    }
    apart_neighbors: Dict[int, set[int]] = {index: set() for index in range(len(components))}
    for first, second in apart_pairs:
        first_component = component_index[first]
        second_component = component_index[second]
        apart_neighbors[first_component].add(second_component)
        apart_neighbors[second_component].add(first_component)

    groups = [
        {"group_number": index, "group_name": name, "capacity": group_sizes[index - 1], "animals": []}
        for index, name in enumerate(group_names, start=1)
    ]
    remaining = list(group_sizes)
    assigned_component_groups: Dict[int, int] = {}
    locked_components = set()
    for index, members in enumerate(components):
        locked_groups = {locked[animal_id] for animal_id in members if animal_id in locked}
        if not locked_groups:
            continue
        group_number = next(iter(locked_groups))
        if remaining[group_number - 1] < len(members):
            return None, 0
        locked_components.add(index)
        assigned_component_groups[index] = group_number
        remaining[group_number - 1] -= len(members)
        groups[group_number - 1]["animals"].extend(animals_by_id[animal_id] for animal_id in members)

    remaining_components = [index for index in range(len(components)) if index not in locked_components]
    tie_breaks = {index: rng.random() for index in remaining_components}
    order = sorted(
        remaining_components,
        key=lambda index: (-len(components[index]), -len(apart_neighbors[index]), tie_breaks[index]),
    )
    possible_animals = [0] * (len(order) + 1)
    for position in range(len(order) - 1, -1, -1):
        possible_animals[position] = possible_animals[position + 1] + len(components[order[position]])

    nodes_checked = 0

    def search(position: int) -> List[Dict[str, Any]] | None:
        nonlocal nodes_checked
        if nodes_checked >= node_limit:
            return None
        nodes_checked += 1
        capacity_left = sum(remaining)
        if capacity_left == 0:
            return [{**group, "animals": list(group["animals"])} for group in groups]
        if position >= len(order) or possible_animals[position] < capacity_left:
            return None

        index = order[position]
        members = components[index]
        size = len(members)
        choices = [group_index for group_index, capacity in enumerate(remaining) if capacity >= size]
        rng.shuffle(choices)
        for group_index in choices:
            group_number = group_index + 1
            if any(assigned_component_groups.get(neighbor) == group_number for neighbor in apart_neighbors[index]):
                continue
            remaining[group_index] -= size
            assigned_component_groups[index] = group_number
            groups[group_index]["animals"].extend(animals_by_id[animal_id] for animal_id in members)
            candidate = search(position + 1)
            if candidate is not None:
                return candidate
            del groups[group_index]["animals"][-size:]
            del assigned_component_groups[index]
            remaining[group_index] += size

        if possible_animals[position + 1] >= capacity_left:
            return search(position + 1)
        return None

    return search(0), nodes_checked


def allocate_animals(
    *,
    animals: Sequence[Mapping[str, Any]],
    group_sizes: Sequence[int],
    group_names: Sequence[str],
    method: str,
    seed: int,
    age_unit: str,
    selected_sexes: Sequence[str],
    selected_genotypes: Sequence[str],
    balance_priorities: Sequence[str],
    locks: Sequence[Mapping[str, Any]],
    together: Sequence[Mapping[str, Any]],
    apart: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    """Create a seeded allocation and a readable record of its constraints."""
    cleaned = _clean_animals(animals)
    if method not in {"simple_random", "balanced"}:
        raise AllocationValidationError("Choose simple random or balanced allocation.")
    if age_unit not in AGE_UNITS:
        raise AllocationValidationError("Choose an age unit: days, weeks, months, or years.")
    if any(animal.get("source_age_unit") not in (None, age_unit) for animal in cleaned):
        raise AllocationValidationError("The selected age unit does not match one or more input rows.")
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise AllocationValidationError("Enter a whole-number random seed.")
    if abs(seed) > 9_007_199_254_740_991:
        raise AllocationValidationError("Use a seed within the exact integer range supported by this app.")

    if not group_sizes or len(group_sizes) != len(group_names):
        raise AllocationValidationError("Set a size and name for every group.")
    if len(group_sizes) > 20:
        raise AllocationValidationError("Use no more than 20 groups.")
    sizes = []
    for group_number, size in enumerate(group_sizes, start=1):
        if not isinstance(size, int) or isinstance(size, bool) or size < 1:
            raise AllocationValidationError(f"Group {group_number} capacity must be a whole number greater than zero.")
        sizes.append(size)
    if sum(sizes) > len(cleaned):
        raise AllocationValidationError("Group capacities exceed the number of animals in the input.")

    sexes = [str(value).strip() for value in selected_sexes if str(value).strip()]
    genotypes = [str(value).strip() for value in selected_genotypes if str(value).strip()]
    if not sexes or not genotypes:
        raise AllocationValidationError("Select at least one sex and one genotype.")
    if len(set(sexes)) != len(sexes) or len(set(genotypes)) != len(genotypes):
        raise AllocationValidationError("Remove duplicate sex or genotype selections.")
    eligible = [
        animal for animal in cleaned
        if animal["sex"] in sexes and animal["genotype"] in genotypes
    ]
    if not eligible:
        raise AllocationValidationError("No animals match the selected sex and genotype.")
    if sum(sizes) > len(eligible):
        raise AllocationValidationError("Group capacities exceed the number of eligible animals.")

    priorities = list(balance_priorities)
    if method == "balanced":
        if not priorities or len(set(priorities)) != len(priorities) or any(item not in BALANCE_FIELDS for item in priorities):
            raise AllocationValidationError("Choose each balance variable once and set its priority order.")
    else:
        priorities = []

    normalized_names = [str(name).strip() or f"Group {index}" for index, name in enumerate(group_names, start=1)]
    locked, together_pairs, apart_pairs, components = _validated_rules(eligible, sizes, locks, together, apart)
    candidates_to_check = SIMPLE_SEARCH_LIMIT if method == "simple_random" else BALANCED_SEARCH_LIMIT
    rng = random.Random(seed)
    best_groups = None
    best_score: Tuple[float, ...] | None = None
    attempts = 0
    candidates_checked = 0
    search_nodes_checked = 0

    for attempts in range(1, candidates_to_check + 1):
        if together_pairs or apart_pairs:
            groups, nodes = _constrained_candidate(
                eligible=eligible,
                group_sizes=sizes,
                group_names=normalized_names,
                locked=locked,
                components=components,
                apart_pairs=apart_pairs,
                rng=rng,
            )
            search_nodes_checked += nodes
            if groups is None:
                continue
            assignment = {
                animal["animal_id"]: group["group_number"]
                for group in groups
                for animal in group["animals"]
            }
        else:
            groups = [
                {"group_number": index, "group_name": name, "capacity": sizes[index - 1], "animals": []}
                for index, name in enumerate(normalized_names, start=1)
            ]
            assignment = {}
            for animal_id, group_number in locked.items():
                assignment[animal_id] = group_number
                groups[group_number - 1]["animals"].append(
                    next(animal for animal in eligible if animal["animal_id"] == animal_id)
                )

            remaining_by_group = [sizes[index] - len(groups[index]["animals"]) for index in range(len(sizes))]
            remaining_animals = [animal for animal in eligible if animal["animal_id"] not in assignment]
            rng.shuffle(remaining_animals)
            cursor = 0
            for group_index, remaining_count in enumerate(remaining_by_group):
                for animal in remaining_animals[cursor:cursor + remaining_count]:
                    groups[group_index]["animals"].append(animal)
                    assignment[animal["animal_id"]] = group_index + 1
                cursor += remaining_count
        assigned_ids = set(assignment)

        valid = True
        for first, second in together_pairs:
            if (first in assigned_ids) != (second in assigned_ids):
                valid = False
                break
            if first in assigned_ids and assignment[first] != assignment[second]:
                valid = False
                break
        if not valid:
            continue
        if any(
            first in assigned_ids and second in assigned_ids and assignment[first] == assignment[second]
            for first, second in apart_pairs
        ):
            continue

        candidates_checked += 1
        if method == "simple_random":
            best_groups = groups
            best_score = ()
            break
        current_score = _score(eligible, groups, priorities)
        if best_score is None or current_score < best_score:
            best_groups = groups
            best_score = current_score

    excluded = [animal for animal in cleaned if animal not in eligible]
    if best_groups is None:
        return {
            "success": False,
            "allocation_found": False,
            "search_exhausted": True,
            "algorithm_version": ALGORITHM_VERSION,
            "method": method,
            "seed": seed,
            "age_unit": age_unit,
            "selected_sexes": sexes,
            "selected_genotypes": genotypes,
            "group_sizes": sizes,
            "group_names": normalized_names,
            "balance_priorities": priorities,
            "locks": [{"animal_id": animal_id, "group_number": group} for animal_id, group in sorted(locked.items())],
            "together": [{"animal_id_a": first, "animal_id_b": second} for first, second in together_pairs],
            "apart": [{"animal_id_a": first, "animal_id_b": second} for first, second in apart_pairs],
            "search_attempts": attempts,
            "valid_candidates_checked": candidates_checked,
            "search_nodes_checked": search_nodes_checked,
            "groups": [],
            "excluded_animals": excluded,
            "unassigned_animals": eligible,
            "balance": _allocation_summary(eligible, [], priorities),
            "limits": [
                f"No valid allocation was found in {attempts} seeded search attempts and {search_nodes_checked} constraint checks. This does not prove that no valid allocation exists."
            ],
        }

    assigned_ids = {
        animal["animal_id"] for group in best_groups for animal in group["animals"]
    }
    for group in best_groups:
        group["count"] = len(group["animals"])
    unassigned = [animal for animal in eligible if animal["animal_id"] not in assigned_ids]
    balance = _allocation_summary(eligible, best_groups, priorities)
    balance_scores = dict(zip(priorities, best_score or ()))
    if method == "simple_random":
        limits = ["Simple random assignment does not optimize balance."]
    else:
        limits = [
            f"Balanced allocation compared {candidates_checked} valid seeded candidates and may not be globally optimal.",
            "Balance only reflects the selected variables and their displayed priority order.",
        ]
    if unassigned:
        limits.append("Some eligible animals remain unassigned because the group capacities do not cover the full eligible pool.")
    if excluded:
        limits.append("Animals outside the selected sex or genotype remain listed as excluded from the eligible pool.")

    return {
        "success": True,
        "allocation_found": True,
        "search_exhausted": False,
        "algorithm_version": ALGORITHM_VERSION,
        "method": method,
        "seed": seed,
        "age_unit": age_unit,
        "selected_sexes": sexes,
        "selected_genotypes": genotypes,
        "group_sizes": sizes,
        "group_names": normalized_names,
        "balance_priorities": priorities,
        "locks": [{"animal_id": animal_id, "group_number": group} for animal_id, group in sorted(locked.items())],
        "together": [{"animal_id_a": first, "animal_id_b": second} for first, second in together_pairs],
        "apart": [{"animal_id_a": first, "animal_id_b": second} for first, second in apart_pairs],
        "search_attempts": attempts,
        "valid_candidates_checked": candidates_checked,
        "search_nodes_checked": search_nodes_checked,
        "balance_scores": balance_scores,
        "groups": best_groups,
        "excluded_animals": excluded,
        "unassigned_animals": unassigned,
        "balance": balance,
        "limits": limits,
    }


def create_export_workbook(
    *,
    input_animals: Sequence[Mapping[str, Any]],
    allocation: Mapping[str, Any],
    run_name: str,
) -> bytes:
    """Serialize the reviewed allocation without recalculating its groups."""
    import io

    import pandas as pd

    if allocation.get("allocation_found") is not True or allocation.get("success") is not True:
        raise AllocationValidationError("Generate and review a valid allocation before exporting.")
    cleaned_inputs = _clean_animals(input_animals)

    def require_list(name: str) -> list:
        value = allocation.get(name)
        if not isinstance(value, list):
            raise AllocationValidationError(f"The reviewed allocation has invalid {name}.")
        return value

    method = allocation.get("method")
    age_unit = allocation.get("age_unit")
    seed = allocation.get("seed")
    algorithm_version = allocation.get("algorithm_version")
    if method not in {"simple_random", "balanced"}:
        raise AllocationValidationError("The reviewed allocation has an invalid method.")
    if age_unit not in AGE_UNITS:
        raise AllocationValidationError("The reviewed allocation has an invalid age unit.")
    if not isinstance(seed, int) or isinstance(seed, bool) or abs(seed) > 9_007_199_254_740_991:
        raise AllocationValidationError("The reviewed allocation has an invalid seed.")
    if algorithm_version != ALGORITHM_VERSION:
        raise AllocationValidationError("The reviewed allocation uses an unsupported algorithm version.")

    selected_sexes = require_list("selected_sexes")
    selected_genotypes = require_list("selected_genotypes")
    group_sizes = require_list("group_sizes")
    group_names = require_list("group_names")
    balance_priorities = require_list("balance_priorities")
    raw_locks = require_list("locks")
    raw_together = require_list("together")
    raw_apart = require_list("apart")
    groups = require_list("groups")
    unassigned = require_list("unassigned_animals")
    excluded = require_list("excluded_animals")
    limits = require_list("limits")
    if (not selected_sexes or not selected_genotypes
            or any(not isinstance(value, str) or not value.strip() for value in selected_sexes + selected_genotypes)
            or len(set(selected_sexes)) != len(selected_sexes)
            or len(set(selected_genotypes)) != len(selected_genotypes)):
        raise AllocationValidationError("The reviewed allocation is missing its selected animals.")
    if method == "balanced":
        if (not balance_priorities
                or any(not isinstance(field, str) for field in balance_priorities)
                or len(set(balance_priorities)) != len(balance_priorities)
                or any(field not in BALANCE_FIELDS for field in balance_priorities)):
            raise AllocationValidationError("The reviewed allocation has invalid balance priorities.")
    elif balance_priorities:
        raise AllocationValidationError("A simple random allocation must not contain balance priorities.")
    if (not group_sizes or len(group_sizes) != len(group_names) or len(groups) != len(group_sizes)
            or any(not isinstance(size, int) or isinstance(size, bool) or size < 1 for size in group_sizes)
            or any(not isinstance(name, str) or not name.strip() for name in group_names)):
        raise AllocationValidationError("The reviewed allocation has invalid group names or capacities.")
    if (not isinstance(allocation.get("search_attempts"), int)
            or isinstance(allocation.get("search_attempts"), bool)
            or allocation["search_attempts"] < 1
            or not isinstance(allocation.get("valid_candidates_checked"), int)
            or isinstance(allocation.get("valid_candidates_checked"), bool)
            or allocation["valid_candidates_checked"] < 1
            or not isinstance(allocation.get("search_nodes_checked"), int)
            or isinstance(allocation.get("search_nodes_checked"), bool)
            or allocation["search_nodes_checked"] < 0
            or any(not isinstance(limit, str) for limit in limits)):
        raise AllocationValidationError("The reviewed allocation has invalid search details.")
    for lock in raw_locks:
        if (not isinstance(lock, Mapping) or not isinstance(lock.get("animal_id"), str)
                or not isinstance(lock.get("group_number"), int) or isinstance(lock.get("group_number"), bool)):
            raise AllocationValidationError("The reviewed allocation has an invalid lock.")
    for rule in raw_together + raw_apart:
        if (not isinstance(rule, Mapping) or not isinstance(rule.get("animal_id_a"), str)
                or not isinstance(rule.get("animal_id_b"), str)):
            raise AllocationValidationError("The reviewed allocation has an invalid together/apart rule.")

    input_by_id = {animal["animal_id"].casefold(): animal for animal in cleaned_inputs}
    eligible = [animal for animal in cleaned_inputs
                if animal["sex"] in selected_sexes and animal["genotype"] in selected_genotypes]
    eligible_by_id = {animal["animal_id"].casefold(): animal for animal in eligible}

    def normalized_record(raw: Any, *, label: str) -> Dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise AllocationValidationError(f"The reviewed {label} contains an invalid animal record.")
        animal_id = str(raw.get("animal_id", "")).strip()
        input_animal = input_by_id.get(animal_id.casefold())
        if input_animal is None:
            raise AllocationValidationError(f"The reviewed {label} refers to unknown animal {animal_id or '(blank)'}.")
        try:
            age = float(raw.get("age"))
        except (TypeError, ValueError):
            raise AllocationValidationError(f"The reviewed record for {animal_id} has an invalid age.") from None
        record = {**raw, "animal_id": animal_id, "genotype": str(raw.get("genotype", "")).strip(),
                  "sex": str(raw.get("sex", "")).strip(), "age": age}
        if record != input_animal:
            raise AllocationValidationError(f"The reviewed record for {animal_id} no longer matches the input data.")
        return record

    assigned: Dict[str, int] = {}
    export_groups = []
    for index, group in enumerate(groups, start=1):
        if (not isinstance(group, Mapping) or not isinstance(group.get("group_number"), int)
                or isinstance(group.get("group_number"), bool) or group.get("group_number") != index):
            raise AllocationValidationError("The reviewed allocation has invalid group numbering.")
        name = group.get("group_name")
        capacity = group.get("capacity")
        members = group.get("animals")
        if (name != group_names[index - 1] or not isinstance(capacity, int) or isinstance(capacity, bool)
                or capacity != group_sizes[index - 1]
                or not isinstance(members, list) or len(members) != capacity
                or not isinstance(group.get("count"), int) or isinstance(group.get("count"), bool)
                or group.get("count") != len(members)):
            raise AllocationValidationError("The reviewed allocation no longer matches its group capacity or name.")
        normalized_members = []
        for raw in members:
            animal = normalized_record(raw, label=f"Group {index}")
            animal_id = animal["animal_id"]
            normalized_id = animal_id.casefold()
            if normalized_id in assigned:
                raise AllocationValidationError(f"Animal {animal_id} appears in more than one assignment.")
            if normalized_id not in eligible_by_id:
                raise AllocationValidationError(f"Animal {animal_id} is assigned outside the selected pool.")
            assigned[normalized_id] = index
            normalized_members.append(animal)
        export_groups.append({"group_number": index, "group_name": name, "capacity": capacity,
                              "animals": normalized_members})

    normalized_unassigned = [normalized_record(raw, label="unassigned list") for raw in unassigned]
    normalized_excluded = [normalized_record(raw, label="excluded list") for raw in excluded]
    unassigned_ids = [animal["animal_id"].casefold() for animal in normalized_unassigned]
    excluded_ids = [animal["animal_id"].casefold() for animal in normalized_excluded]
    allocation_ids = list(assigned) + unassigned_ids + excluded_ids
    expected_eligible = set(eligible_by_id)
    expected_excluded = set(input_by_id) - expected_eligible
    if (len(allocation_ids) != len(set(allocation_ids)) or set(assigned) | set(unassigned_ids) != expected_eligible
            or set(excluded_ids) != expected_excluded or set(allocation_ids) != set(input_by_id)):
        raise AllocationValidationError("The reviewed allocation must account for every input animal exactly once.")

    locks, together_pairs, apart_pairs, _ = _validated_rules(
        eligible, group_sizes, raw_locks, raw_together, raw_apart
    )
    for animal_id, group_number in locks.items():
        if assigned.get(animal_id.casefold()) != group_number:
            raise AllocationValidationError(f"Locked animal {animal_id} is not assigned to its locked group.")
    for first, second in together_pairs:
        first_group = assigned.get(first.casefold())
        second_group = assigned.get(second.casefold())
        if (first_group is None) != (second_group is None) or (first_group is not None and first_group != second_group):
            raise AllocationValidationError(f"The reviewed allocation violates the together rule for {first} and {second}.")
    for first, second in apart_pairs:
        first_group = assigned.get(first.casefold())
        second_group = assigned.get(second.casefold())
        if first_group is not None and first_group == second_group:
            raise AllocationValidationError(f"The reviewed allocation violates the apart rule for {first} and {second}.")

    if any(animal.get("source_age_unit") not in (None, age_unit) for animal in cleaned_inputs):
        raise AllocationValidationError("The reviewed allocation age unit no longer matches the input data.")
    balance = _allocation_summary(eligible, export_groups, balance_priorities)
    if allocation.get("balance") != balance:
        raise AllocationValidationError("The reviewed balance summary no longer matches the assignments.")
    if method == "balanced":
        score = _score(eligible, export_groups, balance_priorities)
        if allocation.get("balance_scores") != dict(zip(balance_priorities, score)):
            raise AllocationValidationError("The reviewed balance scores no longer match the assignments.")
    elif allocation.get("balance_scores") not in ({}, None):
        raise AllocationValidationError("The simple random allocation has unexpected balance scores.")

    export_allocation = {**allocation, "groups": export_groups, "unassigned_animals": normalized_unassigned,
                         "excluded_animals": normalized_excluded, "balance": balance}

    output = io.BytesIO()
    metadata = {
        "Run name": run_name.strip() or "Animal allocation",
        "Method": export_allocation.get("method"),
        "Algorithm version": export_allocation.get("algorithm_version"),
        "Seed": export_allocation.get("seed"),
        "Age unit": export_allocation.get("age_unit"),
        "Selected sexes": ", ".join(export_allocation.get("selected_sexes", [])),
        "Selected genotypes": ", ".join(export_allocation.get("selected_genotypes", [])),
        "Group capacities": str(dict(zip(export_allocation.get("group_names", []), export_allocation.get("group_sizes", [])))),
        "Balance priority order": " → ".join(export_allocation.get("balance_priorities", [])) or "None",
        "Balance scores": str(export_allocation.get("balance_scores", {})),
        "Search attempts": export_allocation.get("search_attempts"),
        "Locks": str(export_allocation.get("locks", [])),
        "Together rules": str(export_allocation.get("together", [])),
        "Apart rules": str(export_allocation.get("apart", [])),
        "Valid candidates checked": export_allocation.get("valid_candidates_checked"),
        "Constraint checks": export_allocation.get("search_nodes_checked"),
        "Limits": " ".join(limits),
    }
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame([{"Setting": key, "Value": value} for key, value in metadata.items()]).to_excel(
            writer, sheet_name="Method and balance", index=False
        )
        for group in export_allocation.get("groups", []):
            pd.DataFrame(group.get("animals", [])).to_excel(
                writer, sheet_name=f"Group {group['group_number']}", index=False
            )
        pd.DataFrame(export_allocation.get("unassigned_animals", [])).to_excel(
            writer, sheet_name="Unassigned", index=False
        )
        pd.DataFrame(export_allocation.get("excluded_animals", [])).to_excel(
            writer, sheet_name="Excluded", index=False
        )
        pd.DataFrame(input_animals).to_excel(writer, sheet_name="Input animals", index=False)
        balance = export_allocation.get("balance", {})
        rows = []
        for category in ("sex", "genotype"):
            for value, stats in balance.get("eligible_pool", {}).get(category, {}).items():
                rows.append({"Scope": "Eligible pool", "Group": "All eligible", "Measure": category, "Value": value,
                             "Count": stats["count"], "Proportion": stats["proportion"]})
        for group in balance.get("groups", []):
            for category in ("sex", "genotype"):
                for value, stats in group.get(category, {}).items():
                    rows.append({"Scope": "Assigned group", "Group": group["group_name"], "Measure": category,
                                 "Value": value, "Count": stats["count"], "Proportion": stats["proportion"]})
            age = group.get("age", {})
            rows.append({"Scope": "Assigned group", "Group": group["group_name"], "Measure": f"Age ({allocation.get('age_unit')})",
                         "Value": "Distribution", "Count": age.get("n"), "Mean": age.get("mean"),
                         "SD": age.get("sd"), "Minimum": age.get("minimum"), "Maximum": age.get("maximum")})
        pool_age = balance.get("eligible_pool", {}).get("age", {})
        rows.append({"Scope": "Eligible pool", "Group": "All eligible", "Measure": f"Age ({allocation.get('age_unit')})",
                     "Value": "Distribution", "Count": pool_age.get("n"), "Mean": pool_age.get("mean"),
                     "SD": pool_age.get("sd"), "Minimum": pool_age.get("minimum"), "Maximum": pool_age.get("maximum")})
        pd.DataFrame(rows).to_excel(writer, sheet_name="Balance details", index=False)
    output.seek(0)
    return output.getvalue()
