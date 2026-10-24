package api_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

// Dialogues: short conversations a learner hears, reads aloud line by line
// until they know them, and copies phrases from into a phrasebook of their own.

type dialogueLineJSON struct {
	Speaker string `json:"speaker"`
	Name    string `json:"name"`
	Text    string `json:"text"`
	Vi      string `json:"vi"`
}

type dialogueJSON struct {
	ID        string             `json:"id"`
	Slug      string             `json:"slug"`
	Title     string             `json:"title"`
	Level     string             `json:"level"`
	Lines     []dialogueLineJSON `json:"lines"`
	Published bool               `json:"published"`
	Passes    []struct {
		Passes int     `json:"passes"`
		Best   float64 `json:"best"`
	} `json:"passes"`
	Goal int `json:"goal"`
}

type dialogueSummaryJSON struct {
	ID    string `json:"id"`
	Slug  string `json:"slug"`
	Title string `json:"title"`
	Lines int    `json:"lines"`
	Known int    `json:"known"`
}

type phraseJSON struct {
	ID         string  `json:"id"`
	DialogueID *string `json:"dialogueId"`
	Situation  string  `json:"situation"`
	Phrase     string  `json:"phrase"`
	Note       string  `json:"note"`
}

func aDialogue(fields map[string]any) map[string]any {
	out := map[string]any{
		"title": "At the bakery", "situation": "Bạn mua bánh.", "topic": "Food", "level": "A1",
		"published": true,
		"lines": []map[string]string{
			{"speaker": "A", "name": "Baker", "text": "Morning! What can I get you?", "vi": "Chào buổi sáng!"},
			{"speaker": "B", "name": "You", "text": "Two croissants, please.", "vi": "Cho tôi hai bánh sừng bò."},
			{"speaker": "A", "name": "Baker", "text": "Anything else?", "vi": "Còn gì nữa không?"},
		},
		"phrases": []map[string]string{{"phrase": "Anything else?", "note": "Người bán hỏi thêm."}},
	}
	for k, v := range fields {
		out[k] = v
	}
	return out
}

func seedDialogues(t *testing.T, h *harness) {
	t.Helper()
	if err := h.store.SeedStarterDialogues(context.Background()); err != nil {
		t.Fatal(err)
	}
}

// The starters are there to choose from, each opening by its slug.
func TestTheStarterDialoguesAreThereToLearn(t *testing.T) {
	h := newHarness(t)
	seedDialogues(t, h)
	learner := h.login("learner@example.com")

	list := expect[[]dialogueSummaryJSON](t, learner.do("GET", "/api/dialogues", "", nil), http.StatusOK)
	if len(list) != 10 || list[0].Title != "Ordering a coffee" || list[0].Known != 0 || list[0].Lines < 6 {
		t.Fatalf("got %+v", list)
	}
	d := expect[dialogueJSON](t, learner.do("GET", "/api/dialogues/"+list[0].Slug, "", nil), http.StatusOK)
	if d.ID != list[0].ID || len(d.Passes) != len(d.Lines) || d.Goal != 5 {
		t.Fatalf("got %+v", d)
	}
	byID := expect[dialogueJSON](t, learner.do("GET", "/api/dialogues/"+d.ID, "", nil), http.StatusOK)
	if byID.Slug != d.Slug {
		t.Fatalf("by id: got %q", byID.Slug)
	}
}

