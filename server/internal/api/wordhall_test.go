package api_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/shadowline/server/internal/game"
)

// The rest of Echo Town: the Lexi's notes, Lina's library and the letters.
// Answers come from the test routes, as the browser tests get them.

type quizJSON struct {
	Kind    string   `json:"kind"`
	Prompt  string   `json:"prompt"`
	Options []string `json:"options"`
}

type hallJSON struct {
	Hall struct {
		Glasses bool      `json:"glasses"`
		Read    int       `json:"read"`
		PerDay  int       `json:"perDay"`
		Note    *quizJSON `json:"note"`
	} `json:"hall"`
	State townStateJSON `json:"state"`
}

type answeredJSON struct {
	Result struct {
		Right   bool   `json:"right"`
		Word    string `json:"word"`
		IPA     string `json:"ipa"`
		Meaning string `json:"meaning"`
		Gold    int    `json:"gold"`
	} `json:"result"`
	State townStateJSON `json:"state"`
}

type libraryJSON struct {
	Donated    int `json:"donated"`
	Milestones []struct {
		Words   int  `json:"words"`
		Reached bool `json:"reached"`
		Claimed bool `json:"claimed"`
	} `json:"milestones"`
	Words []struct {
		Word string `json:"word"`
	} `json:"words"`
	Available int       `json:"available"`
	Asked     *quizJSON `json:"asked"`
	AskedWord string    `json:"askedWord"`
}

type letterStateJSON struct {
	Letter *struct {
		From struct {
			ID string `json:"id"`
		} `json:"from"`
		Body []game.Text `json:"body"`
		Gold int         `json:"gold"`
		Done bool        `json:"done"`
		// Never sent: the letter says it in words.
		Item *string `json:"item"`
	} `json:"letter"`
	Profile struct {
		Gold        int  `json:"gold"`
		HallOpen    bool `json:"hallOpen"`
		LibraryOpen bool `json:"libraryOpen"`
	} `json:"profile"`
}

func quizAnswer(t *testing.T, c *client, kind string) string {
	t.Helper()
	return expect[struct {
		Answer string `json:"answer"`
	}](t, c.json("GET", "/api/test/game/quiz/answer?kind="+kind, nil), http.StatusOK).Answer
}

func visitHall(t *testing.T, c *client) hallJSON {
	t.Helper()
	return expect[hallJSON](t, c.json("POST", "/api/game/hall", nil), http.StatusOK)
}

func TestTheLexiNotesNeedSageOrinsGlasses(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	h.setStep(t, game.HallStep)

	door := visitHall(t, learner)
	if door.Hall.Glasses || door.Hall.Note != nil {
		t.Fatalf("a note to read without the glasses: %+v", door.Hall)
	}
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "silent_hall" || !q.Main.Done {
		t.Fatalf("visiting the hall: %+v", q.Main)
	}
	expectCode(t, learner.json("POST", "/api/game/hall/read", map[string]any{"answer": "water"}),
		http.StatusConflict, "need_glasses")

	// Sage Orin's step is a story told; claiming it gives the glasses.
	claim(t, learner, "main")
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "ipa_glasses" || !q.Main.Done {
		t.Fatalf("Sage Orin's step: %+v", q.Main)
	}
	claim(t, learner, "main")
	if townState(t, learner).Inventory["ipa_glasses"] != 1 {
		t.Fatal("no glasses after Sage Orin's step")
	}

	door = visitHall(t, learner)
	note := door.Hall.Note
	if !door.Hall.Glasses || note == nil || note.Kind != game.GameIPA || len(note.Options) != 4 || note.Prompt == "" {
		t.Fatalf("the first note: %+v", door.Hall)
	}
	// The same note until it is read.
	if again := visitHall(t, learner).Hall.Note; again == nil || again.Prompt != note.Prompt {
		t.Fatalf("the note changed before it was read: %+v then %+v", note, again)
	}
	gold := door.State.Profile.Gold
	read := expect[answeredJSON](t, learner.json("POST", "/api/game/hall/read",
		map[string]any{"answer": quizAnswer(t, learner, "note")}), http.StatusOK)
	if !read.Result.Right || read.Result.Gold != game.NoteGold || read.State.Profile.Gold != gold+game.NoteGold ||
		read.Result.IPA != note.Prompt {
		t.Fatalf("a note read right: %+v", read.Result)
	}
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "lexi_note" || !q.Main.Done {
		t.Fatalf("the first note read: %+v", q.Main)
	}

	// A wrong reading is still a reading, and pays nothing.
	visitHall(t, learner)
	wrong := expect[answeredJSON](t, learner.json("POST", "/api/game/hall/read",
		map[string]any{"answer": "not a word at all"}), http.StatusOK)
	if wrong.Result.Right || wrong.Result.Gold != 0 || wrong.Result.Word == "" {
		t.Fatalf("a note read wrong: %+v", wrong.Result)
	}
	visitHall(t, learner)
	expect[answeredJSON](t, learner.json("POST", "/api/game/hall/read",
		map[string]any{"answer": quizAnswer(t, learner, "note")}), http.StatusOK)

	// Three a day.
	if done := visitHall(t, learner).Hall; done.Note != nil || done.Read != game.NotesPerDay {
		t.Fatalf("after the day's notes: %+v", done)
	}
	expectCode(t, learner.json("POST", "/api/game/hall/read", map[string]any{"answer": "x"}),
		http.StatusConflict, "no_note")
}

