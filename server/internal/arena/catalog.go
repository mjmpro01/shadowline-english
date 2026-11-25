// Package arena is the Arena's rules: the characters a learner plays, what
// they are worth in a duel, and the questions a word duel asks. Nothing here
// touches the database.
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

// Tiers, from the plainest.
const (
	Common    = "common"
	Rare      = "rare"
	Epic      = "epic"
	Legendary = "legendary"
)

// Tiers is every tier, in order.
var Tiers = []string{Common, Rare, Epic, Legendary}

// TierRank is how far up a tier is: 0 for common.
func TierRank(tier string) int {
	for i, t := range Tiers {
		if t == tier {
			return i
		}
	}
	return 0
}

// Stats is what a fighter brings to a duel.
type Stats struct {
	// Atk is damage dealt by a hit.
	Atk int `json:"atk"`
	// Def is damage taken away from each hit received.
	Def int `json:"def"`
	// HP is health.
	HP int `json:"hp"`
	// Time is seconds added to the time to answer.
	Time int `json:"time"`
	// Rage is extra rage for each right answer: the skill comes sooner.
	Rage int `json:"rage"`
}

// Add is two sets of stats together.
func (s Stats) Add(o Stats) Stats {
	return Stats{s.Atk + o.Atk, s.Def + o.Def, s.HP + o.HP, s.Time + o.Time, s.Rage + o.Rage}
}

// What a character's skill does, besides the hit (see Resolve).
const (
	SkillCrit  = "crit"
	SkillCombo = "combo"
	SkillDrain = "drain"
	SkillHeal  = "heal"
	SkillStun  = "stun"
	SkillFocus = "focus"
)

// SkillKinds is every kind of skill: each tier has one character of each.
var SkillKinds = []string{SkillCrit, SkillCombo, SkillDrain, SkillHeal, SkillStun, SkillFocus}

// Skill is a character's signature move.
type Skill struct {
	Kind string `json:"kind"`
	Name Text   `json:"name"`
}

// Weapon is what a character fights with; Kind is the shape the stand-in
// draws until the character's art arrives.
type Weapon struct {
	Name Text   `json:"name"`
	Kind string `json:"kind"`
}

// Character is one of the fighters a learner can play.
type Character struct {
	ID   string `json:"id"`
	Name Text   `json:"name"`
	Tier string `json:"tier"`
	// Price is in coins; 0 for the two a learner can start as.
	Price  int    `json:"price"`
	Female bool   `json:"female"`
	Weapon Weapon `json:"weapon"`
	Skill  Skill  `json:"skill"`
	// Palette is the stand-in's two colours.
	Palette [2]string `json:"palette"`
}

// Bonus is what a character adds to a fighter's own stats.
func (c Character) Bonus() Stats {
	switch c.Tier {
	case Rare:
		return Stats{Atk: 2, Def: 1, HP: 10}
	case Epic:
		return Stats{Atk: 4, Def: 2, HP: 20, Time: 1}
	case Legendary:
		return Stats{Atk: 6, Def: 3, HP: 30, Time: 1, Rage: 1}
	}
	return Stats{}
}

// Starter is a character every fighter has from the start.
func (c Character) Starter() bool { return c.Price == 0 }

var characterByID = func() map[string]Character {
	m := make(map[string]Character, len(Characters))
	for _, c := range Characters {
		m[c.ID] = c
	}
	return m
}()

// CharacterByID is a character, if there is one by that name.
func CharacterByID(id string) (Character, bool) {
	c, ok := characterByID[id]
	return c, ok
}

// Starters are the characters a learner can start as.
func Starters() []Character {
	var out []Character
	for _, c := range Characters {
		if c.Starter() {
			out = append(out, c)
		}
	}
	return out
}

// Base is a fighter's own stats at a level, before their character.
func Base(level int) Stats {
	level = max(level, 1)
	return Stats{Atk: 3 + level, Def: level / 2, HP: 40 + 5*level, Time: 10, Rage: 0}
}

// StatsOf is a fighter's stats at a level, playing a character.
func StatsOf(level int, c Character) Stats {
	return Base(level).Add(c.Bonus())
}

// ErrBadFighter is a name that cannot be.
var ErrBadFighter = errors.New("a fighter's name is 2 to 20 letters")

// CleanName is a fighter's name with its spaces tidied, or ErrBadFighter.
func CleanName(name string) (string, error) {
	name = strings.Join(strings.Fields(name), " ")
	if n := utf8.RuneCountInString(name); n < 2 || n > 20 {
		return name, ErrBadFighter
	}
	return name, nil
}
