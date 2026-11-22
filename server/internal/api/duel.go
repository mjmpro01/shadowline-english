package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// Word duels against the tower.

func (s *Server) duelRefusal(w http.ResponseWriter, err error, action string) {
	refusals := []struct {
		err  error
		code string
	}{
		{store.ErrFloorLocked, "duel.locked"},
		{store.ErrNoEnergy, "duel.noEnergy"},
		{store.ErrDuelOver, "duel.over"},
		{store.ErrDuelStale, "duel.stale"},
	}
	for _, r := range refusals {
		if errors.Is(err, r.err) {
			failCode(w, http.StatusConflict, r.code, r.err.Error())
			return
		}
	}
	s.arenaRefusal(w, err, action)
}

func (s *Server) handleTower(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	tower, err := s.Store.TowerOf(r.Context(), u.ID, time.Now())
	if err != nil {
		s.duelRefusal(w, err, "tower")
		return
	}
	writeJSON(w, http.StatusOK, tower)
}

func (s *Server) handleDuel(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	duel, err := s.Store.ActiveDuel(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "duel")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"duel": duel})
}

func (s *Server) handleDuelStart(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Floor int `json:"floor"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	duel, err := s.Store.StartDuel(r.Context(), u.ID, body.Floor, time.Now())
	if err != nil {
		s.duelRefusal(w, err, "start duel")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"duel": duel})
}

func (s *Server) handleDuelAnswer(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		ID      int64  `json:"id"`
		Turn    int    `json:"turn"`
		Answer  string `json:"answer"`
		Special bool   `json:"special"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	turn, duel, err := s.Store.AnswerDuel(r.Context(), u.ID, body.ID, body.Turn, body.Answer, body.Special, time.Now())
	if err != nil {
		s.duelRefusal(w, err, "answer duel")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"turn": turn, "duel": duel})
}

func (s *Server) handleDuelFlee(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	if err := s.Store.FleeDuel(r.Context(), u.ID); err != nil {
		s.duelRefusal(w, err, "flee duel")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTestDuelAnswer is the answer to the question being asked, for a
// browser test that has to win. AUTH_FAKE=1 only.
func (s *Server) handleTestDuelAnswer(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	answer, err := s.Store.DuelAnswerKey(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "test duel answer")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"answer": answer})
}

// handleTestEnergy sets the signed-in fighter's energy. AUTH_FAKE=1 only.
func (s *Server) handleTestEnergy(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Energy int `json:"energy"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Energy < 0 {
		fail(w, http.StatusBadRequest, "energy is a number, 0 or more")
		return
	}
	if err := s.Store.SetFighterEnergy(r.Context(), u.ID, body.Energy, time.Now()); err != nil {
		s.failErr(w, err, "test energy")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
