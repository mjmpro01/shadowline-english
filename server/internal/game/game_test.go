package game

import (
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC)

func TestStaminaComesBackOverTime(t *testing.T) {
	cases := []struct {
		stored  int
		elapsed time.Duration
		want    int
	}{
		{10, 0, 10},
		{10, StaminaRegen - time.Second, 10},
		{10, StaminaRegen, 11},
		{10, 3*StaminaRegen + time.Minute, 13},
		{28, 10 * StaminaRegen, StaminaMax},
		{StaminaMax, time.Hour, StaminaMax},
	}
	for _, c := range cases {
		got, next := Stamina(c.stored, t0, t0.Add(c.elapsed))
		if got != c.want {
			t.Errorf("%d after %s: got %d, want %d", c.stored, c.elapsed, got, c.want)
		}
		if (got == StaminaMax) != next.IsZero() {
			t.Errorf("%d after %s: next %v, and full is %v", c.stored, c.elapsed, next, got == StaminaMax)
		}
	}
}

func TestSpendingStaminaKeepsThePointHalfRegained(t *testing.T) {
	// Ten points stored, seven and a half minutes ago: one point back, and half
	// way to the next. Spending two leaves nine, and the half is not lost.
	now := t0.Add(StaminaRegen + StaminaRegen/2)
	stored, at := SetStamina(10, t0, now, 9)
	if stored != 9 || !at.Equal(t0.Add(StaminaRegen)) {
		t.Fatalf("got %d at %v", stored, at)
	}
	got, next := Stamina(stored, at, now)
	if got != 9 || !next.Equal(t0.Add(2*StaminaRegen)) {
		t.Fatalf("worked forward: %d, next at %v", got, next)
	}
}

func TestSpendingFromFullStartsTheClockNow(t *testing.T) {
	stored, at := SetStamina(StaminaMax, t0, t0.Add(time.Hour), StaminaMax-2)
	if stored != StaminaMax-2 || !at.Equal(t0.Add(time.Hour)) {
		t.Fatalf("got %d at %v", stored, at)
	}
}

func TestBetterSoilGrowsFaster(t *testing.T) {
	sprout, _ := CropByID("sprout")
	if GrowTime(sprout, 0) != 2*time.Minute {
		t.Fatalf("level 0: %s", GrowTime(sprout, 0))
	}
	if GrowTime(sprout, 3) != 2*time.Minute*40/100 {
		t.Fatalf("level 3: %s", GrowTime(sprout, 3))
	}
}

func TestTheQuestDayTurnsAtMidnightInVietnam(t *testing.T) {
	// 16:59 UTC is 23:59 in Vietnam; a minute later it is the next day.
	before := time.Date(2026, 10, 14, 16, 59, 0, 0, time.UTC)
	day, start, end := Day(before)
	if day != "2026-10-14" || end.Sub(start) != 24*time.Hour {
		t.Fatalf("got %s, %v – %v", day, start, end)
	}
	if day, _, _ := Day(before.Add(time.Minute)); day != "2026-10-15" {
		t.Fatalf("a minute later: %s", day)
	}
}

func TestTheDaysTasksAreFixedForTheDayAndIncludeLearning(t *testing.T) {
	seen := map[string]bool{}
	for d := 1; d <= 28; d++ {
		day := time.Date(2026, 10, d, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		first := DailyFor("user-1", day)
		again := DailyFor("user-1", day)
		if len(first) != DailyCount {
			t.Fatalf("%s: %d tasks", day, len(first))
		}
		learning, ids := false, map[string]bool{}
		for i, q := range first {
			if again[i].ID != q.ID {
				t.Fatalf("%s: asked twice, got %v then %v", day, first, again)
			}
			if ids[q.ID] {
				t.Fatalf("%s: %s twice", day, q.ID)
			}
			ids[q.ID] = true
			learning = learning || q.Learning
			seen[q.ID] = true
		}
		if !learning {
			t.Fatalf("%s: nothing to practise in the app: %v", day, first)
		}
	}
	// Over four weeks every task should come up at least once.
	if len(seen) != len(DailyPool) {
		t.Fatalf("only %d of %d tasks ever came up", len(seen), len(DailyPool))
	}
}

func TestTheCatalogHoldsTogether(t *testing.T) {
	for _, c := range Crops {
		if _, ok := ItemByID(c.Seed); !ok {
			t.Errorf("crop %s grows from %s, which is not an item", c.ID, c.Seed)
		}
	}
	rewards := []Reward{DailyChest, StreakBonus(3), StreakBonus(7), StreakBonus(14)}
	for _, s := range MainQuests {
		rewards = append(rewards, s.Reward)
		if s.Target > 0 && s.Counter.Kind == "" {
			t.Errorf("step %s has a target and nothing to count", s.ID)
		}
	}
	for _, d := range DailyPool {
		rewards = append(rewards, d.Reward)
	}
	for _, r := range rewards {
		for item := range r.Items {
			if _, ok := ItemByID(item); !ok {
				t.Errorf("a reward gives %s, which is not an item", item)
			}
		}
	}
	if BloomStep >= len(MainQuests)+1 || GoldenStep > len(MainQuests) {
		t.Errorf("a seed unlocks at a step the story never reaches")
	}
}
