package api_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/shadowline/server/internal/game"
)

// Echo Town: chatting and gifts. The day's chat is the same all day, so the
// tests ask the test route which reply is right, as the browser tests do.

type chatJSON struct {
	NPC       string      `json:"npc"`
	Line      game.Text   `json:"line"`
	Replies   []game.Text `json:"replies"`
	Talked    bool        `json:"talked"`
	GiftWords []game.Text `json:"giftWords"`
}

type friendJSON struct {
	ID          string `json:"id"`
	Points      int    `json:"points"`
	Hearts      int    `json:"hearts"`
	TalkedToday bool   `json:"talkedToday"`
	GiftedToday bool   `json:"giftedToday"`
	Event       *struct {
		Hearts int `json:"hearts"`
	} `json:"event"`
}

type townStateJSON struct {
	Profile struct {
		Gold     int  `json:"gold"`
		HP       int  `json:"hp"`
		TownOpen bool `json:"townOpen"`
	} `json:"profile"`
	Inventory map[string]int `json:"inventory"`
	Friends   []friendJSON   `json:"friends"`
	Shop      []struct {
		ID     string `json:"id"`
		Seller string `json:"seller"`
	} `json:"shop"`
}

type talkJSON struct {
	Result struct {
		Right  bool       `json:"right"`
		Why    game.Text  `json:"why"`
		Answer game.Text  `json:"answer"`
		Points int        `json:"points"`
		Friend friendJSON `json:"friend"`
	} `json:"result"`
	State townStateJSON `json:"state"`
}

type giftJSON struct {
	Result struct {
		Taste      string     `json:"taste"`
		RightWords bool       `json:"rightWords"`
		Points     int        `json:"points"`
		Friend     friendJSON `json:"friend"`
	} `json:"result"`
	State townStateJSON `json:"state"`
}

func townState(t *testing.T, c *client) townStateJSON {
	t.Helper()
	return expect[townStateJSON](t, c.json("GET", "/api/game/state", nil), http.StatusOK)
}

func rightReply(t *testing.T, c *client, npc string) int {
	t.Helper()
	return expect[struct {
		Reply int `json:"reply"`
	}](t, c.json("GET", "/api/test/game/talk/answer?npc="+npc, nil), http.StatusOK).Reply
}

// rightWords is which of the day's ways of giving a gift is the right one.
func rightWords(chat chatJSON) int {
	for i, w := range chat.GiftWords {
		if w == game.GiftWords[0].Text {
			return i
		}
	}
	return -1
}

func talk(t *testing.T, c *client, npc string, reply int) talkJSON {
	t.Helper()
	return expect[talkJSON](t, c.json("POST", "/api/game/talk", map[string]any{"npc": npc, "reply": reply}), http.StatusOK)
}

func friend(s townStateJSON, id string) friendJSON {
	for _, f := range s.Friends {
		if f.ID == id {
			return f
		}
	}
	return friendJSON{}
}

func (h *harness) openTown(t *testing.T, c *client) {
	t.Helper()
	gameState(t, c)
	h.setStep(t, game.TownStep)
}

func TestTheTownWaitsForTheStory(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openWoods(t, learner)
	expectCode(t, learner.json("POST", "/api/game/move", map[string]any{"map": "town", "x": 10, "y": 10}),
		http.StatusConflict, "town_locked")
	expectCode(t, learner.json("GET", "/api/game/talk/elsa", nil), http.StatusConflict, "town_locked")
	if s := townState(t, learner); s.Profile.TownOpen || len(s.Friends) != 0 {
		t.Fatalf("the town before the story: %+v", s.Profile)
	}

	h.setStep(t, game.TownStep)
	expectStatus(t, learner.json("POST", "/api/game/move", map[string]any{"map": "town", "x": 10, "y": 10}),
		http.StatusNoContent)
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "to_town" || !q.Main.Done {
		t.Fatalf("walking into town: %+v", q.Main)
	}
	s := townState(t, learner)
	if !s.Profile.TownOpen || len(s.Friends) != len(game.Townsfolk) {
		t.Fatalf("the town once open: %+v, %d friends", s.Profile, len(s.Friends))
	}
	expectCode(t, learner.json("GET", "/api/game/talk/nobody", nil), http.StatusBadRequest, "no_npc")
}

