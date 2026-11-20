// Package arena is the Arena's rules: the fighters, their gear and what it
// does, and the questions a word duel asks. Nothing here touches the database.
package arena

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// Text is something said in both of the app's languages.
type Text struct {
	En string `json:"en"`
	Vi string `json:"vi"`
}

// The slots a fighter wears gear in.
const (
	SlotHead   = "head"
	SlotBody   = "body"
	SlotHands  = "hands"
	SlotWeapon = "weapon"
	SlotFeet   = "feet"
	SlotCharm  = "charm"
)

// Slots is every slot, in the order the app shows them.
var Slots = []string{SlotHead, SlotBody, SlotHands, SlotWeapon, SlotFeet, SlotCharm}

// Rarities, from the plainest.
const (
	Common    = "common"
	Rare      = "rare"
	Epic      = "epic"
	Legendary = "legendary"
)

// Stats is what a fighter brings to a duel, and what a piece of gear adds.
type Stats struct {
	// Atk is damage dealt by a hit.
	Atk int `json:"atk"`
	// Def is damage taken away from each hit received.
	Def int `json:"def"`
	// HP is health.
	HP int `json:"hp"`
	// Time is seconds added to the time to answer.
	Time int `json:"time"`
	// Rage is extra rage for each right answer: the special comes sooner.
	Rage int `json:"rage"`
}

// Add is two sets of stats together.
func (s Stats) Add(o Stats) Stats {
	return Stats{s.Atk + o.Atk, s.Def + o.Def, s.HP + o.HP, s.Time + o.Time, s.Rage + o.Rage}
}

// Item is a piece of gear.
type Item struct {
	ID     string `json:"id"`
	Slot   string `json:"slot"`
	Name   Text   `json:"name"`
	Rarity string `json:"rarity"`
	// Price is in coins; 0 for the beggar's kit, which is never sold.
	Price int   `json:"price"`
	Stats Stats `json:"stats"`
	// Starter is part of what every fighter starts with.
	Starter bool `json:"starter"`
}