// addWords puts words in a player's vocabulary, as tapping them in a caption does.
func addWords(t *testing.T, c *client, words ...string) {
	t.Helper()
	for _, w := range words {
		expectStatus(t, c.json("POST", "/api/vocab", map[string]any{"word": w}), http.StatusCreated)
	}
}

func library(t *testing.T, c *client) libraryJSON {
	t.Helper()
	return expect[libraryJSON](t, c.json("GET", "/api/game/library", nil), http.StatusOK)
}

func donate(t *testing.T, c *client, word string, right bool) answeredJSON {
	t.Helper()
	expect[quizJSON](t, c.json("POST", "/api/game/library/ask", map[string]any{"word": word}), http.StatusOK)
	answer := "not what it means"
	if right {
		answer = quizAnswer(t, c, "donate")
	}
	return expect[answeredJSON](t, c.json("POST", "/api/game/library/donate", map[string]any{"answer": answer}), http.StatusOK)
}

func TestWordsGoToTheLibraryWhenTheirMeaningIsKnown(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	expectCode(t, learner.json("GET", "/api/game/library", nil), http.StatusConflict, "library_closed")
	h.setStep(t, game.LibraryStep)

	words := []string{"water", "house", "friend", "garden", "music", "river", "window"}
	addWords(t, learner, words...)
	lib := library(t, learner)
	if lib.Available != len(words) || lib.Donated != 0 || len(lib.Milestones) != len(game.LibraryMilestones) {
		t.Fatalf("the library before any words: %+v", lib)
	}
	expectCode(t, learner.json("POST", "/api/game/library/ask", map[string]any{"word": "elephant"}),
		http.StatusConflict, "not_givable")

	question := expect[quizJSON](t, learner.json("POST", "/api/game/library/ask", map[string]any{"word": "water"}),
		http.StatusOK)
	if question.Kind != game.GameMeaning || question.Prompt != "water" || len(question.Options) != 4 {
		t.Fatalf("Lina's question: %+v", question)
	}
	if asked := library(t, learner); asked.Asked == nil || asked.AskedWord != "water" {
		t.Fatalf("the question waiting: %+v", asked)
	}
	// Wrong: the word stays the player's, and waits for another day.
	missed := expect[answeredJSON](t, learner.json("POST", "/api/game/library/donate",
		map[string]any{"answer": "not what it means"}), http.StatusOK)
	if missed.Result.Right || missed.Result.Meaning == "" {
		t.Fatalf("a wrong meaning: %+v", missed.Result)
	}
	lib = library(t, learner)
	if lib.Donated != 0 || lib.Available != len(words)-1 {
		t.Fatalf("after a wrong meaning: %+v", lib)
	}
	expectCode(t, learner.json("POST", "/api/game/library/ask", map[string]any{"word": "water"}),
		http.StatusConflict, "not_givable")

	for _, w := range words[1:6] {
		if got := donate(t, learner, w, true); !got.Result.Right {
			t.Fatalf("giving %s: %+v", w, got.Result)
		}
	}
	lib = library(t, learner)
	if lib.Donated != 5 || lib.Available != 1 || !lib.Milestones[0].Reached || lib.Milestones[0].Claimed {
		t.Fatalf("after five words: %+v", lib)
	}
	// A word given is given for good.
	expectCode(t, learner.json("POST", "/api/game/library/ask", map[string]any{"word": "house"}),
		http.StatusConflict, "not_givable")
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "first_donation" || !q.Main.Done {
		t.Fatalf("Lina's step: %+v", q.Main)
	}

	gold := townState(t, learner).Profile.Gold
	expectStatus(t, learner.json("POST", "/api/game/library/claim", map[string]any{"words": 5}), http.StatusOK)
	if got := townState(t, learner).Profile.Gold; got != gold+game.LibraryMilestones[0].Reward.Gold {
		t.Fatalf("the first milestone paid %d", got-gold)
	}
	expectCode(t, learner.json("POST", "/api/game/library/claim", map[string]any{"words": 5}),
		http.StatusConflict, "claimed")
	expectCode(t, learner.json("POST", "/api/game/library/claim", map[string]any{"words": 15}),
		http.StatusConflict, "not_done")

	// Someone else's library is their own.
	other := h.login("other@example.com")
	h.openTown(t, other)
	if _, err := h.pool.Exec(context.Background(),
		`update game_profiles set main_step = $1 where user_id = (select id from users where email = 'other@example.com')`,
		game.LibraryStep); err != nil {
		t.Fatal(err)
	}
	if theirs := library(t, other); theirs.Donated != 0 || theirs.Available != 0 {
		t.Fatalf("another player's library: %+v", theirs)
	}
}

