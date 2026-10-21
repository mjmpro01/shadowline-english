// Package game is the Arena's rules: what grows, what it costs, what it yields,
// and the quests. All of it is data and arithmetic, with no database in it, so
// the numbers can be read and tuned in one place and tested without Postgres.
package game

import "time"

// Text is a line in English with its Vietnamese beside it. The game speaks
// English; the translation is there to tap for.
type Text struct {
	En string `json:"en"`
	Vi string `json:"vi"`
}

// Crop is something a plot can grow. A crop yields gold and one word, drawn
// from a band of how common English words are: a cheap seed grows an everyday
// word, a rare seed a rare one.
type Crop struct {
	ID     string        `json:"id"`
	Name   Text          `json:"name"`
	Seed   string        `json:"seed"`
	Grow   time.Duration `json:"-"`
	Gold   int           `json:"gold"`
	RankLo int           `json:"-"`
	RankHi int           `json:"-"`
	// GrowSeconds is Grow for the browser, which draws the crop growing.
	GrowSeconds int `json:"growSeconds"`
}

// Item is anything that sits in the bag: seeds, and things that restore stamina
// or health.
type Item struct {
	ID    string `json:"id"`
	Name  Text   `json:"name"`
	Kind  string `json:"kind"` // "seed", "food", "gift", or "tool" (kept, never sold)
	Price int    `json:"price"`
	// Stamina a food restores.
	Stamina int `json:"stamina,omitempty"`
	// HP a food restores.
	HP int `json:"hp,omitempty"`
	// UnlockStep is the main-quest step from which the shop sells it: the story
	// opens the better seeds as it goes.
	UnlockStep int `json:"unlockStep"`
	// Seller is who sells it: Mira, or Hugo at the café in town.
	Seller string `json:"seller"`
}

const (
	StartGold  = 50
	StaminaMax = 30
	// StaminaRegen is how long one point of stamina takes to come back on its own.
	StaminaRegen = 5 * time.Minute
	PlantCost    = 2
	HarvestCost  = 1
	// SleepEvery is how often sleeping refills stamina: a nap, not a free refill
	// on demand.
	SleepEvery = 4 * time.Hour
	Plots      = 12
	StartPlots = 4
	MaxLevel   = 3
	// Each level of soil takes this share off a crop's growing time.
	LevelSpeedup = 20
)

// StartItems is what a new farmer finds in the bag.
var StartItems = map[string]int{"seed_sprout": 3}

var Crops = []Crop{
	{ID: "sprout", Name: Text{"Sprout", "Mầm xanh"}, Seed: "seed_sprout",
		Grow: 2 * time.Minute, Gold: 15, RankLo: 1, RankHi: 2000},
	{ID: "bloom", Name: Text{"Bloom", "Hoa nở"}, Seed: "seed_bloom",
		Grow: 20 * time.Minute, Gold: 70, RankLo: 2001, RankHi: 6000},
	{ID: "golden", Name: Text{"Golden", "Cây vàng"}, Seed: "seed_golden",
		Grow: 2 * time.Hour, Gold: 250, RankLo: 6001, RankHi: 12000},
}

var Items = []Item{
	{ID: "seed_sprout", Name: Text{"Sprout seeds", "Hạt Mầm xanh"}, Kind: "seed", Price: 10, Seller: "mira"},
	{ID: "seed_bloom", Name: Text{"Bloom seeds", "Hạt Hoa nở"}, Kind: "seed", Price: 40, UnlockStep: BloomStep, Seller: "mira"},
	{ID: "seed_golden", Name: Text{"Golden seeds", "Hạt Cây vàng"}, Kind: "seed", Price: 120, UnlockStep: GoldenStep, Seller: "mira"},
	{ID: "ginger_tea", Name: Text{"Ginger tea", "Trà gừng"}, Kind: "food", Price: 25, Stamina: 10, Seller: "mira"},
	{ID: "herb_salve", Name: Text{"Herb salve", "Thuốc thảo mộc"}, Kind: "food", Price: 30, HP: 15, UnlockStep: WoodsStep, Seller: "mira"},
	// Gifts for the people in town, and what Hugo's café serves.
	{ID: "flowers", Name: Text{"Bunch of flowers", "Bó hoa"}, Kind: "gift", Price: 20, UnlockStep: TownStep, Seller: "mira"},
	{ID: "old_book", Name: Text{"Old book", "Sách cũ"}, Kind: "gift", Price: 30, UnlockStep: TownStep, Seller: "mira"},
	{ID: "wool_scarf", Name: Text{"Wool scarf", "Khăn len"}, Kind: "gift", Price: 35, UnlockStep: TownStep, Seller: "mira"},
	{ID: "honey_cake", Name: Text{"Honey cake", "Bánh mật ong"}, Kind: "gift", Price: 25, UnlockStep: TownStep, Seller: "hugo"},
	{ID: "coffee", Name: Text{"Coffee", "Cà phê"}, Kind: "food", Price: 20, Stamina: 12, UnlockStep: TownStep, Seller: "hugo"},
	{ID: "soup", Name: Text{"Warm soup", "Súp nóng"}, Kind: "food", Price: 35, HP: 20, UnlockStep: TownStep, Seller: "hugo"},
	// Bram's hammer, won back from the troll: with it he can work soil one
	// level further. The shop never has it.
	{ID: "bram_hammer", Name: Text{"Bram's hammer", "Búa của Bram"}, Kind: "tool", UnlockStep: Never},
}

