package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseCapacityQuerySnapsToWholeWeeks(t *testing.T) {
	// Wednesday → Tuesday becomes Monday → Sunday.
	r := httptest.NewRequest("GET", "/api/capacity?from=2025-12-31&to=2026-01-13", nil)
	q, err := parseCapacityQuery(r)
	if err != nil {
		t.Fatal(err)
	}
	if got := q.from.Format(dateLayout); got != "2025-12-29" {
		t.Errorf("from = %s, want 2025-12-29", got)
	}
	if got := q.to.Format(dateLayout); got != "2026-01-18" {
		t.Errorf("to = %s, want 2026-01-18", got)
	}
	weeks := weekStarts(q.from, q.to.AddDate(0, 0, -6))
	if want := "2025-12-29,2026-01-05,2026-01-12"; strings.Join(weeks, ",") != want {
		t.Errorf("weeks = %v, want %s", weeks, want)
	}
}

func TestWeekStartSundayBelongsToPreviousWeek(t *testing.T) {
	d, _ := parseDate("2026-01-04", "d") // Sunday
	if got := weekStart(d).Format(dateLayout); got != "2025-12-29" {
		t.Errorf("weekStart(Sunday) = %s, want 2025-12-29", got)
	}
}

func TestParseCapacityQueryRejects(t *testing.T) {
	for _, qs := range []string{
		"",                                      // missing
		"from=2026-01-05",                       // missing to
		"from=2026-01-12&to=2026-01-05",         // reversed
		"from=2026-13-01&to=2026-12-01",         // bad date
		"from=2024-01-01&to=2026-12-31",         // too long
		"from=2026-01-05&to=2026-01-09&limit=0", // bad limit
		"from=2026-01-05&to=2026-01-09&ids=1,x", // bad id
	} {
		r := httptest.NewRequest("GET", "/api/capacity?"+qs, nil)
		if _, err := parseCapacityQuery(r); err == nil {
			t.Errorf("%q: expected an error", qs)
		}
	}
}

func TestDecodeWeeklyHours(t *testing.T) {
	ok := map[string]float64{`{"weekly_hours": 32}`: 32, `{"weekly_hours": 0}`: 0, `{"weekly_hours": 37.5}`: 37.5}
	for body, want := range ok {
		got, err := decodeWeeklyHours(strings.NewReader(body))
		if err != nil || got != want {
			t.Errorf("%s: got %v, %v; want %v", body, got, err, want)
		}
	}
	for _, body := range []string{`{}`, `{"weekly_hours": -1}`, `{"weekly_hours": 200}`, `{"weekly_hours": "40"}`, `{"hours": 40}`, `nope`} {
		if _, err := decodeWeeklyHours(strings.NewReader(body)); err == nil {
			t.Errorf("%s: expected an error", body)
		}
	}
}
