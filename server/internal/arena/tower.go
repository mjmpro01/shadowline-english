package arena

// The tower: fifteen floors of fighters to beat in a word duel, a boss on every
// fifth. Each opponent is dressed in the same gear a learner can buy, so they
// are drawn the same way, and their words get harder as the tower goes up.

// Opponent is the fighter on one floor of the tower.
type Opponent struct {
	Floor int    `json:"floor"`
	ID    string `json:"id"`
	Name  Text   `json:"name"`
	Boss  bool   `json:"boss"`
	// Look is how they are drawn; Mirror draws them as the learner instead.
	Look     Look              `json:"look"`
	Equipped map[string]string `json:"equipped"`
	Mirror   bool              `json:"mirror,omitempty"`

	Atk int `json:"atk"`
	Def int `json:"def"`
	HP  int `json:"hp"`
	// TimeDelta is seconds taken off the time to answer.
	TimeDelta int `json:"-"`
	// Telegraph is how often a big, blockable attack comes: every Nth turn.
	Telegraph int `json:"-"`
	// Kinds are the questions asked, and RankLo..RankHi the band of common
	// words they come from when the learner's own run out.
	Kinds  []string `json:"-"`
	RankLo int      `json:"-"`
	RankHi int      `json:"-"`

	Coins      int    `json:"coins"`
	XP         int    `json:"xp"`
	Drop       string `json:"drop,omitempty"`
	DropChance int    `json:"-"`
}

type floorDef struct {
	id       string
	name     Text
	look     Look
	equipped map[string]string
	drop     string
	chance   int
}

var floors = []floorDef{
	{"pickpocket", Text{"Pickpocket", "Kẻ móc túi"}, Look{Body: "a", Skin: 2, Hair: 1}, map[string]string{"body": "rags", "hands": "cloth_wraps"}, "", 0},
	{"dockhand", Text{"Dockhand", "Phu bến cảng"}, Look{Body: "b", Skin: 3, Hair: 0}, map[string]string{"body": "patched_tunic", "head": "straw_hat"}, "straw_hat", 25},
	{"market_bully", Text{"Market bully", "Gã chợ búa"}, Look{Body: "b", Skin: 1, Hair: 3}, map[string]string{"body": "patched_tunic", "hands": "leather_gloves"}, "cloth_wraps", 25},
	{"stick_fighter", Text{"Stick fighter", "Võ sĩ gậy"}, Look{Body: "a", Skin: 0, Hair: 2}, map[string]string{"body": "patched_tunic", "weapon": "walking_stick", "feet": "straw_sandals"}, "walking_stick", 20},
	{"alley_boss", Text{"Alley boss", "Trùm hẻm"}, Look{Body: "b", Skin: 2, Hair: 0}, map[string]string{"body": "leather_vest", "hands": "iron_knuckles", "head": "leather_cap"}, "leather_cap", 35},
	{"novice", Text{"Temple novice", "Chú tiểu"}, Look{Body: "a", Skin: 1, Hair: 3}, map[string]string{"body": "patched_tunic", "weapon": "bo_staff", "feet": "straw_sandals"}, "straw_sandals", 25},
	{"wandering_monk", Text{"Wandering monk", "Nhà sư du phương"}, Look{Body: "b", Skin: 0, Hair: 3}, map[string]string{"body": "leather_vest", "weapon": "bo_staff", "charm": "lucky_coin"}, "lucky_coin", 20},
	{"fan_dancer", Text{"Fan dancer", "Vũ công quạt"}, Look{Body: "a", Skin: 1, Hair: 2}, map[string]string{"body": "leather_vest", "feet": "swift_boots", "charm": "jade_charm"}, "swift_boots", 15},
	{"iron_guard", Text{"Iron guard", "Lính gác sắt"}, Look{Body: "b", Skin: 2, Hair: 0}, map[string]string{"body": "scale_mail", "head": "iron_helm", "weapon": "walking_stick"}, "leather_vest", 15},
	{"iron_general", Text{"Iron general", "Tướng thép"}, Look{Body: "b", Skin: 3, Hair: 1}, map[string]string{"body": "scale_mail", "head": "iron_helm", "hands": "iron_knuckles", "weapon": "bo_staff"}, "iron_helm", 30},
	{"wind_walker", Text{"Wind walker", "Kẻ lướt gió"}, Look{Body: "a", Skin: 0, Hair: 1}, map[string]string{"body": "leather_vest", "feet": "swift_boots", "weapon": "bo_staff"}, "jade_charm", 15},
	{"jade_duelist", Text{"Jade duelist", "Kiếm khách ngọc"}, Look{Body: "a", Skin: 2, Hair: 2}, map[string]string{"body": "scale_mail", "weapon": "twin_blades", "charm": "jade_charm"}, "scale_mail", 12},
	{"mirror", Text{"Mirror shadow", "Bóng gương"}, Look{Body: "a", Skin: 0, Hair: 0}, map[string]string{"body": "rags"}, "iron_knuckles", 12},
	{"thunder_fist", Text{"Thunder fist", "Quyền sấm"}, Look{Body: "b", Skin: 1, Hair: 3}, map[string]string{"body": "scale_mail", "hands": "iron_knuckles", "feet": "swift_boots"}, "twin_blades", 8},
	{"tower_master", Text{"Tower master", "Chủ tháp"}, Look{Body: "b", Skin: 3, Hair: 2}, map[string]string{"body": "scale_mail", "head": "iron_helm", "weapon": "twin_blades", "charm": "phoenix_feather", "feet": "swift_boots"}, "phoenix_feather", 25},
}

// Tower is every floor, from the first.
var Tower = func() []Opponent {
	out := make([]Opponent, len(floors))
	for i, f := range floors {
		n := i + 1
		boss := n%5 == 0
		o := Opponent{
			Floor: n, ID: f.id, Name: f.name, Boss: boss, Look: f.look, Equipped: f.equipped,
			Mirror: f.id == "mirror",
			Atk:    3 + n, Def: n / 3, HP: 30 + 8*n,
			TimeDelta: n / 4, Telegraph: 5,
			Coins: 10 + 6*n, XP: 20 * n,
			Drop: f.drop, DropChance: f.chance,
		}
		switch {
		case n <= 5:
			o.RankLo, o.RankHi = 1, 2000
			o.Kinds = []string{AskMeaning, AskListen}
		case n <= 10:
			o.RankLo, o.RankHi = 1500, 5000
			o.Kinds = []string{AskMeaning, AskListen, AskIPA}
		default:
			o.RankLo, o.RankHi = 4000, 10000
			o.Kinds = []string{AskMeaning, AskListen, AskIPA, AskScramble}
		}
		if n >= 3 && n <= 5 {
			o.Kinds = append(o.Kinds, AskIPA)
		}
		if boss {
			o.HP = o.HP * 8 / 5
			o.Atk++
			o.TimeDelta++
			o.Telegraph = 3
			o.Coins *= 2
		}
		out[i] = o
	}
	return out
}()

// Floor is the opponent on floor n, counted from 1.
func Floor(n int) (Opponent, bool) {
	if n < 1 || n > len(Tower) {
		return Opponent{}, false
	}
	return Tower[n-1], true
}
