package store

import "testing"

func TestAStreakGrowsADayAtATime(t *testing.T) {
	var s Streak
	s = s.Advance("2026-11-01")
	if s.Count != 1 || s.LastDay != "2026-11-01" {
		t.Fatalf("first day: %+v", s)
	}
	if again := s.Advance("2026-11-01"); again != s {
		t.Fatalf("the same day twice: %+v", again)
	}
	s = s.Advance("2026-11-02")
	if s.Count != 2 || s.Best != 2 {
		t.Fatalf("the next day: %+v", s)
	}
	// Two days missed with no freeze: it starts again, the best is kept.
	s = s.Advance("2026-11-05")
	if s.Count != 1 || s.Best != 2 {
		t.Fatalf("after a gap: %+v", s)
	}
}

func TestAWeekEarnsAFreezeThatCoversAMissedDay(t *testing.T) {
	var s Streak
	for d := 1; d <= 7; d++ {
		s = s.Advance("2026-11-0" + string(rune('0'+d)))
	}
	if s.Count != 7 || s.Freezes != 1 {
		t.Fatalf("a week: %+v", s)
	}
	// The 8th missed, the 9th kept: the freeze is spent.
	count, today, atRisk := s.Standing("2026-11-09")
	if count != 7 || today || !atRisk {
		t.Fatalf("standing over a missed day: %d %v %v", count, today, atRisk)
	}
	s = s.Advance("2026-11-09")
	if s.Count != 8 || s.Freezes != 0 {
		t.Fatalf("a missed day covered: %+v", s)
	}
	// With no freeze left, the next gap ends it.
	if count, _, _ := s.Standing("2026-11-11"); count != 0 {
		t.Fatalf("standing after an uncovered gap: %d", count)
	}
}

func TestFreezesAreCapped(t *testing.T) {
	s := Streak{Count: 20, Best: 20, Freezes: MaxFreezes, LastDay: "2026-11-20"}
	s = s.Advance("2026-11-21")
	if s.Count != 21 || s.Freezes != MaxFreezes {
		t.Fatalf("at the cap: %+v", s)
	}
}

func TestAStreakStandsUntilADayIsMissed(t *testing.T) {
	s := Streak{Count: 3, Best: 3, LastDay: "2026-11-10"}
	if count, today, atRisk := s.Standing("2026-11-10"); count != 3 || !today || atRisk {
		t.Fatalf("today done: %d %v %v", count, today, atRisk)
	}
	if count, today, atRisk := s.Standing("2026-11-11"); count != 3 || today || !atRisk {
		t.Fatalf("tomorrow, nothing yet: %d %v %v", count, today, atRisk)
	}
	if count, _, _ := (Streak{}).Standing("2026-11-11"); count != 0 {
		t.Fatal("no learning, no streak")
	}
}

func TestAStreakIsRebuiltFromTheDaysLearned(t *testing.T) {
	s := streakFromDays([]string{"2026-11-10", "2026-11-09", "2026-11-08", "2026-11-01", "2026-10-31"})
	if s.Count != 3 || s.Best != 3 || s.LastDay != "2026-11-10" {
		t.Fatalf("%+v", s)
	}
}
