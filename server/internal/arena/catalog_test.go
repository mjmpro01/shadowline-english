package arena

import (
	"os"
	"strings"
	"testing"
)

func TestTheRosterIsTwentyFourWithEverySkillInEveryTier(t *testing.T) {
	if len(Characters) != 24 {
		t.Fatalf("%d characters", len(Characters))
	}
	seen := map[string]bool{}
	skills := map[string]map[string]bool{}
	cheapest, dearest := map[string]int{}, map[string]int{}
	for _, c := range Characters {
		if seen[c.ID] || c.Name.En == "" || c.Name.Vi == "" || c.Weapon.Name.Vi == "" || c.Weapon.Kind == "" ||
			c.Skill.Name.En == "" || c.Skill.Name.Vi == "" || c.Palette[0] == "" {
			t.Errorf("%+v", c)
		}
		seen[c.ID] = true
		if skills[c.Tier] == nil {
			skills[c.Tier] = map[string]bool{}
			cheapest[c.Tier] = c.Price
		}
		skills[c.Tier][c.Skill.Kind] = true
		cheapest[c.Tier] = min(cheapest[c.Tier], c.Price)
		dearest[c.Tier] = max(dearest[c.Tier], c.Price)
	}
	for i, tier := range Tiers {
		if len(skills[tier]) != len(SkillKinds) {
			t.Errorf("%s has skills %v", tier, skills[tier])
		}
		if i > 0 && cheapest[tier] <= dearest[Tiers[i-1]] {
			t.Errorf("%s is not dearer than %s", tier, Tiers[i-1])
		}
	}
	starters := Starters()
	if len(starters) != 2 || starters[0].ID != "beggar" || starters[1].ID != "street_kid" || starters[0].Female == starters[1].Female {
		t.Fatalf("starters: %+v", starters)
	}
}

func TestACharacterAddsToAFightersOwnStats(t *testing.T) {
	beggar, _ := CharacterByID("beggar")
	if StatsOf(2, beggar) != Base(2) {
		t.Fatal("a common character adds nothing")
	}
	monk, _ := CharacterByID("thunder_monk")
	want := Stats{Atk: 5 + 6, Def: 1 + 3, HP: 50 + 30, Time: 10 + 1, Rage: 1}
	if got := StatsOf(2, monk); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if _, ok := CharacterByID("nobody"); ok {
		t.Fatal("found nobody")
	}
	if TierRank(Legendary) != 3 || TierRank(Common) != 0 {
		t.Fatal("tier ranks")
	}
}

func TestAFightersNameIsChecked(t *testing.T) {
	if name, err := CleanName("  Minh   Anh "); err != nil || name != "Minh Anh" {
		t.Fatalf("%q %v", name, err)
	}
	for _, bad := range []string{"M", "Twenty-one letters!!!", "   "} {
		if _, err := CleanName(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

// The art script checks the art against its own copy of the roster.
func TestTheArtScriptKnowsEveryCharacter(t *testing.T) {
	raw, err := os.ReadFile("../../../app/scripts/arenaManifest.mjs")
	if err != nil {
		t.Skip("no app beside the server")
	}
	for _, c := range Characters {
		if !strings.Contains(string(raw), "'"+c.ID+"'") {
			t.Errorf("arenaManifest.mjs does not know %s", c.ID)
		}
	}
}