// A draft is the console's alone.
func TestALearnerSeesOnlyPublishedDialogues(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	draft := expect[dialogueJSON](t, admin.json("POST", "/api/admin/dialogues",
		aDialogue(map[string]any{"published": false})), http.StatusCreated)

	if list := expect[[]dialogueSummaryJSON](t, learner.do("GET", "/api/dialogues", "", nil), http.StatusOK); len(list) != 0 {
		t.Fatalf("a draft is listed: %+v", list)
	}
	expectStatus(t, learner.do("GET", "/api/dialogues/"+draft.Slug, "", nil), http.StatusNotFound)
	expectStatus(t, learner.json("POST", "/api/dialogues/"+draft.ID+"/pass", map[string]int{"line": 0}), http.StatusNotFound)
	all := expect[[]dialogueJSON](t, admin.do("GET", "/api/admin/dialogues", "", nil), http.StatusOK)
	if len(all) != 1 || all[0].Published {
		t.Fatalf("the console: %+v", all)
	}

	draft.Published = true
	in := aDialogue(nil)
	expect[dialogueJSON](t, admin.json("PUT", "/api/admin/dialogues/"+draft.ID, in), http.StatusOK)
	if list := expect[[]dialogueSummaryJSON](t, learner.do("GET", "/api/dialogues", "", nil), http.StatusOK); len(list) != 1 {
		t.Fatalf("published, but not listed: %+v", list)
	}
}

// Each reading aloud is counted, and the most of a line ever heard is kept.
func TestReadingsAloudAddUp(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	other := h.login("other@example.com")
	d := expect[dialogueJSON](t, admin.json("POST", "/api/admin/dialogues", aDialogue(nil)), http.StatusCreated)
	pass := "/api/dialogues/" + d.ID + "/pass"

	for i, read := range []map[string]int{
		{"line": 1, "heard": 2, "total": 3},
		{"line": 1, "heard": 3, "total": 3},
		{"line": 1, "heard": 1, "total": 3},
		// A browser that cannot listen counts the reading on the learner's word.
		{"line": 1},
	} {
		got := expect[struct {
			Passes int     `json:"passes"`
			Best   float64 `json:"best"`
		}](t, learner.json("POST", pass, read), http.StatusOK)
		if got.Passes != i+1 || (i >= 1 && got.Best != 1) {
			t.Fatalf("reading %d: got %+v", i+1, got)
		}
	}
	for range 4 {
		expectStatus(t, learner.json("POST", pass, map[string]int{"line": 0}), http.StatusOK)
	}
	expectCode(t, learner.json("POST", pass, map[string]int{"line": 3}), http.StatusBadRequest, "dialogue.invalid")
	expectCode(t, learner.json("POST", pass, map[string]int{"line": 0, "heard": 4, "total": 3}), http.StatusBadRequest, "dialogue.invalid")

	mine := expect[dialogueJSON](t, learner.do("GET", "/api/dialogues/"+d.ID, "", nil), http.StatusOK)
	if mine.Passes[0].Passes != 4 || mine.Passes[1].Passes != 4 || mine.Passes[2].Passes != 0 {
		t.Fatalf("got %+v", mine.Passes)
	}
	// Four is not yet the five to know a line by.
	list := expect[[]dialogueSummaryJSON](t, learner.do("GET", "/api/dialogues", "", nil), http.StatusOK)
	if list[0].Known != 0 {
		t.Fatalf("known after four: %+v", list[0])
	}
	expectStatus(t, learner.json("POST", pass, map[string]int{"line": 1}), http.StatusOK)
	list = expect[[]dialogueSummaryJSON](t, learner.do("GET", "/api/dialogues", "", nil), http.StatusOK)
	if list[0].Known != 1 {
		t.Fatalf("known after five: %+v", list[0])
	}
	theirs := expect[dialogueJSON](t, other.do("GET", "/api/dialogues/"+d.ID, "", nil), http.StatusOK)
	if theirs.Passes[1].Passes != 0 {
		t.Fatalf("another learner sees these readings: %+v", theirs.Passes)
	}

	// A line edited away takes its readings with it.
	expectStatus(t, learner.json("POST", pass, map[string]int{"line": 2}), http.StatusOK)
	shorter := aDialogue(nil)
	shorter["lines"] = shorter["lines"].([]map[string]string)[:2]
	expect[dialogueJSON](t, admin.json("PUT", "/api/admin/dialogues/"+d.ID, shorter), http.StatusOK)
	var left int
	if err := h.pool.QueryRow(context.Background(),
		`select count(*) from dialogue_passes where dialogue_id = $1`, d.ID).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 2 {
		t.Fatalf("%d lines with readings left, want the 2 still there", left)
	}
}

