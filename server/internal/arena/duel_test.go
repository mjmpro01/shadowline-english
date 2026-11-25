package arena

import (
	"testing"
	"time"
)

func TestTheTowerClimbs(t *testing.T) {
	if len(Tower) != 15 {
		t.Fatalf("%d floors", len(Tower))
	}
	seen := map[string]bool{}
	for i, o := range Tower {
		if o.Floor != i+1 || seen[o.ID] || o.Name.En == "" || o.Name.Vi == "" {
			t.Errorf("floor %d: %+v", i+1, o)
		}
		seen[o.ID] = true
		if o.Boss != (o.Floor%5 == 0) {
			t.Errorf("floor %d: boss %v", o.Floor, o.Boss)
		}
		if c, ok := CharacterByID(o.ID); o.Mirror == ok || (ok && o.Character.ID != c.ID) {
			t.Errorf("%s is drawn as %q", o.ID, o.Character.ID)
		}
		if o.Boss && TierRank(o.Character.Tier) < TierRank(Rare) {
			t.Errorf("boss %s is only %s", o.ID, o.Character.Tier)
		}
		if i > 0 && !o.Boss && !Tower[i-1].Boss && (o.HP <= Tower[i-1].HP || o.Atk < Tower[i-1].Atk) {
			t.Errorf("floor %d is not harder than %d", o.Floor, o.Floor-1)
		}
		if len(o.Kinds) == 0 || o.RankLo >= o.RankHi {
			t.Errorf("%s asks nothing", o.ID)
		}
	}
	if _, ok := Floor(0); ok {
		t.Fatal("floor 0")
	}
	if o, ok := Floor(15); !ok || !o.Boss {
		t.Fatal("the top floor is a boss")
	}
}

func TestAnAnswerHitsAsHardAsItIsQuick(t *testing.T) {
	base := Fight{Atk: 10, Def: 2, OppAtk: 8, OppDef: 3, HP: 50, OppHP: 50, Allowed: 10 * time.Second}
	cases := []struct {
		name  string
		f     func(*Fight)
		move  string
		dealt int
		taken int
	}{
		{"quick and right", func(f *Fight) { f.Right, f.Elapsed = true, 3*time.Second }, MoveHeavy, 16 - 3, 0},
		{"slow and right", func(f *Fight) { f.Right, f.Elapsed = true, 7*time.Second }, MoveLight, 10 - 3, 0},
		{"wrong", func(f *Fight) {}, MoveHit, 0, 8 - 2},
		{"a special, armed and full", func(f *Fight) { f.Right, f.Special, f.Rage, f.Elapsed = true, true, 100, 8*time.Second }, MoveSpecial, 30 - 3, 0},
		{"a special, not full", func(f *Fight) { f.Right, f.Special, f.Rage, f.Elapsed = true, true, 60, 8*time.Second }, MoveLight, 7, 0},
		{"a big attack blocked", func(f *Fight) { f.Block, f.Right = true, true }, MoveBlock, 7, 0},
		{"a big attack missed", func(f *Fight) { f.Block = true }, MoveHit, 0, 14 - 2},
		{"armour never makes a hit nothing", func(f *Fight) { f.Def = 50 }, MoveHit, 0, 1},
	}
	for _, c := range cases {
		f := base
		c.f(&f)
		r := Resolve(f)
		if r.Move != c.move || r.Dealt != c.dealt || r.Taken != c.taken || r.OppHP != 50-c.dealt || r.HP != 50-c.taken {
			t.Errorf("%s: %+v", c.name, r)
		}
	}
}

func TestRageFillsWithRightAnswersAndIsSpentOnTheSpecial(t *testing.T) {
	f := Fight{Atk: 5, OppAtk: 5, HP: 50, OppHP: 99, Allowed: 10 * time.Second, Elapsed: 8 * time.Second, Right: true, RageStat: 1}
	f.Rage, f.Combo = 0, 0
	r := Resolve(f)
	if r.Rage != 25 || r.Combo != 1 {
		t.Fatalf("one right: %+v", r)
	}
	f.Rage, f.Combo = 25, 2
	if r = Resolve(f); r.Rage != 25+25+ComboBonus || r.Combo != 3 {
		t.Fatalf("a combo: %+v", r)
	}
	f.Rage, f.Combo = 95, 3
	if r = Resolve(f); r.Rage != RageFull {
		t.Fatalf("capped: %+v", r)
	}
	f.Rage, f.Special = RageFull, true
	if r = Resolve(f); r.Move != MoveSpecial || r.Rage != 0 {
		t.Fatalf("spent: %+v", r)
	}
	f.Right = false
	if r = Resolve(f); r.Rage != RageFull/2 || r.Combo != 0 {
		t.Fatalf("armed and missed: %+v", r)
	}
}

func TestTimeToAnswerAndTheBigAttack(t *testing.T) {
	o, _ := Floor(8) // TimeDelta 2
	if got := AnswerSeconds(10, o, AskMeaning, false, false); got != 8 {
		t.Fatalf("got %d", got)
	}
	if got := AnswerSeconds(10, o, AskScramble, false, false); got != 14 {
		t.Fatalf("scramble %d", got)
	}
	if got := AnswerSeconds(3, o, AskMeaning, false, false); got != MinSeconds {
		t.Fatalf("floor %d", got)
	}
	if got := AnswerSeconds(10, o, AskListen, true, false); got != 5 {
		t.Fatalf("block %d", got)
	}
	if IsTelegraph(4, o) || !IsTelegraph(5, o) || !IsTelegraph(10, o) {
		t.Fatal("every fifth turn")
	}
	boss, _ := Floor(5)
	if !IsTelegraph(3, boss) {
		t.Fatal("a boss every third")
	}
}

