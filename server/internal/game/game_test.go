package game

import (
	"fmt"
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
	for _, woods := range []bool{false, true} {
		checkDailies(t, woods)
	}
}

func checkDailies(t *testing.T, woods bool) {
	t.Helper()
	seen := map[string]bool{}
	for d := 1; d <= 28; d++ {
		day := time.Date(2026, 10, d, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
		first := DailyFor("user-1", day, woods)
		again := DailyFor("user-1", day, woods)
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
			if q.Woods && !woods {
				t.Fatalf("%s: %s is in the woods, which are not open", day, q.ID)
			}
		}
		if !learning {
			t.Fatalf("%s: nothing to practise in the app: %v", day, first)
		}
	}
	// Over four weeks every task that can come up should, at least once.
	want := 0
	for _, d := range DailyPool {
		if woods || !d.Woods {
			want++
		}
	}
	if len(seen) != want {
		t.Fatalf("woods %v: only %d of %d tasks ever came up", woods, len(seen), want)
	}
}

func TestTheDaysTasksDoNotChangeForFarmersBeforeTheWoods(t *testing.T) {
	// The woods tasks joined the pool later; a farmer who has not reached the
	// woods draws from exactly the pool they drew from before.
	got := DailyFor("user-7", "2026-10-20", false)
	for _, q := range got {
		if q.Woods {
			t.Fatalf("drew %s", q.ID)
		}
	}
}

func TestHealthComesBackLikeStamina(t *testing.T) {
	got, next := HP(10, t0, t0.Add(3*HPRegen+time.Second))
	if got != 13 || !next.Equal(t0.Add(4*HPRegen)) {
		t.Fatalf("got %d, next %v", got, next)
	}
	if got, next := HP(HPMax-1, t0, t0.Add(time.Hour)); got != HPMax || !next.IsZero() {
		t.Fatalf("full: %d %v", got, next)
	}
	stored, at := SetHP(HPMax, t0, t0.Add(time.Minute), HPMax-4)
	if stored != HPMax-4 || !at.Equal(t0.Add(time.Minute)) {
		t.Fatalf("hit from full: %d at %v", stored, at)
	}
}

func TestQuickAnswersStrikeTwice(t *testing.T) {
	allowed := 12 * time.Second
	if Strike(3*time.Second, allowed) != 2 || Strike(5*time.Second, allowed) != 1 {
		t.Fatal("a third of the time is the line between a double strike and a single")
	}
	if FaintFine(1000) != 50 || FaintFine(120) != 12 || FaintFine(5) != 0 {
		t.Fatal("fainting costs a tenth of the gold, at most 50")
	}
}

func TestTheWoodsHoldTogether(t *testing.T) {
	ids := map[string]bool{}
	for _, s := range Spawns {
		if ids[s.ID] {
			t.Errorf("spawn %s twice", s.ID)
		}
		ids[s.ID] = true
		if _, ok := MonsterByID(s.Monster); !ok {
			t.Errorf("spawn %s holds %s, which is not a monster", s.ID, s.Monster)
		}
	}
	for _, m := range Monsters {
		if m.HP <= 0 || m.Hit <= 0 || len(m.Games) == 0 || m.Seconds <= 0 {
			t.Errorf("monster %s is missing its numbers", m.ID)
		}
		if m.Drop != "" {
			if _, ok := ItemByID(m.Drop); !ok {
				t.Errorf("monster %s drops %s, which is not an item", m.ID, m.Drop)
			}
		}
	}
	if WoodsStep > len(MainQuests) || MainQuests[WoodsStep].ID != "enter_woods" {
		t.Errorf("the woods open at the step that sends the player into them")
	}
	if TrollStep >= len(MainQuests) || MainQuests[TrollStep].ID != "brams_hammer" {
		t.Errorf("the troll's lair fills at the step that asks for it to be beaten")
	}
	for _, m := range Monsters {
		for i, p := range m.Phases {
			if len(p.Games) == 0 || p.Seconds <= 0 || p.ScrambleSeconds <= 0 {
				t.Errorf("monster %s phase %d is missing its numbers", m.ID, i)
			}
		}
	}
}

func TestABossChangesAsItTires(t *testing.T) {
	troll, _ := MonsterByID("mumble_troll")
	var phases []int
	for hp := troll.HP; hp >= -1; hp-- {
		i, _ := PhaseOf(troll, hp)
		phases = append(phases, i)
	}
	// 12..9 the first, 8..5 the second, 4..1 the third; past zero, still the last.
	want := []int{0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2}
	if fmt.Sprint(phases) != fmt.Sprint(want) {
		t.Fatalf("phases by health: %v, want %v", phases, want)
	}
	_, last := PhaseOf(troll, 1)
	if TimeFor(last, GameIPA) != 8*time.Second || TimeFor(last, GameScramble) != 16*time.Second {
		t.Fatal("the last phase is the fastest")
	}
	slime, _ := MonsterByID("word_slime")
	if i, p := PhaseOf(slime, 1); i != 0 || p.Seconds != slime.Seconds || len(p.Games) != len(slime.Games) {
		t.Fatal("a monster without phases fights the same way throughout")
	}
	if RespawnOf(troll) != 24*time.Hour || RespawnOf(slime) != RespawnDefault {
		t.Fatal("the troll comes back a day later, the rest in minutes")
	}
}

func TestTheHammerRichensTheSoil(t *testing.T) {
	if MaxLevelFor(false) != MaxLevel || MaxLevelFor(true) != MaxLevel+1 {
		t.Fatal("the hammer allows one level more")
	}
	if UpgradeCost(MaxLevel) <= UpgradeCost(MaxLevel-1) {
		t.Fatal("the hammer's level costs more than the ones before")
	}
	if c, _ := CropByID("sprout"); GrowTime(c, HammerLevel) >= GrowTime(c, MaxLevel) {
		t.Fatal("the richest soil grows fastest")
	}
	hammer, ok := ItemByID("bram_hammer")
	if !ok || hammer.UnlockStep <= len(MainQuests) || hammer.Stamina != 0 || hammer.HP != 0 {
		t.Fatal("the hammer is never sold and never used up")
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
