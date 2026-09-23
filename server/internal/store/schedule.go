package store

import "time"

// Ladder is how far ahead a word goes each time it is recalled, in days.
//
// A fixed ladder rather than SM-2's ease factor, because the card has two
// buttons. Ease is worth computing when a learner can say *how* hard a word
// was; with "got it" and "still learning" there is nothing to compute it from,
// and an ease derived from two answers is a number that looks measured and is
// not.
//
// The steps are the usual expanding ones — a day, then a few, then a week,
// then a month — and they stop growing at four months. A word recalled after
// four months is a word somebody knows; asking again in a year would be
// technically optimal and would also mean the app quietly stopped being part
// of their week.
var Ladder = []int{1, 3, 7, 14, 30, 60, 120}

// Schedule is where a card goes next.
type Schedule struct {
	IntervalDays int
	DueAt        time.Time
}

// Recalled moves a card one step up the ladder.
func Recalled(current int, now time.Time) Schedule {
	next := Ladder[0]
	for _, step := range Ladder {
		if step > current {
			next = step
			break
		}
		next = step
	}
	return Schedule{IntervalDays: next, DueAt: now.AddDate(0, 0, next)}
}

// Forgotten puts a card back at the front. Not one step down: a word that has
// gone is gone, and walking it back through a month and a fortnight would ask
// about it next in two weeks.
func Forgotten(now time.Time) Schedule {
	return Schedule{IntervalDays: 0, DueAt: now}
}

// Retired is where a card goes when the learner marks it known by hand, in the
// list rather than in practice.
//
// That tap is not a recall — nothing was tested — so it does not climb the
// ladder. It is an instruction about the deck: stop asking me. The top of the
// ladder is what that means, and the card still comes back eventually, because
// "I know this" and "I will still know this in four months" are different
// claims.
func Retired(now time.Time) Schedule {
	top := Ladder[len(Ladder)-1]
	return Schedule{IntervalDays: top, DueAt: now.AddDate(0, 0, top)}
}