func TestTheDaysLetterAsksForSomethingToBeBrought(t *testing.T) {
	h := newHarness(t)
	learner := h.login("learner@example.com")
	h.openTown(t, learner)
	if s := expect[letterStateJSON](t, learner.json("GET", "/api/game/state", nil), http.StatusOK); s.Letter != nil {
		t.Fatal("a letter before the townsfolk write")
	}
	h.setStep(t, game.LetterStep)

	s := expect[letterStateJSON](t, learner.json("GET", "/api/game/state", nil), http.StatusOK)
	if s.Letter == nil || len(s.Letter.Body) == 0 || s.Letter.Done || s.Letter.Item != nil {
		t.Fatalf("the day's letter: %+v", s.Letter)
	}
	key := expect[struct {
		NPC  string `json:"npc"`
		Item string `json:"item"`
		Qty  int    `json:"qty"`
	}](t, learner.json("GET", "/api/test/game/letter", nil), http.StatusOK)
	if key.NPC != s.Letter.From.ID {
		t.Fatalf("the letter is from %s, the key says %s", s.Letter.From.ID, key.NPC)
	}
	var body string
	for _, line := range s.Letter.Body {
		body += line.En + " "
	}
	// The letter names what it wants: the last word of the item's name, near
	// enough ("cake" for "cakes").
	item, _ := game.ItemByID(key.Item)
	name := strings.Fields(strings.ToLower(item.Name.En))
	stem := name[len(name)-1]
	stem = stem[:min(4, len(stem))]
	if !strings.Contains(strings.ToLower(body), stem) {
		t.Fatalf("the letter does not name what it asks for (%s): %s", key.Item, body)
	}

	someoneElse := "elsa"
	if key.NPC == "elsa" {
		someoneElse = "hugo"
	}
	expectCode(t, learner.json("POST", "/api/game/letter/deliver", map[string]any{"npc": someoneElse}),
		http.StatusConflict, "not_the_writer")
	expectCode(t, learner.json("POST", "/api/game/letter/deliver", map[string]any{"npc": key.NPC}),
		http.StatusConflict, "no_item")
	// One short of what was asked is not enough either.
	h.giveItem(t, key.Item, key.Qty-1)
	if key.Qty > 1 {
		expectCode(t, learner.json("POST", "/api/game/letter/deliver", map[string]any{"npc": key.NPC}),
			http.StatusConflict, "no_item")
	}
	h.giveItem(t, key.Item, 2)

	before := townState(t, learner)
	done := expect[struct {
		Result struct {
			Gold   int        `json:"gold"`
			Points int        `json:"points"`
			Friend friendJSON `json:"friend"`
		} `json:"result"`
		State townStateJSON `json:"state"`
	}](t, learner.json("POST", "/api/game/letter/deliver", map[string]any{"npc": key.NPC}), http.StatusOK)
	if done.Result.Gold != s.Letter.Gold || done.State.Profile.Gold != before.Profile.Gold+s.Letter.Gold ||
		done.Result.Friend.Points != friend(before, key.NPC).Points+game.LetterPoints {
		t.Fatalf("the letter done: %+v", done.Result)
	}
	if left := done.State.Inventory[key.Item]; left != before.Inventory[key.Item]-key.Qty {
		t.Fatalf("%d %s left of %d, asked for %d", left, key.Item, before.Inventory[key.Item], key.Qty)
	}
	expectCode(t, learner.json("POST", "/api/game/letter/deliver", map[string]any{"npc": key.NPC}),
		http.StatusConflict, "letter_done")
	if s := expect[letterStateJSON](t, learner.json("GET", "/api/game/state", nil), http.StatusOK); s.Letter == nil || !s.Letter.Done {
		t.Fatalf("the letter after: %+v", s.Letter)
	}
	if q := gameQuests(t, learner); q.Main == nil || q.Main.ID != "first_letter" || !q.Main.Done {
		t.Fatalf("Elsa's letter step: %+v", q.Main)
	}
}

// giveItem puts some of something in every player's bag.
func (h *harness) giveItem(t *testing.T, item string, qty int) {
	t.Helper()
	if qty <= 0 {
		return
	}
	if _, err := h.pool.Exec(context.Background(), `
		insert into game_inventory (user_id, item, qty) select user_id, $1, $2 from game_profiles
		on conflict (user_id, item) do update set qty = game_inventory.qty + excluded.qty`, item, qty); err != nil {
		t.Fatalf("give %s: %v", item, err)
	}
}
