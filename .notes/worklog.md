# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## Data findings (before writing code)

- `hours_per_day` values are 0.125–1.0, which look wrong for "hours". Looking closer, each logical
  assignment is stored as 15 rows with the same person/project/dates: 14 × h/16 plus 1 × h/8, which sum to
  h ∈ {2, 4, 6, 8}. The previous (generated) seed in git history had the same first ten assignments at 8/8/4/6/5…
  hours/day, which matches. **Decision: sum every row, never de-duplicate.** A `DISTINCT` would cut allocation ~8×.
- ~47k of 126k assignments end on a Saturday or Sunday, none start on one. Counting weekend days would put Ana at
  56h in a 40h week. **Decision: only Mon–Fri count.** No holiday calendar exists, so none is applied.
- Eli Nakamura has `weekly_hours = 0` but 20h of work in the week of 5 Jan. Shown as over-allocated (+20h), not as
  a divide-by-zero or "n/a".
- Assignments cross week boundaries (e.g. Bo, Fri 9 → Mon 12 Jan): split per week by weekday overlap.
- No team/manager concept in the schema: "anyone on their team" is treated as everyone, paged.

## Decisions

- Weeks are ISO (Mon–Sun). `from`/`to` snap outward to whole weeks so a cell always means one full week, whatever range
  is asked for. Max 106 weeks per request (two years of history plus partial weeks at the edges); 400 beyond that.
- Response is one `weeks[]` header plus per-person `weeks[]` cells aligned by index — compact for 3k people × 104
  weeks. Capacity is returned per cell even though today it is constant per person, so per-week capacity (time off,
  contract changes) can arrive later without a client change.
- All allocation maths in one SQL query (`capacitySQL`): page of people → weeks via generate_series → assignments
  joined on overlap. People with no work still get zero cells.
- People paged with offset/limit (100 per page, "load more"), ordered by name, id. Offset is fine at a few thousand
  rows; keyset would be the next step.
- After an edit: **pessimistic + targeted refetch**. PATCH returns the person; the grid then calls
  `GET /api/capacity?ids={id}` for the range on screen and swaps that one row in. Not optimistic because the numbers
  are what the manager is deciding on; not a full refetch because that's up to 100 rows × N weeks for one change;
  not a client-side patch because that would copy the capacity rule into the browser.
- Failed save: editor stays open with the draft, "Not saved: <reason>", Retry/Cancel; grid numbers untouched.
  Save OK but row refresh failed: new weekly hours shown, row dimmed with "numbers may be out of date — refresh row".
- Range responses are checked against the current range before applying, so a slow response for a range the manager
  already left is dropped. A save that lands while a full range load is in flight re-fetches that row afterwards.
- Range is mirrored in the URL (`?from=&to=`). Default: current week + 5 weeks (managers look ahead).

## Verification

- Hand-checked the first five people over 29 Dec–18 Jan against the assignment rows: Ana 40/0/30, Bo 0/32/8,
  Cem 0/4/12, Dee 0/45/40 (over), Eli 0/20/0 against 0h.
- Cross-checked **all 41,500 cells** (500 people × 83 weeks) against an independent day-by-day expansion
  (`generate_series` per assignment day, weekdays only): 0 mismatches. 1,626 cells are over capacity.
- Timing on the seed: 2 years × 500 people 0.37s / 1.3MB; 9 weeks × 100 people ~20ms. The range pre-filter on
  assignments took the 9-week query from ~220ms to ~20ms (Postgres JIT was kicking in on a bad generate_series
  row estimate).
- Drove the UI in headless Chrome: navigation, edit + save, forced 500 on PATCH (error + retry), forced network
  failure on range load (banner, previous data kept).
- Go unit tests for range parsing/validation; Vitest for date maths, cell status, and save success/failure.
- Caveat: verified against a local Postgres 16 + Go 1.24 (no Docker daemon in my environment). Needs a final
  `make up` check in the real Compose setup.

## Deferred / not done

- Search/filter by name and "only over-allocated" server-side; virtualised rows for thousands of people.
- Composite index `assignments (person_id, start_date, end_date)` — schema is fixed input here.
- `weekly_hours` has no history: editing it rewrites capacity for past weeks too. Needs effective-dated capacity.
- No auth, no concurrency control on PATCH (last write wins), no holidays/time off.
- A weekend-only assignment counts 0h — arguably right, but worth confirming with product.
