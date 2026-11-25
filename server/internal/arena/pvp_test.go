package arena

import "testing"

func TestEloMovesRatingsByHowLikelyTheResultWas(t *testing.T) {
	if got := Elo(1000, 1000, true); got != 16 {
		t.Fatalf("even, won: %d", got)
	}
	if got := Elo(1000, 1000, false); got != -16 {
		t.Fatalf("even, lost: %d", got)
	}
	upset, expected := Elo(1000, 1400, true), Elo(1400, 1000, true)
	if upset <= 16 || expected >= 16 || upset+expected != EloK {
		t.Fatalf("upset %d, expected %d", upset, expected)
	}
}

func TestAShadowIsAsStrongAsTheirCharacter(t *testing.T) {
	archer, _ := CharacterByID("forest_archer")
	o := Shadow("u1", "Lan", archer, 3, 1050)
	base := Base(3)
	if o.Atk != base.Atk+2 || o.Def != base.Def+1 || o.HP != base.HP+10 || o.Level != 3 || o.Rating != 1050 ||
		o.Name.Vi != "Lan" || o.Character.ID != "forest_archer" {
		t.Fatalf("%+v", o)
	}
	if len(o.Kinds) != 2 || o.Telegraph != 4 {
		t.Fatalf("a new learner's questions: %+v", o)
	}
	if hard := Shadow("u2", "Bao", archer, 1, 1400); len(hard.Kinds) != 4 || hard.RankLo != 2000 {
		t.Fatalf("a strong learner's questions: %+v", hard)
	}
}

func TestBotsAndRewards(t *testing.T) {
	b, ok := Bot(BotFloor(2, 1))
	if !ok || !b.Bot || b.ID != "bot:3" || b.Rating != 975 || b.Character.ID != "farmer" || b.Boss {
		t.Fatalf("%+v", b)
	}
	if BotFloor(20, 1) != len(Tower) || BotFloor(1, -1) != 1 {
		t.Fatal("bots stay in the tower")
	}
	if _, ok := Bot(99); ok {
		t.Fatal("no floor 99")
	}
	if PvPCoins(3, 2) != 15 || PvPCoins(2, 5) != 30 {
		t.Fatal("coins")
	}
}
