package api

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// A learner's day: the goal, the streak and what is left to do, and the
// console's view of who comes back.

// logActivity counts a piece of learning toward the day. A failure here is
// logged, never the learner's problem: what they did is already kept.
func (s *Server) logActivity(ctx context.Context, user uuid.UUID, kind string) {
	if _, err := s.Store.LogActivity(context.WithoutCancel(ctx), user, kind, time.Now()); err != nil {
		s.Log.Warn("cannot record learning", "kind", kind, "user", user, "error", err)
	}
}

func (s *Server) handleToday(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	today, err := s.Store.Today(r.Context(), u.ID, time.Now())
	if err != nil {
		s.failErr(w, err, "today")
		return
	}
	if today.NextClip != nil {
		today.NextClip.PosterURL = s.posterURL(r.Context(), *today.NextClip)
	}
	writeJSON(w, http.StatusOK, today)
}

func (s *Server) handleSetGoal(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		DailyPoints int `json:"dailyPoints"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.SetGoal(r.Context(), u.ID, body.DailyPoints); err != nil {
		if errors.Is(err, store.ErrBadGoal) {
			failCode(w, http.StatusBadRequest, "goal.invalid", err.Error())
			return
		}
		s.failErr(w, err, "set goal")
		return
	}
	s.handleToday(w, r)
}

// handleGrowth is the console's Growth page: ?days= from 7 to 90, 30 unless
// said.
func (s *Server) handleGrowth(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 7 || n > 90 {
			fail(w, http.StatusBadRequest, "days is 7 to 90")
			return
		}
		days = n
	}
	growth, err := s.Store.Growth(r.Context(), days, time.Now())
	if err != nil {
		s.failErr(w, err, "growth")
		return
	}
	writeJSON(w, http.StatusOK, growth)
}
