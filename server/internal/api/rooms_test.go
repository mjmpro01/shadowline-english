package api_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/shadowline/server/internal/game"
)

type roomsJSON struct {
	Rooms []struct {
		ID       string `json:"id"`
		Restored bool   `json:"restored"`
		Bundles  []struct {
			ID      string `json:"id"`
			Full    bool   `json:"full"`
			Claimed bool   `json:"claimed"`
			Words   []struct {
				Vi         string `json:"vi"`
				Key        string `json:"key"`
				Filled     bool   `json:"filled"`
				TriedToday bool   `json:"triedToday"`
				Word       string `json:"word"`
			} `json:"words"`
		} `json:"bundles"`
	} `json:"rooms"`
	Total int `json:"total"`
}

type roomQuestionJSON struct {
	Kind    string   `json:"kind"`
	Prompt  string   `json:"prompt"`
	Say     string   `json:"say"`
	Options []string `json:"options"`
}

type roomAnswerJSON struct {
	Result struct {
		Right bool   `json:"right"`
		Word  string `json:"word"`
	} `json:"result"`
	State struct {
		Profile struct {
			RoomsDone int `json:"roomsDone"`
			Gold      int `json:"gold"`
		} `json:"profile"`
	} `json:"state"`
}

func rooms(t *testing.T, c *client) roomsJSON {
	t.Helper()
	return expect[roomsJSON](t, c.json("GET", "/api/game/rooms", nil), http.StatusOK)
}

// fillPlace asks for a place's word and answers it right.
func fillPlace(t *testing.T, c *client, place string) roomAnswerJSON {
	t.Helper()
	expect[roomQuestionJSON](t, c.json("POST", "/api/game/rooms/ask", map[string]any{"place": place}), http.StatusOK)
	answer := quizAnswer(t, c, "room")
	return expect[roomAnswerJSON](t, c.json("POST", "/api/game/rooms/answer", map[string]any{"answer": answer}), http.StatusOK)
}

func TestTheWordHallsRoomsWaitForChapterFour(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	expectCode(t, learner.json("GET", "/api/game/rooms", nil), http.StatusConflict, "rooms_closed")
	expectCode(t, learner.json("POST", "/api/game/rooms/ask", map[string]any{"place": "kitchen_tools:0"}),
		http.StatusConflict, "rooms_closed")

	h.setStep(t, game.RoomsStep)
	got := rooms(t, learner)
	if len(got.Rooms) != len(game.Rooms) || got.Total != game.RoomCount {
		t.Fatalf("the rooms: %+v", got)
	}
	// An empty place shows what its word means, never the word.
	for _, r := range got.Rooms {
		for _, b := range r.Bundles {
			for _, w := range b.Words {
				if w.Vi == "" || w.Word != "" || w.Filled {
					t.Fatalf("a place gives itself away: %+v", w)
				}
			}
		}
	}
}

func TestAWordPutBackInARoomStaysThereAndInTheVocabulary(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	h.setStep(t, game.RoomsStep)

	q := expect[roomQuestionJSON](t, learner.json("POST", "/api/game/rooms/ask", map[string]any{"place": "kitchen_tools:0"}), http.StatusOK)
	if q.Kind != game.GameListen && q.Kind != game.GameScramble {
		t.Fatalf("a room asks %q", q.Kind)
	}
	if q.Kind == game.GameListen && q.Say != "pan" {
		t.Fatalf("a word to hear is not said: %+v", q)
	}
	if q.Kind == game.GameScramble && q.Prompt != "cái chảo" {
		t.Fatalf("a word to spell is not given by its meaning: %+v", q)
	}
	answer := quizAnswer(t, learner, "room")
	res := expect[roomAnswerJSON](t, learner.json("POST", "/api/game/rooms/answer", map[string]any{"answer": answer}), http.StatusOK)
	if !res.Result.Right || res.Result.Word != "pan" {
		t.Fatalf("the right answer: %+v", res.Result)
	}
	place := rooms(t, learner).Rooms[0].Bundles[0].Words[0]
	if !place.Filled || place.Word != "pan" {
		t.Fatalf("the place after: %+v", place)
	}
	expectCode(t, learner.json("POST", "/api/game/rooms/ask", map[string]any{"place": "kitchen_tools:0"}),
		http.StatusConflict, "already_filled")
	vocab := expect[[]struct {
		Word    string `json:"word"`
		Meaning string `json:"meaning"`
	}](t, learner.json("GET", "/api/vocab", nil), http.StatusOK)
	if len(vocab) != 1 || vocab[0].Word != "pan" || vocab[0].Meaning == "" {
		t.Fatalf("the vocabulary: %+v", vocab)
	}
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "into_the_hall" || !q.Main.Done {
		t.Fatalf("chapter 4's first step: %+v", q.Main)
	}

	// Wrong, and it waits for tomorrow.
	expect[roomQuestionJSON](t, learner.json("POST", "/api/game/rooms/ask", map[string]any{"place": "kitchen_tools:1"}), http.StatusOK)
	wrong := expect[roomAnswerJSON](t, learner.json("POST", "/api/game/rooms/answer", map[string]any{"answer": "zzz"}), http.StatusOK)
	if wrong.Result.Right || wrong.Result.Word != "knife" {
		t.Fatalf("a wrong answer: %+v", wrong.Result)
	}
	if !rooms(t, learner).Rooms[0].Bundles[0].Words[1].TriedToday {
		t.Fatal("a word got wrong is not marked as tried today")
	}
	expectCode(t, learner.json("POST", "/api/game/rooms/ask", map[string]any{"place": "kitchen_tools:1"}),
		http.StatusConflict, "tried_today")
	expectCode(t, learner.json("POST", "/api/game/rooms/answer", map[string]any{"answer": "knife"}),
		http.StatusConflict, "no_question")
	expectCode(t, learner.json("POST", "/api/game/rooms/ask", map[string]any{"place": "attic:0"}),
		http.StatusBadRequest, "no_place")

	// Someone else's hall is their own.
	other := h.login("other@example.com")
	gameState(t, other)
	h.setStep(t, game.RoomsStep)
	if w := rooms(t, other).Rooms[0].Bundles[0].Words[0]; w.Filled {
		t.Fatal("another player finds the word back in their hall")
	}
}

