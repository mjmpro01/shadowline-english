package api_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

// Dictation: a passage of consecutive lines from an episode, cut into phrases
// by the episode's transcript, and a record of how each go at it went.

type passageJSON struct {
	Episode struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"episode"`
	Clips []struct {
		ID              string  `json:"id"`
		DurationSeconds float64 `json:"durationSeconds"`
		Text            string  `json:"text"`
	} `json:"clips"`
	Chunks []struct {
		ClipID string  `json:"clipId"`
		Start  float64 `json:"start"`
		End    float64 `json:"end"`
		Text   string  `json:"text"`
	} `json:"chunks"`
	TotalSeconds float64 `json:"totalSeconds"`
}

type dictationJSON struct {
	ID           string `json:"id"`
	EpisodeTitle string `json:"episodeTitle"`
	FirstClipID  string `json:"firstClipId"`
	FirstLine    string `json:"firstLine"`
	Total        int    `json:"total"`
	Right        int    `json:"right"`
	Errors       struct {
		MissingEnding int `json:"missingEnding"`
		UnknownWord   int `json:"unknownWord"`
	} `json:"errors"`
	ReviewOn   string  `json:"reviewOn"`
	ReviewedAt *string `json:"reviewedAt"`
}

type dictationListJSON struct {
	Due    []dictationJSON `json:"due"`
	Recent []dictationJSON `json:"recent"`
}

var lines = []string{
	"I wake up early every morning, and I make a cup of tea.",
	"Then I walk to the station and take the train to work.",
	"My office is on the tenth floor of a tall building.",
	"At lunch I eat a sandwich in the park with my friends.",
	"In the evening I cook dinner and read a book before bed.",
}

// anEpisode publishes five ten-second lines cut from one recording, with their
// sound, and the recording's transcript: one word every 0.6 s of each line.
func anEpisode(t *testing.T, h *harness, admin *client) []clipJSON {
	t.Helper()
	source := uploadSource(t, admin, "a-day.mp4")
	var clips []map[string]any
	var words []string
	for i, text := range lines {
		clip := inPlaylist(fmt.Sprintf("Line %d", i+1), "Days")
		clip["sourceId"] = source.ID
		clip["startSeconds"] = float64(i * 10)
		clip["endSeconds"] = float64(i*10 + 10)
		clip["durationSeconds"] = 10.0
		clip["captions"] = []map[string]string{{"text": text, "ipa": ""}}
		clips = append(clips, clip)
		for j, w := range strings.Fields(text) {
			at := float64(i*10) + 0.3 + float64(j)*0.6
			words = append(words, fmt.Sprintf(`{"start": %.2f, "end": %.2f, "text": %q, "ipa": ""}`, at, at+0.45, w))
		}
	}
	created := publishClips(t, admin, clips...)
	for _, c := range created {
		h.cutSound(t, c.ID)
	}
	if _, err := h.pool.Exec(context.Background(), `
		insert into transcripts (source_id, words, language) values ($1, $2, 'en')`,
		source.ID, []byte("["+strings.Join(words, ",")+"]")); err != nil {
		t.Fatalf("store transcript: %v", err)
	}
	return created
}

func TestADictationIsConsecutiveLinesCutIntoPhrases(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clips := anEpisode(t, h, admin)
	learner := h.login("learner@example.com")

	p := expect[passageJSON](t, learner.json("GET", "/api/dictation/"+clips[1].ID, nil), http.StatusOK)
	if len(p.Clips) != 3 || p.Clips[0].ID != clips[1].ID || p.TotalSeconds != 30 || p.Episode.Title != "a-day.mp4" {
		t.Fatalf("a passage from the second line: %d lines, %.0f s, %+v", len(p.Clips), p.TotalSeconds, p.Episode)
	}
	byClip := map[string][]string{}
	for _, ch := range p.Chunks {
		if length := ch.End - ch.Start; length < 2 || length > 7.5 {
			t.Errorf("a piece of %.1f s: %q", length, ch.Text)
		}
		byClip[ch.ClipID] = append(byClip[ch.ClipID], ch.Text)
	}
	for i, c := range p.Clips {
		if got := strings.Join(byClip[c.ID], " "); got != lines[i+1] {
			t.Errorf("line %d in pieces says %q", i+2, got)
		}
	}
	// Lines of eight seconds of speech are more than one phrase each.
	if len(p.Chunks) <= len(p.Clips) {
		t.Fatalf("%d lines in only %d pieces", len(p.Clips), len(p.Chunks))
	}

	expectStatus(t, learner.json("GET", "/api/dictation/00000000-0000-0000-0000-000000000000", nil), http.StatusNotFound)
	// A line published without a recording has no episode to run on in.
	loose := publishClips(t, admin, aClip("On its own"))[0]
	expectStatus(t, learner.json("GET", "/api/dictation/"+loose.ID, nil), http.StatusNotFound)
}

func TestADictationIsKeptAndComesBackTomorrow(t *testing.T) {
	h := newHarness(t)
	admin := h.login("admin@example.com")
	clips := anEpisode(t, h, admin)
	learner := h.login("learner@example.com")

	saved := expect[dictationJSON](t, learner.json("POST", "/api/dictations", map[string]any{
		"firstClipId": clips[0].ID,
		"clipIds":     []string{clips[0].ID, clips[1].ID, clips[2].ID},
		"total":       36,
		"right":       30,
		"errors":      map[string]int{"missingEnding": 2, "unknownWord": 1},
	}), http.StatusCreated)
	if saved.Total != 36 || saved.Right != 30 || saved.Errors.MissingEnding != 2 || saved.FirstLine != lines[0] ||
		saved.EpisodeTitle != "a-day.mp4" || saved.ReviewOn == "" || saved.ReviewedAt != nil {
		t.Fatalf("the dictation kept: %+v", saved)
	}
	list := expect[dictationListJSON](t, learner.json("GET", "/api/dictations", nil), http.StatusOK)
	if len(list.Due) != 0 || len(list.Recent) != 1 {
		t.Fatalf("today, with tomorrow's review: %+v", list)
	}

	expectStatus(t, learner.json("POST", "/api/test/dictations/due", nil), http.StatusNoContent)
	list = expect[dictationListJSON](t, learner.json("GET", "/api/dictations", nil), http.StatusOK)
	if len(list.Due) != 1 || list.Due[0].ID != saved.ID {
		t.Fatalf("on the day it is due: %+v", list.Due)
	}

	// Someone else's dictation is not theirs to mark, nor to see.
	other := h.login("other@example.com")
	expectStatus(t, other.json("POST", "/api/dictations/"+saved.ID+"/review", nil), http.StatusNotFound)
	if theirs := expect[dictationListJSON](t, other.json("GET", "/api/dictations", nil), http.StatusOK); len(theirs.Recent) != 0 {
		t.Fatalf("another learner sees %+v", theirs.Recent)
	}

	expectStatus(t, learner.json("POST", "/api/dictations/"+saved.ID+"/review", nil), http.StatusNoContent)
	list = expect[dictationListJSON](t, learner.json("GET", "/api/dictations", nil), http.StatusOK)
	if len(list.Due) != 0 || list.Recent[0].ReviewedAt == nil {
		t.Fatalf("after listening again: %+v", list)
	}

	// Nonsense is refused.
	expectStatus(t, learner.json("POST", "/api/dictations", map[string]any{
		"firstClipId": clips[0].ID, "clipIds": []string{clips[0].ID}, "total": 3, "right": 5,
	}), http.StatusBadRequest)
}
