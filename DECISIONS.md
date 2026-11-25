# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

- **Do weekends count?** About 47k of the 126k assignments end on a Saturday or Sunday. I count Mon–Fri only.
  Otherwise a full-timer on an 8h/day Mon–Sun assignment shows 56h in a 40h week. No holiday calendar exists,
  so none is applied.
- **What a "week" is when `from`/`to` don't line up with weeks.** Ranges widen to whole Mon–Sun weeks, so a cell
  always means one full week, whatever range is asked for.
- **Who "their team" is.** The schema has no team or manager, so it's everyone, 100 people per page, sorted by name.
- **How big a request can be.** Up to 106 weeks (two years plus partial weeks at the edges). Beyond that, the API
  returns 400. Production has thousands of people, so the grid pages people instead of loading them all.
- **How the grid stays correct after an edit.** It waits for the server instead of updating first. After the PATCH
  succeeds, it re-fetches only that person's row for the range on screen (`/api/capacity?ids=`). I didn't go
  optimistic because these numbers drive staffing decisions. I didn't patch the row in the browser because that
  would copy the capacity rule into the client. I didn't refetch everything because that's 100+ rows for one change.
- **What a failed save looks like.** The editor stays open with what was typed, "Not saved: reason" and a Retry
  button. The grid numbers don't change. If the save succeeds but the row refresh fails, the row is dimmed with a
  "refresh row" link.

## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

- **`hours_per_day` values of 0.125–1.0.** Each assignment is stored as 15 rows (14 × h/16 + 1 × h/8) that add up
  to 2/4/6/8 h/day. The older seed in git history confirms this. I sum every row. Removing duplicates would
  under-count about 8×.
- **Eli Nakamura has 0 weekly hours but 20h of work** in the week of 5 Jan. He shows as over (+20h), not as a
  divide-by-zero.
- **`weekly_hours` has no history.** Editing it rewrites capacity for past weeks too. I left this as is; it needs
  capacity that changes by date.
- Checked all 41,500 cells (500 people × 83 weeks) against a separate day-by-day calculation: 0 mismatches.
  Hand-checked Ana, Bo, Cem, Dee and Eli for 29 Dec–18 Jan.

## What did the AI get wrong that you caught?

One concrete example. Every real session has one.

- The first capacity query didn't filter assignments by date before joining to weeks. A 9-week view took
  ~220 ms because every assignment for every person was expanded. Adding the date range filter brought it to ~20 ms.
- One commit (the grid) doesn't build on its own; it imports the editor added in the next commit.

## What would you do differently with a week?

- Weekly hours that change by date, plus time off and holidays, so capacity can vary week to week (the API already
  returns capacity per week for this).
- Server-side name search and an "only over-allocated" filter; render only visible rows for thousands of people.
- A composite index on `assignments (person_id, start_date, end_date)`; keyset paging instead of offset.
- Protect against two managers editing the same person (version check on PATCH), and add auth.

