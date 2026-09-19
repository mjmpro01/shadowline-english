package api

import "testing"

// A browser hands back an empty `file.type` for .mkv, .m4v, .ts and half a
// dozen other containers, which reaches the server as application/octet-stream.
// Filing those as audio meant no cut was ever queued and every clip published
// from them reached its learner with no picture — silently, because as far as
// the app was concerned nothing had gone wrong.
func TestAVideoIsRecognisedEvenWhenTheBrowserHasNoTypeForIt(t *testing.T) {
	cases := []struct {
		contentType string
		name        string
		want        bool
	}{
		{"video/mp4", "lesson.mp4", true},
		{"video/webm", "lesson.webm", true},
		// The ones that started this.
		{"application/octet-stream", "lesson.mkv", true},
		{"application/octet-stream", "lesson.m4v", true},
		{"application/octet-stream", "interview.MOV", true},
		{"", "episode.ts", true},
		// An audio type is trusted over any name: somebody who uploads
		// `song.mp4.mp3` has uploaded an mp3.
		{"audio/mpeg", "song.mp4.mp3", false},
		{"audio/wav", "lesson.wav", false},
		// Nothing to go on either way.
		{"application/octet-stream", "lesson", false},
		{"application/octet-stream", "notes.txt", false},
	}
	for _, c := range cases {
		if got := looksLikeVideo(c.contentType, c.name); got != c.want {
			t.Errorf("looksLikeVideo(%q, %q) = %v, want %v", c.contentType, c.name, got, c.want)
		}
	}
}