func TestAChatADayMakesFriends(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)

	chat := expect[chatJSON](t, learner.json("GET", "/api/game/talk/elsa", nil), http.StatusOK)
	if chat.Line.En == "" || len(chat.Replies) != 3 || len(chat.GiftWords) != 3 || chat.Talked {
		t.Fatalf("the day's chat: %+v", chat)
	}
	again := expect[chatJSON](t, learner.json("GET", "/api/game/talk/elsa", nil), http.StatusOK)
	if again.Line != chat.Line || again.Replies[0] != chat.Replies[0] {
		t.Fatal("asked twice in a day, a different chat")
	}

	right := rightReply(t, learner, "elsa")
	got := talk(t, learner, "elsa", right)
	if !got.Result.Right || got.Result.Points != game.TalkRight || got.Result.Friend.Points != game.TalkRight ||
		!got.Result.Friend.TalkedToday || got.Result.Why.En == "" {
		t.Fatalf("the right reply: %+v", got.Result)
	}
	expectCode(t, learner.json("POST", "/api/game/talk", map[string]any{"npc": "elsa", "reply": right}),
		http.StatusConflict, "talked_today")
	if !expect[chatJSON](t, learner.json("GET", "/api/game/talk/elsa", nil), http.StatusOK).Talked {
		t.Fatal("the chat does not say it was had")
	}

	// A wrong reply still counts, a little, and says what was right.
	wrong := (rightReply(t, learner, "orin") + 1) % 3
	got = talk(t, learner, "orin", wrong)
	if got.Result.Right || got.Result.Points != game.TalkWrong || got.Result.Answer.En == "" {
		t.Fatalf("a wrong reply: %+v", got.Result)
	}
	expectCode(t, learner.json("POST", "/api/game/talk", map[string]any{"npc": "orin", "reply": 7}),
		http.StatusBadRequest, "no_reply")

	// A new day, a new chat.
	if _, err := h.pool.Exec(context.Background(),
		`update game_friendship set talked_on = talked_on - 1`); err != nil {
		t.Fatal(err)
	}
	talk(t, learner, "elsa", rightReply(t, learner, "elsa"))
	if f := friend(townState(t, learner), "elsa"); f.Points != 2*game.TalkRight {
		t.Fatalf("two days of chat: %+v", f)
	}
}

func TestGiftsAreTakenToTaste(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	h.setGold(t, 500)

	// Hugo sells what Mira does not.
	for _, it := range townState(t, learner).Shop {
		if it.ID == "honey_cake" && it.Seller != "hugo" || it.ID == "flowers" && it.Seller != "mira" {
			t.Fatalf("%s sold by %s", it.ID, it.Seller)
		}
	}
	expectStatus(t, learner.json("POST", "/api/game/buy", map[string]any{"item": "flowers", "qty": 2}), http.StatusOK)
	expectStatus(t, learner.json("POST", "/api/game/buy", map[string]any{"item": "honey_cake", "qty": 1}), http.StatusOK)

	chat := expect[chatJSON](t, learner.json("GET", "/api/game/talk/vy", nil), http.StatusOK)
	words := rightWords(chat)
	if words < 0 {
		t.Fatalf("the right words are not among %+v", chat.GiftWords)
	}
	gift := func(npc, item string, w int) giftJSON {
		return expect[giftJSON](t, learner.json("POST", "/api/game/gift",
			map[string]any{"npc": npc, "item": item, "words": w}), http.StatusOK)
	}
	// Dr. Vy loves flowers.
	got := gift("vy", "flowers", words)
	if got.Result.Taste != "loved" || got.Result.Points != game.GiftLoved || got.State.Inventory["flowers"] != 1 {
		t.Fatalf("flowers for Dr. Vy: %+v, bag %v", got.Result, got.State.Inventory)
	}
	expectCode(t, learner.json("POST", "/api/game/gift", map[string]any{"npc": "vy", "item": "flowers", "words": words}),
		http.StatusConflict, "gifted_today")
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "to_town" {
		t.Fatalf("still on the first step of the town: %+v", q.Main)
	}

	// Hugo bakes honey cakes all day; said wrongly, a gift he dislikes still
	// costs the same.
	hugoChat := expect[chatJSON](t, learner.json("GET", "/api/game/talk/hugo", nil), http.StatusOK)
	wrongWords := (rightWords(hugoChat) + 1) % 3
	got = gift("hugo", "honey_cake", wrongWords)
	if got.Result.Taste != "disliked" || got.Result.RightWords || got.Result.Points != game.GiftDisliked ||
		got.Result.Friend.Points != 0 {
		t.Fatalf("honey cake for Hugo: %+v", got.Result)
	}
	// Liked, said wrongly: half.
	linaChat := expect[chatJSON](t, learner.json("GET", "/api/game/talk/lina", nil), http.StatusOK)
	got = gift("lina", "flowers", (rightWords(linaChat)+1)%3)
	if got.Result.Taste != "liked" || got.Result.Points != game.GiftLiked/2 {
		t.Fatalf("flowers for Lina, said wrongly: %+v", got.Result)
	}

	expectCode(t, learner.json("POST", "/api/game/gift", map[string]any{"npc": "elsa", "item": "herb_salve", "words": 0}),
		http.StatusBadRequest, "not_gift")
	expectCode(t, learner.json("POST", "/api/game/gift", map[string]any{"npc": "elsa", "item": "old_book", "words": 0}),
		http.StatusConflict, "no_item")
}

