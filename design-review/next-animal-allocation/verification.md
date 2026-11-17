# Reviewed animal allocation

Simple seeded random allocation and balanced allocation use explicit group capacities and age units. Together-components are placed as a unit. Locks and apart rules are checked before scoring. The allocation review shows eligible, assigned, unassigned and excluded animals, plus age and category summaries.

Fourteen Python tests passed, including malformed input, conflicting rules, seed repeatability, exact export and a feasible locked five-animal component in a 20-animal pool. TypeScript, lint and Vite production build passed in a byte-verified QA copy. The hidden browser confirmed the WT-only selection reopened with six eligible and assigned animals and eight excluded animals. The actual workbook matched the reviewed membership, exclusion list, seed and algorithm. The API used the authoritative Next source and a task-only pinned Python environment. The Playwright repository runner timed out while opening its browser page; the reviewed workflow passed through the managed browser.

[Filtered allocation review](filtered-review.png) · [Review controls](review-bottom.png)
