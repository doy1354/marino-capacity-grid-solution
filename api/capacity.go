package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	dateLayout = "2006-01-02"

	// maxWeeks bounds a single request. Production keeps up to two years of
	// history; 106 weeks lets a manager look at all of it in one request
	// (two years plus partial weeks at either end) without unbounded scans.
	maxWeeks = 106

	defaultPeopleLimit = 100
	maxPeopleLimit     = 500
)

// capacityResponse is the grid's view model: one shared list of weeks, and per
// person one cell per week, aligned by index with Weeks.
//
// Capacity is returned per week, not just once per person, on purpose: today
// it is always weekly_hours, but time off, holidays or contract changes will
// make it vary by week, and the client should not have to learn that rule.
type capacityResponse struct {
	From   string           `json:"from"` // Monday of the first week
	To     string           `json:"to"`   // Sunday of the last week
	Weeks  []string         `json:"weeks"`
	People []personCapacity `json:"people"`
	Total  int              `json:"total"` // people matching the filter, for paging
	Offset int              `json:"offset"`
	Limit  int              `json:"limit"`
}

type personCapacity struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	WeeklyHours float64    `json:"weekly_hours"`
	Weeks       []weekCell `json:"weeks"`
}

type weekCell struct {
	Allocated float64 `json:"allocated"`
	Capacity  float64 `json:"capacity"`
}

type capacityQuery struct {
	from, to  time.Time // from is a Monday, to is the Sunday ending the last week
	offset    int
	limit     int
	personIDs []int // optional filter; nil means everyone
}

// capacitySQL returns one row per (person, week) for a page of people.
//
// Allocation rules, decided here and only here:
//   - Only Monday–Friday count. Assignments in the data routinely end on a
//     weekend; counting those days would put a full-time person at 56h.
//   - An assignment contributes hours_per_day × the number of its weekdays that
//     fall inside the week. Weeks are Monday-based, so the weekday overlap is
//     the date overlap with [Monday, Friday].
//   - Every assignment row is summed. The seed stores each logical assignment
//     as several fragment rows whose hours_per_day add up to the real figure,
//     so de-duplicating rows would under-count.
//
// People with no allocation still get a row per week (allocated = 0).
const capacitySQL = `
WITH page AS (
	SELECT id, name, weekly_hours
	FROM people
	WHERE ($3::int[] IS NULL OR id = ANY($3::int[]))
	ORDER BY name, id
	LIMIT $4 OFFSET $5
),
weeks AS (
	SELECT generate_series($1::date, $2::date, interval '7 days')::date AS week_start
),
allocated AS (
	SELECT a.person_id,
	       w.week_start,
	       sum(a.hours_per_day * (least(a.end_date, w.week_start + 4)
	                            - greatest(a.start_date, w.week_start) + 1)) AS hours
	FROM page p
	JOIN assignments a ON a.person_id = p.id
	                  -- Prune to the range before fanning out to weeks; lets
	                  -- the (start_date, end_date) index do the work.
	                  AND a.start_date <= $2::date + 4
	                  AND a.end_date   >= $1::date
	JOIN weeks w ON a.start_date <= w.week_start + 4
	            AND a.end_date   >= w.week_start
	GROUP BY a.person_id, w.week_start
)
SELECT p.id,
       p.name,
       p.weekly_hours::float8,
       w.week_start,
       coalesce(al.hours, 0)::float8 AS allocated,
       p.weekly_hours::float8        AS capacity
FROM page p
CROSS JOIN weeks w
LEFT JOIN allocated al ON al.person_id = p.id AND al.week_start = w.week_start
ORDER BY p.name, p.id, w.week_start`

