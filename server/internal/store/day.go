package store

import "time"

// VietnamDay is the day now falls in on Vietnam's clock, and when it starts
// and ends: the day every daily thing counts in (the goal, the streak,
// dictation reviews, the console's figures).
func VietnamDay(now time.Time) (day string, start, end time.Time) {
	local := now.In(vietnamZone)
	start = time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, vietnamZone)
	return start.Format(dayLayout), start, start.AddDate(0, 0, 1)
}
