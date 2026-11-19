package notify

import (
	"testing"
	"time"
)

var hanoi = time.FixedZone("ICT", 7*60*60)

func at(hhmm string) time.Time {
	t, _ := time.Parse("15:04", hhmm)
	return time.Date(2026, 11, 20, t.Hour(), t.Minute(), 0, 0, hanoi)
}

func TestTheRulesSendLittleAndNeverAtNight(t *testing.T) {
	base := Input{RemindAt: 20 * 60, StreakOn: true, NewEpisodesOn: true, Sent: map[Kind]time.Time{}}
	with := func(f func(*Input)) Input {
		in := base
		in.Sent = map[Kind]time.Time{}
		f(&in)
		return in
	}
	cases := []struct {
		name string
		in   Input
		want Kind
	}{
		{"before the time chosen", with(func(in *Input) { in.Local = at("19:59") }), ""},
		{"the time chosen, goal not reached", with(func(in *Input) { in.Local = at("20:00") }), Goal},
		{"later the same evening, missed", with(func(in *Input) { in.Local = at("21:10") }), Goal},
		{"the goal reached", with(func(in *Input) { in.Local = at("20:30"); in.Reached = true }), ""},
		{"already sent today", with(func(in *Input) {
			in.Local = at("20:30")
			in.Sent[Goal] = at("20:00")
		}), ""},
		{"night", with(func(in *Input) { in.Local = at("22:00") }), ""},
		{"before morning", with(func(in *Input) { in.Local = at("06:59"); in.RemindAt = 6 * 60 }), ""},
		{"a streak at risk", with(func(in *Input) {
			in.Local = at("21:30")
			in.StreakCount = 5
			in.Sent[Goal] = at("19:00")
		}), Streak},
		{"a streak, but the goal reminder was just sent", with(func(in *Input) {
			in.Local = at("21:30")
			in.StreakCount = 5
			in.Sent[Goal] = at("20:00")
		}), ""},
		{"a streak of one is not worth a reminder", with(func(in *Input) {
			in.Local = at("21:30")
			in.StreakCount = 1
			in.Sent[Goal] = at("19:00")
		}), ""},
		{"a streak already kept today", with(func(in *Input) {
			in.Local = at("21:40")
			in.StreakCount = 5
			in.LearnedToday = true
			in.Reached = true
		}), ""},
		{"a streak, turned off", with(func(in *Input) {
			in.Local = at("21:30")
			in.StreakCount = 5
			in.StreakOn = false
			in.Sent[Goal] = at("19:00")
		}), ""},
		{"new episodes in the evening", with(func(in *Input) {
			in.Local = at("18:05")
			in.RemindAt = 21 * 60
			in.NewEpisodes = 2
		}), NewEpisode},
		{"new episodes even with the goal reached", with(func(in *Input) {
			in.Local = at("18:05")
			in.Reached = true
			in.NewEpisodes = 1
		}), NewEpisode},
		{"new episodes, turned off", with(func(in *Input) {
			in.Local = at("18:05")
			in.RemindAt = 21 * 60
			in.NewEpisodes = 1
			in.NewEpisodesOn = false
		}), ""},
		{"two a day at most", with(func(in *Input) {
			in.Local = at("21:45")
			in.StreakCount = 5
			in.Sent[Goal] = at("12:00")
			in.Sent[NewEpisode] = at("18:00")
		}), ""},
	}
	for _, c := range cases {
		got, ok := Next(c.in)
		if (c.want == "") == ok || got != c.want {
			t.Errorf("%s: got %q %v, want %q", c.name, got, ok, c.want)
		}
	}
}

func TestTheWordsAreTheLearnersLanguage(t *testing.T) {
	title, body := Words(Goal, "vi", Facts{PointsLeft: 12})
	if title == "" || body != "Còn 12 điểm nữa là đạt mục tiêu — 5 phút luyện là xong." {
		t.Fatalf("vi goal: %q %q", title, body)
	}
	if title, _ := Words(Streak, "en", Facts{Streak: 7}); title != "🔥 Your 7-day streak ends tonight" {
		t.Fatalf("en streak: %q", title)
	}
	if title, _ := Words(NewEpisode, "vi", Facts{Series: "Friends", SeriesCount: 1, Episodes: 2}); title != "Friends có 2 tập mới" {
		t.Fatalf("vi one series: %q", title)
	}
	if title, _ := Words(NewEpisode, "en", Facts{SeriesCount: 2, Episodes: 3}); title != "3 new episodes in series you follow" {
		t.Fatalf("en several series: %q", title)
	}
}