const capacityCountSQL = `
SELECT count(*) FROM people WHERE ($1::int[] IS NULL OR id = ANY($1::int[]))`

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Optional: offset, limit (people paging), ids=1,2,3 (only these people — the
// grid uses it to refresh a single row after an edit).
//
// from and to are widened to whole Monday–Sunday weeks, so every cell is a
// complete week and a cell never changes meaning depending on the range.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	q, err := parseCapacityQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	lastMonday := q.to.AddDate(0, 0, -6)
	var ids any // nil → NULL → no filter
	if q.personIDs != nil {
		ids = q.personIDs
	}

	var total int
	if err := s.db.QueryRow(r.Context(), capacityCountSQL, ids).Scan(&total); err != nil {
		log.Printf("capacity count: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}

	rows, err := s.db.Query(r.Context(), capacitySQL,
		q.from, lastMonday, ids, q.limit, q.offset)
	if err != nil {
		log.Printf("capacity query: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}
	defer rows.Close()

	resp := capacityResponse{
		From:   q.from.Format(dateLayout),
		To:     q.to.Format(dateLayout),
		Weeks:  weekStarts(q.from, lastMonday),
		People: []personCapacity{},
		Total:  total,
		Offset: q.offset,
		Limit:  q.limit,
	}

	for rows.Next() {
		var (
			id                          int
			name                        string
			weekly, allocated, capacity float64
			weekStart                   time.Time
		)
		if err := rows.Scan(&id, &name, &weekly, &weekStart, &allocated, &capacity); err != nil {
			log.Printf("capacity scan: %v", err)
			writeError(w, http.StatusInternalServerError, "could not load capacity")
			return
		}
		// Rows arrive ordered by person then week, so a new id starts a new row.
		if n := len(resp.People); n == 0 || resp.People[n-1].ID != id {
			resp.People = append(resp.People, personCapacity{
				ID: id, Name: name, WeeklyHours: weekly,
				Weeks: make([]weekCell, 0, len(resp.Weeks)),
			})
		}
		p := &resp.People[len(resp.People)-1]
		p.Weeks = append(p.Weeks, weekCell{Allocated: allocated, Capacity: capacity})
	}
	if err := rows.Err(); err != nil {
		log.Printf("capacity rows: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func parseCapacityQuery(r *http.Request) (capacityQuery, error) {
	v := r.URL.Query()
	from, err := parseDate(v.Get("from"), "from")
	if err != nil {
		return capacityQuery{}, err
	}
	to, err := parseDate(v.Get("to"), "to")
	if err != nil {
		return capacityQuery{}, err
	}
	if to.Before(from) {
		return capacityQuery{}, errors.New("to must not be before from")
	}

	q := capacityQuery{from: weekStart(from), to: weekStart(to).AddDate(0, 0, 6)}
	if weeks := int(q.to.Sub(q.from).Hours()/24+1) / 7; weeks > maxWeeks {
		return capacityQuery{}, fmt.Errorf("range covers %d weeks; at most %d per request", weeks, maxWeeks)
	}

	if q.offset, err = parseIntParam(v.Get("offset"), 0, 0, 1<<31-1, "offset"); err != nil {
		return capacityQuery{}, err
	}
	if q.limit, err = parseIntParam(v.Get("limit"), defaultPeopleLimit, 1, maxPeopleLimit, "limit"); err != nil {
		return capacityQuery{}, err
	}

	if raw := v.Get("ids"); raw != "" {
		for _, part := range strings.Split(raw, ",") {
			id, err := strconv.Atoi(strings.TrimSpace(part))
			if err != nil || id <= 0 {
				return capacityQuery{}, fmt.Errorf("ids: %q is not a person id", part)
			}
			q.personIDs = append(q.personIDs, id)
		}
	}
	return q, nil
}

func parseDate(s, name string) (time.Time, error) {
	if s == "" {
		return time.Time{}, fmt.Errorf("%s is required (YYYY-MM-DD)", name)
	}
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s: %q is not a date (YYYY-MM-DD)", name, s)
	}
	return t, nil
}

func parseIntParam(s string, def, min, max int, name string) (int, error) {
	if s == "" {
		return def, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < min || n > max {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", name, min, max)
	}
	return n, nil
}

// weekStart returns the Monday on or before t. Dates are calendar dates (UTC
// midnight from time.Parse), so there is no time zone to get wrong here.
func weekStart(t time.Time) time.Time {
	offset := (int(t.Weekday()) + 6) % 7 // Monday → 0 … Sunday → 6
	return t.AddDate(0, 0, -offset)
}

func weekStarts(firstMonday, lastMonday time.Time) []string {
	var out []string
	for d := firstMonday; !d.After(lastMonday); d = d.AddDate(0, 0, 7) {
		out = append(out, d.Format(dateLayout))
	}
	return out
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
