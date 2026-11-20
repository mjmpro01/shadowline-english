package api

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/auth"
)

// Milestone achievements: where a learner stands on each track, what they
// have unlocked and not been shown yet, and marking it shown.

// syncAchievements unlocks whatever a learner has reached. Like logActivity,
// a failure is logged and never the learner's problem.
func (s *Server) syncAchievements(ctx context.Context, user uuid.UUID) {
	if _, err := s.Store.SyncAchievements(context.WithoutCancel(ctx), user, time.Now()); err != nil {
		s.Log.Warn("cannot count achievements", "user", user, "error", err)
	}
}

func (s *Server) handleAchievements(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	s.syncAchievements(r.Context(), u.ID)
	board, err := s.Store.AchievementsOf(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "achievements")
		return
	}
	writeJSON(w, http.StatusOK, board)
}

func (s *Server) handleNewAchievements(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	s.syncAchievements(r.Context(), u.ID)
	unseen, err := s.Store.UnseenAchievements(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "new achievements")
		return
	}
	writeJSON(w, http.StatusOK, unseen)
}

func (s *Server) handleAchievementsSeen(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(body.IDs) == 0 || len(body.IDs) > 100 {
		fail(w, http.StatusBadRequest, "ids must name 1 to 100 achievements")
		return
	}
	if err := s.Store.MarkAchievementsSeen(r.Context(), u.ID, body.IDs, time.Now()); err != nil {
		s.failErr(w, err, "mark achievements seen")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
