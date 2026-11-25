package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/shadowline/server/internal/arena"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// The Arena: a learner's fighter, the characters they own and can buy, and
// their coins.

// arenaRefusal answers a refusal the Arena gives with a code the app can say
// in the learner's language; anything else is failErr's.
func (s *Server) arenaRefusal(w http.ResponseWriter, err error, action string) {
	refusals := []struct {
		err    error
		status int
		code   string
	}{
		{arena.ErrBadFighter, http.StatusBadRequest, "arena.invalid"},
		{store.ErrNoFighter, http.StatusConflict, "arena.noFighter"},
		{store.ErrFighterTaken, http.StatusConflict, "arena.exists"},
		{store.ErrOwned, http.StatusConflict, "arena.owned"},
		{store.ErrNotOwned, http.StatusConflict, "arena.notOwned"},
		{store.ErrNotStarter, http.StatusBadRequest, "arena.invalid"},
		{store.ErrNotEnoughCoins, http.StatusConflict, "arena.notEnoughCoins"},
	}
	for _, r := range refusals {
		if errors.Is(err, r.err) {
			failCode(w, r.status, r.code, r.err.Error())
			return
		}
	}
	s.failErr(w, err, action)
}

func (s *Server) handleArena(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	state, err := s.Store.ArenaOf(r.Context(), u.ID)
	if err != nil {
		s.failErr(w, err, "arena")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// handleCreateFighter makes the learner's fighter: a name, and which of the
// free characters they start as.
func (s *Server) handleCreateFighter(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Name      string `json:"name"`
		Character string `json:"character"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.CreateFighter(r.Context(), u.ID, body.Name, body.Character); err != nil {
		s.arenaRefusal(w, err, "create fighter")
		return
	}
	s.handleArena(w, r)
}

// handleRenameFighter changes the fighter's name.
func (s *Server) handleRenameFighter(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.RenameFighter(r.Context(), u.ID, body.Name); err != nil {
		s.arenaRefusal(w, err, "rename fighter")
		return
	}
	s.handleArena(w, r)
}

// handleCharacter buys a character, or plays one already owned.
func (s *Server) handleCharacter(buy bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		var body struct {
			Character string `json:"character"`
		}
		if err := decodeJSON(r, &body); err != nil {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		var err error
		if buy {
			err = s.Store.BuyCharacter(r.Context(), u.ID, body.Character)
		} else {
			err = s.Store.SelectCharacter(r.Context(), u.ID, body.Character)
		}
		if err != nil {
			s.arenaRefusal(w, err, "character")
			return
		}
		s.handleArena(w, r)
	}
}

func (s *Server) handleWallet(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	wallet, err := s.Store.WalletOf(r.Context(), u.ID, time.Now())
	if err != nil {
		s.failErr(w, err, "wallet")
		return
	}
	writeJSON(w, http.StatusOK, wallet)
}