// Items is all the gear there is: what a beggar starts in, and what the shop
// sells, cheapest first in each slot.
var Items = []Item{
	// The beggar's kit: what everyone starts in.
	{ID: "rags", Slot: SlotBody, Name: Text{"Rags", "Áo rách"}, Rarity: Common, Starter: true},
	{ID: "bare_fists", Slot: SlotHands, Name: Text{"Bare fists", "Tay không"}, Rarity: Common, Starter: true},
	{ID: "bare_feet", Slot: SlotFeet, Name: Text{"Bare feet", "Chân đất"}, Rarity: Common, Starter: true},

	{ID: "straw_hat", Slot: SlotHead, Name: Text{"Straw hat", "Nón rơm"}, Rarity: Common, Price: 60, Stats: Stats{Def: 1}},
	{ID: "leather_cap", Slot: SlotHead, Name: Text{"Leather cap", "Mũ da"}, Rarity: Rare, Price: 250, Stats: Stats{Def: 2, HP: 5}},
	{ID: "iron_helm", Slot: SlotHead, Name: Text{"Iron helm", "Mũ sắt"}, Rarity: Epic, Price: 900, Stats: Stats{Def: 4, HP: 10}},

	{ID: "patched_tunic", Slot: SlotBody, Name: Text{"Patched tunic", "Áo vá"}, Rarity: Common, Price: 80, Stats: Stats{Def: 1, HP: 5}},
	{ID: "leather_vest", Slot: SlotBody, Name: Text{"Leather vest", "Áo giáp da"}, Rarity: Rare, Price: 350, Stats: Stats{Def: 3, HP: 10}},
	{ID: "scale_mail", Slot: SlotBody, Name: Text{"Scale mail", "Giáp vảy"}, Rarity: Epic, Price: 1200, Stats: Stats{Def: 6, HP: 20}},

	{ID: "cloth_wraps", Slot: SlotHands, Name: Text{"Cloth wraps", "Băng tay vải"}, Rarity: Common, Price: 60, Stats: Stats{Atk: 1}},
	{ID: "leather_gloves", Slot: SlotHands, Name: Text{"Leather gloves", "Găng da"}, Rarity: Rare, Price: 280, Stats: Stats{Atk: 2, Def: 1}},
	{ID: "iron_knuckles", Slot: SlotHands, Name: Text{"Iron knuckles", "Nắm đấm sắt"}, Rarity: Epic, Price: 950, Stats: Stats{Atk: 4}},

	{ID: "walking_stick", Slot: SlotWeapon, Name: Text{"Walking stick", "Gậy chống"}, Rarity: Common, Price: 100, Stats: Stats{Atk: 2}},
	{ID: "bo_staff", Slot: SlotWeapon, Name: Text{"Bo staff", "Côn gỗ"}, Rarity: Rare, Price: 450, Stats: Stats{Atk: 4, Rage: 1}},
	{ID: "twin_blades", Slot: SlotWeapon, Name: Text{"Twin blades", "Song kiếm"}, Rarity: Legendary, Price: 1500, Stats: Stats{Atk: 7, Rage: 2}},

	{ID: "straw_sandals", Slot: SlotFeet, Name: Text{"Straw sandals", "Dép rơm"}, Rarity: Common, Price: 60, Stats: Stats{Time: 1}},
	{ID: "swift_boots", Slot: SlotFeet, Name: Text{"Swift boots", "Giày gió"}, Rarity: Rare, Price: 400, Stats: Stats{Time: 2, Def: 1}},

	{ID: "lucky_coin", Slot: SlotCharm, Name: Text{"Lucky coin", "Đồng xu may mắn"}, Rarity: Common, Price: 120, Stats: Stats{Rage: 1}},
	{ID: "jade_charm", Slot: SlotCharm, Name: Text{"Jade charm", "Bùa ngọc"}, Rarity: Rare, Price: 500, Stats: Stats{HP: 10, Time: 1}},
	{ID: "phoenix_feather", Slot: SlotCharm, Name: Text{"Phoenix feather", "Lông phượng"}, Rarity: Legendary, Price: 1500, Stats: Stats{Rage: 2, HP: 15, Time: 1}},
}

var byID = func() map[string]Item {
	m := make(map[string]Item, len(Items))
	for _, it := range Items {
		m[it.ID] = it
	}
	return m
}()

// ItemByID is a piece of gear, if there is one by that name.
func ItemByID(id string) (Item, bool) {
	it, ok := byID[id]
	return it, ok
}

// Starters is the beggar's kit.
func Starters() []Item {
	var out []Item
	for _, it := range Items {
		if it.Starter {
			out = append(out, it)
		}
	}
	return out
}

// Base is a fighter's own stats at a level, before gear.
func Base(level int) Stats {
	level = max(level, 1)
	return Stats{Atk: 3 + level, Def: level / 2, HP: 40 + 5*level, Time: 10, Rage: 0}
}

// StatsOf is a fighter's stats at a level, wearing the gear given.
func StatsOf(level int, equipped []Item) Stats {
	s := Base(level)
	for _, it := range equipped {
		s = s.Add(it.Stats)
	}
	return s
}

// Looks are the choices a new fighter makes.
const (
	Bodies = 2 // "a" and "b"
	Skins  = 4
	Hairs  = 4
)

// ErrBadFighter is a name or a look that cannot be.
var ErrBadFighter = errors.New("a fighter's name is 2 to 20 letters, and the body, skin and hair one of those offered")

// Look is how a fighter looks, as chosen.
type Look struct {
	Name string `json:"name"`
	Body string `json:"body"`
	Skin int    `json:"skin"`
	Hair int    `json:"hair"`
}

// Clean is the look with its name trimmed, or ErrBadFighter.
func (l Look) Clean() (Look, error) {
	l.Name = strings.Join(strings.Fields(l.Name), " ")
	n := utf8.RuneCountInString(l.Name)
	if n < 2 || n > 20 || (l.Body != "a" && l.Body != "b") || l.Skin < 0 || l.Skin >= Skins || l.Hair < 0 || l.Hair >= Hairs {
		return l, ErrBadFighter
	}
	return l, nil
}
