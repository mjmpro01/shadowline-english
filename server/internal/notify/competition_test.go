package notify

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/store"
)

// The weekly race's reminders: a close top three on the week's last evening, a
// medal won, and achievements nobody has seen.

func TestTheRaceRemindersKeepToTheirMoments(t *testing.T) {
	base := Input{RemindAt: 20 * 60, CompetitionOn: true, Reached: true, Sent: map[Kind]time.Time{}}
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
		{"a close race on the last evening", with(func(in *Input) {
			in.Local, in.WeekEndsToday, in.Racing = at("19:00"), true, true
		}), Rank},
		{"a close race, too early", with(func(in *Input) {
			in.Local, in.WeekEndsToday, in.Racing = at("18:59"), true, true
		}), ""},
		{"a close race, not the last day", with(func(in *Input) {
			in.Local, in.Racing = at("19:30"), true
		}), ""},
		{"a close race, turned off", with(func(in *Input) {
			in.Local, in.WeekEndsToday, in.Racing, in.CompetitionOn = at("19:30"), true, true, false
		}), ""},
		{"the race told of already", with(func(in *Input) {
			in.Local, in.WeekEndsToday, in.Racing = at("20:30"), true, true
			in.Sent[Rank] = at("19:00")
		}), ""},
		{"a race beats the goal", with(func(in *Input) {
			in.Local, in.WeekEndsToday, in.Racing, in.Reached = at("20:30"), true, true, false
		}), Rank},
		{"a streak beats the race", with(func(in *Input) {
			in.Local, in.WeekEndsToday, in.Racing, in.Reached = at("21:30"), true, true, false
			in.StreakOn, in.StreakCount = true, 4
		}), Streak},
		{"a medal, in the morning", with(func(in *Input) { in.Local, in.Medal = at("07:00"), 1 }), Medal},
		{"a medal, at night", with(func(in *Input) { in.Local, in.Medal = at("06:59"), 1 }), ""},
		{"a medal told of this week", with(func(in *Input) { in.Local, in.Medal, in.MedalSent = at("09:00"), 2, true }), ""},
		{"achievements waiting", with(func(in *Input) { in.Local, in.Achievements = at("12:00"), 2 }), Achievement},
		{"achievements, already told today", with(func(in *Input) {
			in.Local, in.Achievements = at("12:00"), 2
			in.Sent[Achievement] = at("09:00")
		}), ""},
		{"achievements, but two sent today", with(func(in *Input) {
			in.Local, in.Achievements = at("12:00"), 2
			in.Sent[Medal], in.Sent[NewEpisode] = at("07:00"), at("08:00")
		}), ""},
		{"achievements, turned off", with(func(in *Input) {
			in.Local, in.Achievements, in.CompetitionOn = at("12:00"), 2, false
		}), ""},
	}
	for _, c := range cases {
		got, ok := Next(c.in)
		if got != c.want || ok != (c.want != "") {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func (f *fixture) runAt(t *testing.T, when time.Time) []sent {
	t.Helper()
	f.clock = when
	f.mu.Lock()
	f.sent = nil
	f.mu.Unlock()
	if err := f.n.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	return f.sent
}

// quiet is a learner on the board but not on reminders: someone to race.
func (f *fixture) quiet(t *testing.T, email string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	if err := f.pool.QueryRow(context.Background(), `insert into users (email) values ($1) returning id`, email).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func (f *fixture) learn(t *testing.T, user uuid.UUID, kind string, times int, at time.Time) {
	t.Helper()
	for range times {
		if _, err := f.st.LogActivity(context.Background(), user, kind, at); err != nil {
			t.Fatal(err)
		}
	}
}

// 2026-11-20 is a Friday: the week runs Monday the 16th to Sunday the 22nd.
var (
	saturday = time.Date(2026, 11, 21, 19, 30, 0, 0, hanoi)
	sunday   = time.Date(2026, 11, 22, 19, 30, 0, 0, hanoi)
	monday   = time.Date(2026, 11, 23, 8, 0, 0, 0, hanoi)
	tuesday  = time.Date(2026, 11, 24, 8, 0, 0, 0, hanoi)
)

func TestTheWeeksLastEveningTellsThoseInACloseRace(t *testing.T) {
	f := newFixture(t)
	close := f.learner(t, "close@example.com")
	far := f.learner(t, "far@example.com")
	earlier := time.Date(2026, 11, 20, 9, 0, 0, 0, hanoi)
	for i, pts := range []int{40, 36, 34} { // 20, 18 and 17 takes
		f.learn(t, f.quiet(t, string(rune('a'+i))+"@board.example"), store.ActTake, pts/2, earlier)
	}
	f.learn(t, close, store.ActTake, 14, earlier) // 28 points: 6 behind third
	f.learn(t, far, store.ActReview, 1, earlier)  // 1 point: far behind

	if got := f.runAt(t, saturday); len(got) != 0 {
		t.Fatalf("not the last day yet: %+v", got)
	}
	got := f.runAt(t, sunday)
	if len(got) != 1 || !strings.HasSuffix(got[0].endpoint, "close@example.com") || got[0].note.Kind != string(Rank) ||
		!strings.Contains(got[0].note.Title, "Còn 6 điểm") {
		t.Fatalf("the close one: %+v", got)
	}
	// Later that evening the day's goal reminder may come; the race does not
	// come again.
	for _, s := range f.runAt(t, sunday.Add(30*time.Minute)) {
		if s.note.Kind == string(Rank) {
			t.Fatalf("told twice: %+v", s)
		}
	}
}

func TestAMedalIsToldOfOnMondayMorningOnce(t *testing.T) {
	f := newFixture(t)
	winner := f.learner(t, "winner@example.com")
	f.learn(t, winner, store.ActTake, 5, time.Date(2026, 11, 18, 9, 0, 0, 0, hanoi))

	// Nobody opens the board: the notifier settles the week itself.
	got := f.runAt(t, monday)
	if len(got) != 1 || got[0].note.Kind != string(Medal) || !strings.Contains(got[0].note.Title, "về nhất") ||
		!strings.HasPrefix(got[0].note.URL, "/profile?") {
		t.Fatalf("the medal: %+v", got)
	}
	var awarded int
	if err := f.pool.QueryRow(context.Background(), `select count(*) from weekly_awards where user_id = $1`, winner).Scan(&awarded); err != nil || awarded != 1 {
		t.Fatalf("awarded %d (%v)", awarded, err)
	}
	for _, s := range f.runAt(t, tuesday) {
		if s.note.Kind == string(Medal) {
			t.Fatalf("told again on Tuesday: %+v", s)
		}
	}
}

func TestAnUnseenAchievementIsPushedOnceAndASeenOneNever(t *testing.T) {
	f := newFixture(t)
	missed := f.learner(t, "missed@example.com")
	seen := f.learner(t, "seen@example.com")
	ctx := context.Background()
	unlocked := time.Date(2026, 11, 20, 9, 0, 0, 0, hanoi)
	for _, id := range []uuid.UUID{missed, seen} {
		if _, err := f.pool.Exec(ctx, `
			insert into learner_achievements (user_id, id, unlocked_at) values ($1, 'takes.1', $2)`, id, unlocked); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.st.MarkAchievementsSeen(ctx, seen, []string{"takes.1"}, unlocked); err != nil {
		t.Fatal(err)
	}

	if got := f.runAt(t, unlocked.Add(5*time.Minute)); len(got) != 0 {
		t.Fatalf("the app had no chance yet: %+v", got)
	}
	got := f.runAt(t, unlocked.Add(15*time.Minute))
	if len(got) != 1 || !strings.HasSuffix(got[0].endpoint, "missed@example.com") ||
		got[0].note.Title != "🏅 Thành tích mới: Bản ghi đầu tiên" || !strings.HasPrefix(got[0].note.URL, "/achievements?") {
		t.Fatalf("the missed one: %+v", got)
	}
	// The next day too: told once.
	for _, s := range f.runAt(t, unlocked.Add(25*time.Hour)) {
		if s.note.Kind == string(Achievement) {
			t.Fatalf("told again: %+v", s)
		}
	}
}

func TestTheRaceStaysQuietForThoseWhoTurnedItOff(t *testing.T) {
	f := newFixture(t)
	id := f.learner(t, "off@example.com")
	ctx := context.Background()
	prefs := store.DefaultReminderPrefs
	prefs.Enabled, prefs.Competition = true, false
	if err := f.st.SaveReminderPrefs(ctx, id, prefs); err != nil {
		t.Fatal(err)
	}
	f.learn(t, id, store.ActTake, 5, time.Date(2026, 11, 18, 9, 0, 0, 0, hanoi))
	if _, err := f.pool.Exec(ctx, `
		insert into learner_achievements (user_id, id, unlocked_at) values ($1, 'takes.1', '2026-11-18')`, id); err != nil {
		t.Fatal(err)
	}
	for _, s := range f.runAt(t, monday) {
		if s.note.Kind == string(Medal) || s.note.Kind == string(Achievement) {
			t.Fatalf("turned off, but: %+v", s)
		}
	}
}
