package api

import (
	"net/http"

	"github.com/shadowline/server/internal/auth"
)

// The Word Hall's rooms, chapter 4.

func (s *Server) handleRooms(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	rooms, err := s.Store.Rooms(r.Context(), u.ID)
	if err != nil {
		s.gameFail(w, err, "rooms")
		return
	}
	writeJSON(w, http.StatusOK, rooms)
}

func (s *Server) handleRoomsAsk(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Place string `json:"place"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	question, err := s.Store.AskRoomWord(r.Context(), u.ID, body.Place)
	if err != nil {
		s.gameFail(w, err, "ask room word")
		return
	}
	writeJSON(w, http.StatusOK, question)
}

func (s *Server) handleRoomsAnswer(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Answer string `json:"answer"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	result, state, err := s.Store.AnswerRoomWord(r.Context(), u.ID, body.Answer)
	if err != nil {
		s.gameFail(w, err, "answer room word")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": result, "state": state})
}

func (s *Server) handleRoomsClaim(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFrom(r.Context())
	var body struct {
		Bundle string `json:"bundle"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	claimed, state, err := s.Store.ClaimBundle(r.Context(), u.ID, body.Bundle)
	if err != nil {
		s.gameFail(w, err, "claim bundle")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reward": claimed.Reward, "restored": claimed.Restored, "state": state})
}
