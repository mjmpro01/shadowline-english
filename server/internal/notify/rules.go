// Package notify sends study reminders by Web Push: when a learner has not
// reached the day's goal by the time they chose, when a streak is about to
// end, and when a series they follow has new episodes. It sends little and
// never at night: a reminder that annoys is one that gets turned off.
package notify

import "time"

// Kind is what a reminder is about.
type Kind string

const (
	Goal       Kind = "goal"
	Streak     Kind = "streak"
	NewEpisode Kind = "new_episode"
	Test       Kind = "test"
	// Rank is the week's last evening, a top-three place close to won or lost.
	Rank Kind = "rank"
	// Medal is a place in last week's top three.
	Medal Kind = "medal"
	// Achievement is milestones unlocked that the learner has not seen.
	Achievement Kind = "achievement"
)

// The day's shape, in minutes after the learner's own midnight.
const (
	// QuietFrom and QuietUntil bound the night: nothing is sent between.
	QuietFrom  = 22 * 60
	QuietUntil = 7 * 60
	// StreakAt is when a streak with nothing done today is worth saving.
	StreakAt = 21*60 + 30
	// NewAt is when new episodes are told of: the evening, once.
	NewAt = 18 * 60
	// RankAt is when, on the week's last day, a close race is worth a word:
	// early enough in the evening to still do something about it.
	RankAt = 19 * 60
	// MaxPerDay is the most reminders a learner gets in a day.
	MaxPerDay = 2
	// Gap is how long after one of goal or streak the other waits.
	Gap = 2 * time.Hour
)

// Input is one learner, as the rules see them.
type Input struct {
	// Local is now in the learner's own time zone.
	Local time.Time
	// RemindAt is when the learner asked to be reminded, in minutes.
	RemindAt      int
	StreakOn      bool
	NewEpisodesOn bool
	Reached       bool
	StreakCount   int
	LearnedToday  bool
	NewEpisodes   int
	// CompetitionOn is the weekly race's reminders: rank, medal, achievement.
	CompetitionOn bool
	// WeekEndsToday is the board's week ending at the coming midnight
	// (Vietnam's clock, as the board keeps it).
	WeekEndsToday bool
	// Racing is a top-three place close to won or lost this week.
	Racing bool
	// Medal is the place the learner finished last week, 0 for none, and
	// MedalSent whether it was already told of this week.
	Medal     int
	MedalSent bool
	// Achievements is how many unlocked milestones wait unseen and untold.
	Achievements int
	// Sent is what was already sent on the learner's day, and when.
	Sent map[Kind]time.Time
}

// Next is the reminder to send now, if any: at most one at a time, the most
// urgent first. The window for each is "its moment has passed today and it has
// not been sent", not one exact minute, so a notifier that was down for a
// while sends what it missed when it comes back, unless night has fallen.
func Next(in Input) (Kind, bool) {
	minute := in.Local.Hour()*60 + in.Local.Minute()
	if minute >= QuietFrom || minute < QuietUntil {
		return "", false
	}
	if len(in.Sent) >= MaxPerDay {
		return "", false
	}
	_, sentGoal := in.Sent[Goal]
	_, sentStreak := in.Sent[Streak]
	_, sentNew := in.Sent[NewEpisode]
	_, sentRank := in.Sent[Rank]
	_, sentAchievement := in.Sent[Achievement]
	recently := func(k Kind) bool {
		at, ok := in.Sent[k]
		return ok && in.Local.Sub(at) < Gap
	}

	if in.StreakOn && !sentStreak && minute >= StreakAt && in.StreakCount >= 2 && !in.LearnedToday && !recently(Goal) {
		return Streak, true
	}
	if in.CompetitionOn && !sentRank && in.WeekEndsToday && minute >= RankAt && in.Racing {
		return Rank, true
	}
	if !sentGoal && minute >= in.RemindAt && !in.Reached && !recently(Streak) {
		return Goal, true
	}
	if in.CompetitionOn && in.Medal > 0 && !in.MedalSent {
		return Medal, true
	}
	if in.CompetitionOn && !sentAchievement && in.Achievements > 0 {
		return Achievement, true
	}
	if in.NewEpisodesOn && !sentNew && minute >= NewAt && in.NewEpisodes > 0 {
		return NewEpisode, true
	}
	return "", false
}
