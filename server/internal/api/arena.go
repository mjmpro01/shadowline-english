package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/shadowline/server/internal/arena"
	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// The Arena: a learner's fighter, the shop and their gear, and their coins.

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
		{store.ErrBareBody, http.StatusConflict, "arena.bare"},
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

func (s *Server) handleCreateFighter(w http.ResponseWriter, r *http.Request) {
	s.saveFighter(w, r, true)
}

func (s *Server) handleUpdateFighter(w http.ResponseWriter, r *http.Request) {
	s.saveFighter(w, r, false)
}

func (s *Server) saveFighter(w http.ResponseWriter, r *http.Request, create bool) {
	u, _ := auth.UserFrom(r.Context())
	var look arena.Look
	if err := decodeJSON(r, &look); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	var err error
	if create {
		err = s.Store.CreateFighter(r.Context(), u.ID, look)
	} else {
		err = s.Store.UpdateFighter(r.Context(), u.ID, look)
	}
	if err != nil {
		s.arenaRefusal(w, err, "save fighter")
		return
	}
	s.handleArena(w, r)
}

func (s *Server) handleArenaBuy(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Item string `json:"item"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.Buy(r.Context(), u.ID, body.Item); err != nil {
		s.arenaRefusal(w, err, "buy")
		return
	}
	s.handleArena(w, r)
}

// handleArenaEquip puts on a piece of gear, or with no item takes off what is
// in the slot.
func (s *Server) handleArenaEquip(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Item *string `json:"item"`
		Slot string  `json:"slot"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	var err error
	if body.Item != nil {
		err = s.Store.Equip(r.Context(), u.ID, *body.Item)
	} else {
		err = s.Store.Unequip(r.Context(), u.ID, body.Slot)
	}
	if err != nil {
		s.arenaRefusal(w, err, "equip")
		return
	}
	s.handleArena(w, r)
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
