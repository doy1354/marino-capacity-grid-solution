package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// maxWeeklyHours is the hours in a week. Anything above is a typo, not a contract.
const maxWeeklyHours = 168

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weekly_hours"`
}

type updatePersonRequest struct {
	// Pointer so a missing field is an error rather than a silent zero.
	WeeklyHours *float64 `json:"weekly_hours"`
}

// handleUpdatePerson serves PATCH /api/people/{id} with {"weekly_hours": 32}.
//
// It returns the updated person. It deliberately does not return capacity
// cells: those depend on the range the client is looking at, so the grid asks
// GET /api/capacity?ids={id} for its current range, and the allocation rules
// stay in one place.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid person id")
		return
	}

	hours, err := decodeWeeklyHours(http.MaxBytesReader(w, r.Body, 1<<12))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var p person
	err = s.db.QueryRow(r.Context(),
		`UPDATE people SET weekly_hours = $2 WHERE id = $1
		 RETURNING id, name, weekly_hours::float8`,
		id, hours,
	).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "person not found")
		return
	}
	if err != nil {
		log.Printf("update person %d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "could not save weekly hours")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

func decodeWeeklyHours(body io.Reader) (float64, error) {
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	var req updatePersonRequest
	if err := dec.Decode(&req); err != nil {
		return 0, fmt.Errorf("body must be JSON like {\"weekly_hours\": 32}")
	}
	if req.WeeklyHours == nil {
		return 0, errors.New("weekly_hours is required")
	}
	h := *req.WeeklyHours
	if math.IsNaN(h) || h < 0 || h > maxWeeklyHours {
		return 0, fmt.Errorf("weekly_hours must be between 0 and %d", maxWeeklyHours)
	}
	return h, nil
}
