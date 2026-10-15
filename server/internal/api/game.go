package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// The Arena: a farm where every harvest is a word. The server keeps the farm
// and decides every outcome; the browser draws it and says what the player did.
// Every move answers with the farm as it now stands, so the screen never has to
// guess what changed.

// gameFail answers a move the rules refused with its code, so the app can say
// why in the learner's language; anything else is an ordinary failure.
func (s *Server) gameFail(w http.ResponseWriter, err error, action string) {
	var refused *store.GameError
	if errors.As(err, &refused) {
		failCode(w, refused.Status, refused.Code, refused.Message)
		return
	}
	s.failErr(w, err, action)
}

func (s *Server) handleGameState(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	state, err := s.Store.GameState(r.Context(), u.ID)
	if err != nil {
		s.gameFail(w, err, "game state")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

type plotMove struct {
	Plot int    `json:"plot"`
	Seed string `json:"seed"`
}

func (s *Server) handleGamePlant(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body plotMove
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.Store.Plant(r.Context(), u.ID, body.Plot, body.Seed)
	if err != nil {
		s.gameFail(w, err, "plant")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGameHarvest(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body plotMove
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	state, word, gold, err := s.Store.Harvest(r.Context(), u.ID, body.Plot)
	if err != nil {
		s.gameFail(w, err, "harvest")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"state": state, "word": word, "gold": gold})
}

func (s *Server) handleGameUnlock(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body plotMove
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.Store.UnlockPlot(r.Context(), u.ID, body.Plot)
	if err != nil {
		s.gameFail(w, err, "unlock plot")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGameUpgrade(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body plotMove
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.Store.UpgradePlot(r.Context(), u.ID, body.Plot)
	if err != nil {
		s.gameFail(w, err, "upgrade plot")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGameBuy(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Item string `json:"item"`
		Qty  int    `json:"qty"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.Store.Buy(r.Context(), u.ID, body.Item, body.Qty)
	if err != nil {
		s.gameFail(w, err, "buy")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGameUse(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Item string `json:"item"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	state, err := s.Store.UseItem(r.Context(), u.ID, body.Item)
	if err != nil {
		s.gameFail(w, err, "use item")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGameSleep(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	state, err := s.Store.Sleep(r.Context(), u.ID)
	if err != nil {
		s.gameFail(w, err, "sleep")
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGameListen(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Word string `json:"word"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.Store.ListenToWord(r.Context(), u.ID, strings.ToLower(strings.TrimSpace(body.Word))); err != nil {
		s.gameFail(w, err, "listen")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// maxCoord bounds where a position can be saved: larger than any map.
const maxCoord = 100_000

func (s *Server) handleGameMove(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Map string `json:"map"`
		X   int    `json:"x"`
		Y   int    `json:"y"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Map != "farm" {
		fail(w, http.StatusBadRequest, "there is no such map")
		return
	}
	body.X = max(0, min(body.X, maxCoord))
	body.Y = max(0, min(body.Y, maxCoord))
	if err := s.Store.MoveTo(r.Context(), u.ID, body.Map, body.X, body.Y); err != nil {
		s.failErr(w, err, "move")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleGameQuests(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	quests, err := s.Store.GameQuests(r.Context(), u.ID)
	if err != nil {
		s.gameFail(w, err, "quests")
		return
	}
	writeJSON(w, http.StatusOK, quests)
}

func (s *Server) handleGameClaim(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Quest string `json:"quest"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	given, state, quests, err := s.Store.ClaimQuest(r.Context(), u.ID, body.Quest)
	if err != nil {
		s.gameFail(w, err, "claim quest")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reward": given, "state": state, "quests": quests})
}
