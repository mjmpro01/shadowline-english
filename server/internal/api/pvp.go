package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// Duels against shadows, and the week's Arena board.

func (s *Server) handleRivals(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	rivals, err := s.Store.Rivals(r.Context(), u.ID, time.Now())
	if err != nil {
		s.duelRefusal(w, err, "rivals")
		return
	}
	writeJSON(w, http.StatusOK, rivals)
}

func (s *Server) handlePvPStart(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Rival string `json:"rival"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	duel, err := s.Store.StartPvP(r.Context(), u.ID, body.Rival, time.Now())
	if errors.Is(err, store.ErrPvPSelf) {
		failCode(w, http.StatusConflict, "pvp.self", err.Error())
		return
	}
	if err != nil {
		s.duelRefusal(w, err, "start pvp")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"duel": duel})
}

// handleArenaBoard is this week's Arena board. A week that ended since anyone
// last asked has its top three paid first.
func (s *Server) handleArenaBoard(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	now := time.Now()
	if err := s.Store.SettleArenaWeeks(r.Context(), now); err != nil {
		s.Log.Warn("cannot settle the arena board", "error", err)
	}
	board, err := s.Store.ArenaBoard(r.Context(), u.ID, leaderboardSize, now)
	if err != nil {
		s.failErr(w, err, "arena board")
		return
	}
	writeJSON(w, http.StatusOK, board)
}