func TestAFullRoomWakesItsLexi(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	h.setStep(t, game.RoomsStep)
	kitchen := game.Rooms[0]

	fillPlace(t, learner, "kitchen_tools:0")
	expectCode(t, learner.json("POST", "/api/game/rooms/claim", map[string]any{"bundle": "kitchen_tools"}),
		http.StatusConflict, "bundle_incomplete")
	for _, b := range kitchen.Bundles {
		for i := range b.Words {
			if b.ID == "kitchen_tools" && i == 0 {
				continue
			}
			fillPlace(t, learner, b.ID+":"+string(rune('0'+i)))
		}
	}
	got := rooms(t, learner).Rooms[0]
	for _, b := range got.Bundles {
		if !b.Full || b.Claimed {
			t.Fatalf("a filled bundle: %+v", b)
		}
	}

	before := gameState(t, learner).Profile.Gold
	for i, b := range kitchen.Bundles {
		res := expect[struct {
			Reward   game.Reward `json:"reward"`
			Restored string      `json:"restored"`
			State    struct {
				Profile struct {
					Gold      int `json:"gold"`
					RoomsDone int `json:"roomsDone"`
				} `json:"profile"`
			} `json:"state"`
		}](t, learner.json("POST", "/api/game/rooms/claim", map[string]any{"bundle": b.ID}), http.StatusOK)
		last := i == len(kitchen.Bundles)-1
		if (res.Restored == "kitchen") != last || (res.State.Profile.RoomsDone == 1) != last {
			t.Fatalf("bundle %s: %+v", b.ID, res)
		}
		want := b.Reward.Gold
		if last {
			want += kitchen.Reward.Gold
		}
		if res.State.Profile.Gold-before != want {
			t.Fatalf("bundle %s paid %d, not %d", b.ID, res.State.Profile.Gold-before, want)
		}
		before = res.State.Profile.Gold
	}
	expectCode(t, learner.json("POST", "/api/game/rooms/claim", map[string]any{"bundle": "kitchen_tools"}),
		http.StatusConflict, "claimed")
	if !rooms(t, learner).Rooms[0].Restored {
		t.Fatal("the kitchen is not restored")
	}

	// The story moves on: Orin's step, then Hugo's kitchen, done.
	claim(t, learner, "main")
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "kitchen_room" || !q.Main.Done {
		t.Fatalf("Hugo's step: %+v", q.Main)
	}
	var n int
	if err := h.pool.QueryRow(context.Background(), `
		select count(*)::int from game_events where kind = 'room_done' and item = 'kitchen'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("room_done events: %d %v", n, err)
	}
}

func TestTheRoomsDailyCountsWordsPutBack(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	gameState(t, learner)
	h.setStep(t, game.RoomsStep)
	fillPlace(t, learner, "body_parts:0")
	fillPlace(t, learner, "body_parts:1")
	// Whether the task is drawn today is the day's luck; when it is, it counts.
	for _, d := range gameQuests(t, learner).Daily {
		if d.ID == "rooms2" && (!d.Done || d.Progress != 2) {
			t.Fatalf("the rooms' task: %+v", d)
		}
	}
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "into_the_hall" || q.Main.Progress != 1 {
		t.Fatalf("the words put back do not count for the story: %+v", q.Main)
	}
}
