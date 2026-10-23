package api_test

import (
	"net/http"
	"testing"
)

// An admin can go anywhere in the Arena from the start — the woods, the
// troll's lair, the town, the Word Hall with the glasses, the library — to try
// things out, while the story itself still starts at its first step. A learner
// still waits for it.
func TestAnAdminFindsEveryPlaceOpen(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")

	state := expect[struct {
		Profile struct {
			MainStep  int  `json:"mainStep"`
			WoodsOpen bool `json:"woodsOpen"`
			TownOpen  bool `json:"townOpen"`
			HallOpen  bool `json:"hallOpen"`
		} `json:"profile"`
		Spawns []struct {
			ID string `json:"id"`
		} `json:"spawns"`
		Shop []struct {
			ID       string `json:"id"`
			Unlocked bool   `json:"unlocked"`
		} `json:"shop"`
	}](t, admin.json("GET", "/api/game/state", nil), http.StatusOK)
	if state.Profile.MainStep != 0 || !state.Profile.WoodsOpen || !state.Profile.TownOpen || !state.Profile.HallOpen {
		t.Fatalf("an admin's farm: %+v", state.Profile)
	}
	lair := false
	for _, sp := range state.Spawns {
		lair = lair || sp.ID == "troll_lair"
	}
	if !lair {
		t.Fatalf("the troll is not in its lair for an admin: %+v", state.Spawns)
	}
	for _, it := range state.Shop {
		if !it.Unlocked {
			t.Fatalf("%s is locked in an admin's shop", it.ID)
		}
	}

	expectStatus(t, admin.json("POST", "/api/game/move", map[string]any{"map": "woods", "x": 10, "y": 10}),
		http.StatusNoContent)
	expectStatus(t, admin.json("POST", "/api/game/move", map[string]any{"map": "town", "x": 10, "y": 10}),
		http.StatusNoContent)
	if hall := visitHall(t, admin); !hall.Hall.Glasses {
		t.Fatalf("an admin reads the Lexi's notes without the glasses: %+v", hall.Hall)
	}
	expectStatus(t, admin.json("GET", "/api/game/library", nil), http.StatusOK)
	expectStatus(t, admin.json("POST", "/api/game/battle/start", map[string]any{"spawn": "troll_lair"}), http.StatusOK)
	if q := gameQuests(t, admin); q.Main == nil || q.Main.Step != 0 {
		t.Fatalf("the story starts at the beginning for an admin too: %+v", q.Main)
	}

	// Nothing of that for a learner.
	learner := h.login("learner@example.com")
	expectCode(t, learner.json("POST", "/api/game/move", map[string]any{"map": "woods", "x": 10, "y": 10}),
		http.StatusConflict, "woods_locked")
	expectCode(t, learner.json("POST", "/api/game/move", map[string]any{"map": "town", "x": 10, "y": 10}),
		http.StatusConflict, "town_locked")
	expectCode(t, learner.json("POST", "/api/game/battle/start", map[string]any{"spawn": "troll_lair"}),
		http.StatusConflict, "woods_locked")
}
