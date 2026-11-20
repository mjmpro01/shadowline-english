package arena

import "testing"

func TestEveryItemFitsASlotAndHasAPrice(t *testing.T) {
	slots := map[string]bool{}
	for _, s := range Slots {
		slots[s] = true
	}
	seen := map[string]bool{}
	for _, it := range Items {
		if seen[it.ID] || !slots[it.Slot] || it.Name.En == "" || it.Name.Vi == "" {
			t.Errorf("%+v", it)
		}
		seen[it.ID] = true
		if it.Starter != (it.Price == 0) {
			t.Errorf("%s: the beggar's kit is free and nothing else is", it.ID)
		}
		switch it.Rarity {
		case Common, Rare, Epic, Legendary:
		default:
			t.Errorf("%s: rarity %q", it.ID, it.Rarity)
		}
	}
	if len(Starters()) != 3 {
		t.Fatalf("the beggar's kit: %+v", Starters())
	}
	for _, it := range Starters() {
		if it.Stats != (Stats{}) {
			t.Errorf("%s: a beggar's kit adds nothing", it.ID)
		}
	}
}

func TestStatsAddUp(t *testing.T) {
	hat, _ := ItemByID("iron_helm")
	staff, _ := ItemByID("bo_staff")
	got := StatsOf(2, []Item{hat, staff})
	want := Stats{Atk: 5 + 4, Def: 1 + 4, HP: 50 + 10, Time: 10, Rage: 1}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if _, ok := ItemByID("nothing"); ok {
		t.Fatal("found nothing")
	}
}

func TestAFightersLookIsChecked(t *testing.T) {
	ok, err := Look{Name: "  Minh   Anh ", Body: "a", Skin: 3, Hair: 0}.Clean()
	if err != nil || ok.Name != "Minh Anh" {
		t.Fatalf("%+v %v", ok, err)
	}
	for _, bad := range []Look{
		{Name: "M", Body: "a"},
		{Name: "Twenty-one letters!!!", Body: "a"},
		{Name: "Minh", Body: "c"},
		{Name: "Minh", Body: "b", Skin: 4},
		{Name: "Minh", Body: "b", Hair: -1},
	} {
		if _, err := bad.Clean(); err == nil {
			t.Errorf("accepted %+v", bad)
		}
	}
}
