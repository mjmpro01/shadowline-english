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

// Item is anything that sits in the bag: seeds, and things that restore stamina.
type Item struct {
	ID    string `json:"id"`
	Name  Text   `json:"name"`
	Kind  string `json:"kind"` // "seed" or "food"
	Price int    `json:"price"`
	// Stamina a food restores.
	Stamina int `json:"stamina,omitempty"`
	// UnlockStep is the main-quest step from which the shop sells it: the story
	// opens the better seeds as it goes.
	UnlockStep int `json:"unlockStep"`
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
	{ID: "seed_sprout", Name: Text{"Sprout seeds", "Hạt Mầm xanh"}, Kind: "seed", Price: 10},
	{ID: "seed_bloom", Name: Text{"Bloom seeds", "Hạt Hoa nở"}, Kind: "seed", Price: 40, UnlockStep: BloomStep},
	{ID: "seed_golden", Name: Text{"Golden seeds", "Hạt Cây vàng"}, Kind: "seed", Price: 120, UnlockStep: GoldenStep},
	{ID: "ginger_tea", Name: Text{"Ginger tea", "Trà gừng"}, Kind: "food", Price: 25, Stamina: 10},
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

// UpgradeCost is what raising a plot's soil from this level costs.
func UpgradeCost(level int) int {
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
	if stored >= StaminaMax {
		return stored, time.Time{}
	}
	gained := 0
	if now.After(at) {
		gained = int(now.Sub(at) / StaminaRegen)
	}
	value = stored + gained
	if value >= StaminaMax {
		return StaminaMax, time.Time{}
	}
	return value, at.Add(time.Duration(gained+1) * StaminaRegen)
}

// SetStamina is the (stored, at) pair to write for a new current value,
// keeping the part of a point already regained so spending does not reset the
// clock.
func SetStamina(stored int, at, now time.Time, value int) (int, time.Time) {
	value = max(0, min(value, StaminaMax))
	_, next := Stamina(stored, at, now)
	if next.IsZero() || value >= StaminaMax {
		return value, now
	}
	return value, next.Add(-StaminaRegen)
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