// Never is an unlock step no story reaches: what is never in the shop.
const Never = 1 << 30

// HammerLevel is how rich soil gets once Bram has his hammer back.
const HammerLevel = MaxLevel + 1

// MaxLevelFor is the richest soil Bram can make, with or without his hammer.
func MaxLevelFor(hasHammer bool) int {
	if hasHammer {
		return HammerLevel
	}
	return MaxLevel
}

func init() {
	for i := range Crops {
		Crops[i].GrowSeconds = int(Crops[i].Grow / time.Second)
	}
}

func CropByID(id string) (Crop, bool) {
	for _, c := range Crops {
		if c.ID == id {
			return c, true
		}
	}
	return Crop{}, false
}

// CropFromSeed is the crop a seed grows into.
func CropFromSeed(item string) (Crop, bool) {
	for _, c := range Crops {
		if c.Seed == item {
			return c, true
		}
	}
	return Crop{}, false
}

func ItemByID(id string) (Item, bool) {
	for _, it := range Items {
		if it.ID == id {
			return it, true
		}
	}
	return Item{}, false
}

// UnlockCost is what opening one more plot costs, given how many are open.
func UnlockCost(unlocked int) int {
	return 80 + 40*(unlocked-StartPlots)
}

// UpgradeCost is what raising a plot's soil from this level costs. The last
// level, the hammer's, costs a good deal more.
func UpgradeCost(level int) int {
	if level >= MaxLevel {
		return 600
	}
	return 60 * (level + 1)
}

// GrowTime is how long a crop takes on soil of this level.
func GrowTime(c Crop, level int) time.Duration {
	return c.Grow * time.Duration(100-LevelSpeedup*level) / 100
}

// Stamina works the stored value forward to now: one point back every
// StaminaRegen, up to the maximum. next is when the next point arrives, or the
// zero time when it is already full.
func Stamina(stored int, at, now time.Time) (value int, next time.Time) {
	return regen(stored, at, now, StaminaMax, StaminaRegen)
}

// SetStamina is the (stored, at) pair to write for a new current value,
// keeping the part of a point already regained so spending does not reset the
// clock.
func SetStamina(stored int, at, now time.Time, value int) (int, time.Time) {
	return setRegen(stored, at, now, value, StaminaMax, StaminaRegen)
}

// HP is health worked forward to now, the way Stamina is: a point back every
// HPRegen, up to HPMax.
func HP(stored int, at, now time.Time) (value int, next time.Time) {
	return regen(stored, at, now, HPMax, HPRegen)
}

// SetHP is SetStamina for health.
func SetHP(stored int, at, now time.Time, value int) (int, time.Time) {
	return setRegen(stored, at, now, value, HPMax, HPRegen)
}

func regen(stored int, at, now time.Time, top int, every time.Duration) (value int, next time.Time) {
	if stored >= top {
		return stored, time.Time{}
	}
	gained := 0
	if now.After(at) {
		gained = int(now.Sub(at) / every)
	}
	value = stored + gained
	if value >= top {
		return top, time.Time{}
	}
	return value, at.Add(time.Duration(gained+1) * every)
}

func setRegen(stored int, at, now time.Time, value, top int, every time.Duration) (int, time.Time) {
	value = max(0, min(value, top))
	_, next := regen(stored, at, now, top, every)
	if next.IsZero() || value >= top {
		return value, now
	}
	return value, next.Add(-every)
}

// vietnam is the day boundary for daily quests. Vietnam keeps no daylight
// saving, and a fixed zone needs no tzdata in the image.
var vietnam = time.FixedZone("ICT", 7*60*60)

// Day is the quest day that now falls in, and when it starts and ends.
func Day(now time.Time) (day string, start, end time.Time) {
	local := now.In(vietnam)
	start = time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, vietnam)
	return start.Format("2006-01-02"), start, start.AddDate(0, 0, 1)
}
