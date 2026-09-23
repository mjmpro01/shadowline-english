package store

import (
	"testing"
	"time"
)

var when = time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)

func TestAFirstRecallAsksAgainTomorrow(t *testing.T) {
	got := Recalled(0, when)
	if got.IntervalDays != 1 || !got.DueAt.Equal(when.AddDate(0, 0, 1)) {
		t.Fatalf("a new word went to %+v", got)
	}
}

func TestEachRecallAsksLaterThanTheLast(t *testing.T) {
	interval := 0
	for i := 1; i < len(Ladder); i++ {
		next := Recalled(interval, when)
		if next.IntervalDays <= interval {
			t.Fatalf("step %d did not grow: %d then %d", i, interval, next.IntervalDays)
		}
		interval = next.IntervalDays
	}
}

func TestTheLadderStopsGrowing(t *testing.T) {
	top := Ladder[len(Ladder)-1]
	if got := Recalled(top, when); got.IntervalDays != top {
		t.Fatalf("past the top of the ladder the interval became %d, want %d", got.IntervalDays, top)
	}
}

// An interval that is not one of the steps — from a backfill, or from a ladder
// that was shorter when the card was last seen — still has a next step.
func TestAnIntervalBetweenStepsTakesTheNextOneUp(t *testing.T) {
	if got := Recalled(5, when); got.IntervalDays != 7 {
		t.Fatalf("an interval of 5 days went to %d, want 7", got.IntervalDays)
	}
}

func TestForgettingPutsAWordBackAtTheFront(t *testing.T) {
	// Not one step down: a word that has gone is gone, and walking it back
	// through a month would ask about it next in a fortnight.
	got := Forgotten(when)
	if got.IntervalDays != 0 || !got.DueAt.Equal(when) {
		t.Fatalf("a forgotten word went to %+v", got)
	}
}

func TestRetiringAWordStillBringsItBackEventually(t *testing.T) {
	// "I know this" and "I will still know this in four months" are different
	// claims, and only one of them is the learner's to make.
	got := Retired(when)
	if got.IntervalDays != Ladder[len(Ladder)-1] {
		t.Fatalf("a retired word went to %+v", got)
	}
	if !got.DueAt.After(when) {
		t.Fatal("a retired word is due immediately")
	}
}