func TestHeartsOpenAStoryOnce(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	talk(t, learner, "elsa", rightReply(t, learner, "elsa"))
	expectCode(t, learner.json("POST", "/api/game/heart", map[string]any{"npc": "elsa", "hearts": 2}),
		http.StatusConflict, "not_done")

	if _, err := h.pool.Exec(context.Background(), `update game_friendship set points = 200 where npc = 'elsa'`); err != nil {
		t.Fatal(err)
	}
	if f := friend(townState(t, learner), "elsa"); f.Hearts != 2 || f.Event == nil || f.Event.Hearts != 2 {
		t.Fatalf("two hearts with Elsa: %+v", f)
	}
	gold := townState(t, learner).Profile.Gold
	got := expect[struct {
		Event struct {
			Lines []game.Text `json:"lines"`
		} `json:"event"`
		State townStateJSON `json:"state"`
	}](t, learner.json("POST", "/api/game/heart", map[string]any{"npc": "elsa", "hearts": 2}), http.StatusOK)
	if len(got.Event.Lines) == 0 || got.State.Profile.Gold <= gold || got.State.Inventory["seed_golden"] != 1 {
		t.Fatalf("Elsa's story: %+v", got)
	}
	if f := friend(got.State, "elsa"); f.Event != nil {
		t.Fatal("the story is still waiting after it was told")
	}
	expectCode(t, learner.json("POST", "/api/game/heart", map[string]any{"npc": "elsa", "hearts": 2}),
		http.StatusConflict, "claimed")
}

func TestTheClinicMakesYouWell(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	expectCode(t, learner.json("POST", "/api/game/clinic", nil), http.StatusConflict, "full")
	if _, err := h.pool.Exec(context.Background(), `update game_profiles set hp = 5, hp_at = now(), gold = 100`); err != nil {
		t.Fatal(err)
	}
	s := expect[townStateJSON](t, learner.json("POST", "/api/game/clinic", nil), http.StatusOK)
	if s.Profile.HP != game.HPMax || s.Profile.Gold != 100-game.ClinicCost {
		t.Fatalf("after the clinic: %+v", s.Profile)
	}
}

func TestChapterThreeCountsTheTown(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	expectStatus(t, learner.json("POST", "/api/game/move", map[string]any{"map": "town", "x": 10, "y": 10}),
		http.StatusNoContent)
	claim(t, learner, "main") // to_town
	for _, p := range game.Townsfolk {
		if q := gameQuests(t, learner); q.Main.ID != "introductions" || q.Main.Done {
			t.Fatalf("before chatting with %s: %+v", p.ID, q.Main)
		}
		talk(t, learner, p.ID, rightReply(t, learner, p.ID))
	}
	if q := gameQuests(t, learner); !q.Main.Done || q.Main.Progress != 5 {
		t.Fatalf("after five chats: %+v", q.Main)
	}
	claim(t, learner, "main") // introductions: a bunch of flowers
	chat := expect[chatJSON](t, learner.json("GET", "/api/game/talk/vy", nil), http.StatusOK)
	expectStatus(t, learner.json("POST", "/api/game/gift",
		map[string]any{"npc": "vy", "item": "flowers", "words": rightWords(chat)}), http.StatusOK)
	if q := gameQuests(t, learner); q.Main.ID != "first_gift" || !q.Main.Done {
		t.Fatalf("after a loved gift: %+v", q.Main)
	}
	claim(t, learner, "main")
	// Dr. Vy is at 30 + 80; one more day of chat and gift reaches two hearts.
	if q := gameQuests(t, learner); q.Main.ID != "two_hearts" || q.Main.Progress != 1 {
		t.Fatalf("hearts so far: %+v", q.Main)
	}
	if _, err := h.pool.Exec(context.Background(), `update game_friendship set points = points + 90 where npc = 'vy'`); err != nil {
		t.Fatal(err)
	}
	if q := gameQuests(t, learner); !q.Main.Done {
		t.Fatalf("two hearts: %+v", q.Main)
	}
}
