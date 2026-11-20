package store

import (
	"testing"
	"time"
)

func TestAWeekRunsMondayToMondayOnVietnamsClock(t *testing.T) {
	cases := []struct {
		at    time.Time
		start string
	}{
		// Sunday 23:59 in Hanoi is still the week that began on the 16th.
		{time.Date(2026, 11, 22, 23, 59, 0, 0, vietnamZone), "2026-11-16"},
		// Monday 00:00 starts the next.
		{time.Date(2026, 11, 23, 0, 0, 0, 0, vietnamZone), "2026-11-23"},
		// Sunday 17:30 UTC is already Monday 00:30 in Hanoi.
		{time.Date(2026, 11, 22, 17, 30, 0, 0, time.UTC), "2026-11-23"},
		// A Wednesday.
		{time.Date(2026, 11, 18, 9, 0, 0, 0, vietnamZone), "2026-11-16"},
	}
	for _, c := range cases {
		start, end := WeekOf(c.at)
		if got := start.Format(dayLayout); got != c.start {
			t.Errorf("%v: week of %s, want %s", c.at, got, c.start)
		}
		if end.Sub(start) != 7*24*time.Hour {
			t.Errorf("%v: a week of %v", c.at, end.Sub(start))
		}
	}
}