// A phrasebook is its learner's: written, rewritten and torn out by them alone.
func TestAPhrasebookIsItsLearners(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")
	other := h.login("other@example.com")
	d := expect[dialogueJSON](t, admin.json("POST", "/api/admin/dialogues", aDialogue(nil)), http.StatusCreated)

	saved := expect[phraseJSON](t, learner.json("POST", "/api/phrasebook", map[string]any{
		"dialogueId": d.ID, "situation": "  At the bakery ", "phrase": "Anything else?", "note": "",
	}), http.StatusCreated)
	if saved.Situation != "At the bakery" || saved.DialogueID == nil || *saved.DialogueID != d.ID {
		t.Fatalf("got %+v", saved)
	}
	expect[phraseJSON](t, learner.json("POST", "/api/phrasebook", map[string]any{"phrase": "See you!"}), http.StatusCreated)
	expectCode(t, learner.json("POST", "/api/phrasebook", map[string]any{"phrase": "  "}), http.StatusBadRequest, "dialogue.invalid")

	edited := expect[phraseJSON](t, learner.json("PATCH", "/api/phrasebook/"+saved.ID, map[string]any{
		"situation": "At the bakery", "phrase": "Anything else?", "note": "Hỏi thêm, giọng thân thiện.",
	}), http.StatusOK)
	if edited.Note != "Hỏi thêm, giọng thân thiện." {
		t.Fatalf("got %+v", edited)
	}

	if theirs := expect[[]phraseJSON](t, other.do("GET", "/api/phrasebook", "", nil), http.StatusOK); len(theirs) != 0 {
		t.Fatalf("another learner's phrasebook: %+v", theirs)
	}
	expectStatus(t, other.json("PATCH", "/api/phrasebook/"+saved.ID, map[string]any{"phrase": "Mine now"}), http.StatusNotFound)
	expectStatus(t, other.do("DELETE", "/api/phrasebook/"+saved.ID, "", nil), http.StatusNotFound)

	// The dialogue going does not take what was copied from it.
	expectStatus(t, admin.do("DELETE", "/api/admin/dialogues/"+d.ID, "", nil), http.StatusNoContent)
	book := expect[[]phraseJSON](t, learner.do("GET", "/api/phrasebook", "", nil), http.StatusOK)
	if len(book) != 2 || book[0].Phrase != "See you!" || book[1].DialogueID != nil {
		t.Fatalf("got %+v", book)
	}
	expectStatus(t, learner.do("DELETE", "/api/phrasebook/"+saved.ID, "", nil), http.StatusNoContent)
	if book := expect[[]phraseJSON](t, learner.do("GET", "/api/phrasebook", "", nil), http.StatusOK); len(book) != 1 {
		t.Fatalf("after deleting: %+v", book)
	}
}

// What the console sends is checked before it is kept.
func TestTheConsoleKeepsOnlyDialoguesThatHold(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	learner := h.login("learner@example.com")

	expectStatus(t, learner.json("POST", "/api/admin/dialogues", aDialogue(nil)), http.StatusForbidden)
	oneSided := aDialogue(nil)
	oneSided["lines"] = []map[string]string{{"speaker": "A", "text": "Hi."}, {"speaker": "A", "text": "Hello?"}}
	expectCode(t, admin.json("POST", "/api/admin/dialogues", oneSided), http.StatusBadRequest, "dialogue.invalid")
	expectCode(t, admin.json("POST", "/api/admin/dialogues", aDialogue(map[string]any{"title": " "})), http.StatusBadRequest, "dialogue.invalid")

	// Two of one name get two addresses.
	first := expect[dialogueJSON](t, admin.json("POST", "/api/admin/dialogues", aDialogue(nil)), http.StatusCreated)
	second := expect[dialogueJSON](t, admin.json("POST", "/api/admin/dialogues", aDialogue(nil)), http.StatusCreated)
	if first.Slug != "at-the-bakery" || second.Slug == first.Slug || !strings.HasPrefix(second.Slug, "at-the-bakery") {
		t.Fatalf("slugs %q and %q", first.Slug, second.Slug)
	}
	expectStatus(t, admin.do("DELETE", "/api/admin/dialogues/"+first.ID, "", nil), http.StatusNoContent)
	expectStatus(t, admin.do("DELETE", "/api/admin/dialogues/"+first.ID, "", nil), http.StatusNotFound)
	expectStatus(t, admin.json("PUT", "/api/admin/dialogues/"+first.ID, aDialogue(nil)), http.StatusNotFound)
}