func TestEnergyComesBackByTheHour(t *testing.T) {
	at := time.Date(2026, 11, 22, 8, 0, 0, 0, time.UTC)
	if e, next := Energy(2, at, at.Add(90*time.Minute)); e != 3 || !next.Equal(at.Add(2*time.Hour)) {
		t.Fatalf("%d %v", e, next)
	}
	if e, next := Energy(4, at, at.Add(5*time.Hour)); e != EnergyMax || !next.IsZero() {
		t.Fatalf("full: %d %v", e, next)
	}
	// Spent while full: the hour starts now.
	e, saved := SetEnergy(EnergyMax, at, at.Add(time.Hour), 4)
	if e != 4 || !saved.Equal(at.Add(time.Hour)) {
		t.Fatalf("spent from full: %d %v", e, saved)
	}
	// Spent mid-hour: the hour under way is kept.
	e, saved = SetEnergy(2, at, at.Add(90*time.Minute), 2)
	if e != 2 || !saved.Equal(at.Add(time.Hour)) {
		t.Fatalf("spent mid-hour: %d %v", e, saved)
	}
}

func TestExperienceRaisesTheLevel(t *testing.T) {
	if l, x := AddXP(1, 80, 30); l != 2 || x != 10 {
		t.Fatalf("%d %d", l, x)
	}
	if l, x := AddXP(1, 0, 100+200+50); l != 3 || x != 50 {
		t.Fatalf("%d %d", l, x)
	}
}

func TestEachSkillDoesItsOwnThing(t *testing.T) {
	armed := Fight{Atk: 10, Def: 2, OppAtk: 8, OppDef: 3, HP: 30, MaxHP: 60, OppHP: 100, Rage: RageFull,
		Special: true, Right: true, Allowed: 10 * time.Second, Elapsed: 2 * time.Second}
	cases := []struct {
		skill             string
		tier              int
		dealt, healed, hp int
		shield, focus     int
	}{
		{SkillCrit, 0, 35 - 3, 0, 30, 0, 0},
		{SkillCombo, 0, (20 - 3) + (15 - 3), 0, 30, 0, 0},
		{SkillDrain, 0, 25 - 3, 11, 41, 0, 0},
		{SkillHeal, 0, 20 - 3, 18, 48, 0, 0},
		{SkillStun, 0, 20 - 3, 0, 30, 1, 0},
		{SkillFocus, 0, 25 - 3, 0, 30, 0, FocusTurns},
		// Stronger up the tiers: a legendary crit is 30% harder.
		{SkillCrit, 3, 46 - 3, 0, 30, 0, 0},
		{"", 0, 30 - 3, 0, 30, 0, 0},
	}
	for _, c := range cases {
		f := armed
		f.Skill, f.Tier = c.skill, c.tier
		r := Resolve(f)
		if r.Move != MoveSpecial || r.Dealt != c.dealt || r.Healed != c.healed || r.HP != c.hp ||
			r.Shield != c.shield || r.Focus != c.focus || r.Rage != 0 || r.Skill != c.skill {
			t.Errorf("%s tier %d: %+v", c.skill, c.tier, r)
		}
	}
}

func TestAHealNeverGoesPastFullHealth(t *testing.T) {
	r := Resolve(Fight{Atk: 10, OppHP: 100, HP: 55, MaxHP: 60, Rage: RageFull, Special: true, Right: true, Skill: SkillHeal})
	if r.HP != 60 || r.Healed != 5 {
		t.Fatalf("%+v", r)
	}
}

func TestAStunShrugsOffTheNextHitOnly(t *testing.T) {
	wrong := Fight{Atk: 10, Def: 2, OppAtk: 8, OppDef: 3, HP: 30, OppHP: 50, Shield: 1}
	r := Resolve(wrong)
	if r.Move != MoveHit || r.Taken != 0 || !r.Shielded || r.Shield != 0 || r.HP != 30 {
		t.Fatalf("stunned: %+v", r)
	}
	// A right answer keeps it for later.
	right := wrong
	right.Right = true
	if r := Resolve(right); r.Shield != 1 || r.Shielded {
		t.Fatalf("kept: %+v", r)
	}
	// Missing a block while stunned costs nothing either.
	block := wrong
	block.Block = true
	if r := Resolve(block); r.Taken != 0 || !r.Shielded {
		t.Fatalf("block: %+v", r)
	}
	wrong.Shield = 0
	if r := Resolve(wrong); r.Taken != 6 || r.Shielded {
		t.Fatalf("not stunned: %+v", r)
	}
}

func TestFocusGivesMoreTime(t *testing.T) {
	o, _ := Floor(1)
	if AnswerSeconds(10, o, AskMeaning, false, true) != AnswerSeconds(10, o, AskMeaning, false, false)+FocusSeconds {
		t.Fatal("focus adds seconds")
	}
}