const drafted = `Sure! {"title": "At the pharmacy", "situation": "Bạn mua thuốc ở hiệu thuốc.", "topic": "Health", "lines": [
	{"speaker": "A", "name": "Pharmacist", "text": "Hi, how can I help?", "vi": "Chào bạn, tôi giúp gì được?"},
	{"speaker": "B", "name": "You", "text": "Do you have something for a headache?", "vi": "Bạn có thuốc đau đầu không?"}],
	"phrases": [{"phrase": "Do you have something for …?", "note": "Hỏi mua thuốc."}]}`

// The tutor writes a first draft for the console to edit; nothing is kept but
// what it cost.
func TestTheTutorDraftsADialogue(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	draft := map[string]string{"situation": "Buying medicine at a pharmacy", "level": "B1"}
	expectCode(t, admin.json("POST", "/api/admin/dialogues/draft", draft), http.StatusServiceUnavailable, "tutor.unavailable")

	fake := withTutor(t, h, 0)
	fake.answer = []string{drafted[:40], drafted[40:]}
	learner := h.login("learner@example.com")
	expectStatus(t, learner.json("POST", "/api/admin/dialogues/draft", draft), http.StatusForbidden)

	got := expect[struct {
		Title     string             `json:"title"`
		Situation string             `json:"situation"`
		Level     string             `json:"level"`
		Lines     []dialogueLineJSON `json:"lines"`
		Published bool               `json:"published"`
	}](t, admin.json("POST", "/api/admin/dialogues/draft", draft), http.StatusOK)
	if got.Title != "At the pharmacy" || got.Situation != "Bạn mua thuốc ở hiệu thuốc." || got.Level != "B1" ||
		len(got.Lines) != 2 || got.Lines[1].Name != "You" || got.Published {
		t.Fatalf("got %+v", got)
	}
	sent := fake.last(t)
	if !strings.Contains(sent[0].Content, "CEFR level B1") || !strings.Contains(sent[1].Content, "pharmacy") {
		t.Fatalf("the tutor was asked %+v", sent)
	}
	if all := expect[[]dialogueJSON](t, admin.do("GET", "/api/admin/dialogues", "", nil), http.StatusOK); len(all) != 0 {
		t.Fatalf("a draft was kept: %+v", all)
	}
	var asked, tokens int
	if err := h.pool.QueryRow(context.Background(),
		`select count(*), coalesce(sum(completion_tokens), 0) from tutor_questions where outcome = 'answered'`).
		Scan(&asked, &tokens); err != nil {
		t.Fatal(err)
	}
	if asked != 1 || tokens != 40 {
		t.Fatalf("recorded %d questions, %d tokens", asked, tokens)
	}

	fake.answer = []string{"I'd rather not."}
	expectCode(t, admin.json("POST", "/api/admin/dialogues/draft", draft), http.StatusBadGateway, "tutor.badDraft")
	expectCode(t, admin.json("POST", "/api/admin/dialogues/draft", map[string]string{"situation": " "}),
		http.StatusBadRequest, "dialogue.invalid")
	expectCode(t, admin.json("POST", "/api/admin/dialogues/draft", map[string]string{"situation": "x", "level": "C2"}),
		http.StatusBadRequest, "dialogue.invalid")
}
