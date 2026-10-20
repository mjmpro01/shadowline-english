package game

import "time"

// The woods: what lives there, where, and how a fight with it goes.
//
// A fight is turns of single-word questions. A right answer strikes the
// monster; a wrong one, or none in time, and the monster strikes back. Health
// runs down like stamina does and comes back the same way, so a player who
// loses has to rest, eat, or wait before fighting again.

// The kinds of question a monster asks.
const (
	// Meaning: a word, and four definitions to choose from.
	GameMeaning = "meaning"
	// Listen: a word spoken aloud, and four words to choose from.
	GameListen = "listen"
	// Scramble: the word's letters shuffled, its definition as a hint; the
	// player puts them back in order.
	GameScramble = "scramble"
	// IPA: a pronunciation written in IPA, and four words to choose from.
	GameIPA = "ipa"
)

// Monster is something that lives in the woods.
type Monster struct {
	ID   string `json:"id"`
	Name Text   `json:"name"`
	HP   int    `json:"hp"`
	// Hit is the health a wrong answer costs the player.
	Hit   int      `json:"hit"`
	Games []string `json:"-"`
	// Seconds to answer, and longer for putting letters in order.
	Seconds         int `json:"-"`
	ScrambleSeconds int `json:"-"`
	// The band of how common its words are, when the learner's own vocabulary
	// runs short.
	RankLo int `json:"-"`
	RankHi int `json:"-"`
	Gold   int `json:"gold"`
	// CleanBonus is extra gold for a win without being hit once.
	CleanBonus int `json:"-"`
	// Drop is an item it may leave behind, one time in 100/DropChance.
	Drop       string `json:"-"`
	DropChance int    `json:"-"`
}

var Monsters = []Monster{
	{ID: "word_slime", Name: Text{"Word-slime", "Slime chữ"}, HP: 3, Hit: 3,
		Games: []string{GameMeaning, GameListen}, Seconds: 12, ScrambleSeconds: 20,
		RankLo: 1, RankHi: 2000, Gold: 8, CleanBonus: 4},
	{ID: "echo_bat", Name: Text{"Echo-bat", "Dơi vọng âm"}, HP: 4, Hit: 4,
		Games: []string{GameListen, GameIPA, GameScramble}, Seconds: 10, ScrambleSeconds: 20,
		RankLo: 1, RankHi: 4000, Gold: 14, CleanBonus: 6, Drop: "herb_salve", DropChance: 20},
}

func MonsterByID(id string) (Monster, bool) {
	for _, m := range Monsters {
		if m.ID == id {
			return m, true
		}
	}
	return Monster{}, false
}

// Spawn is a place in the woods where a monster lives. X and Y are tiles.
type Spawn struct {
	ID      string `json:"id"`
	Monster string `json:"monster"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
}

var Spawns = []Spawn{
	{ID: "slime_1", Monster: "word_slime", X: 9, Y: 7},
	{ID: "slime_2", Monster: "word_slime", X: 15, Y: 12},
	{ID: "slime_3", Monster: "word_slime", X: 7, Y: 15},
	{ID: "slime_4", Monster: "word_slime", X: 20, Y: 6},
	{ID: "bat_1", Monster: "echo_bat", X: 24, Y: 15},
	{ID: "bat_2", Monster: "echo_bat", X: 27, Y: 8},
}

func SpawnByID(id string) (Spawn, bool) {
	for _, s := range Spawns {
		if s.ID == id {
			return s, true
		}
	}
	return Spawn{}, false
}

const (
	HPMax = 30
	// HPRegen is how long one point of health takes to come back on its own.
	HPRegen = 2 * time.Minute
	// FightCost is the stamina a fight takes to start.
	FightCost = 3
	// MinHPToFight: below this, the player is too hurt to start a fight.
	MinHPToFight = 6
	// Respawn is how long a beaten monster stays away.
	Respawn = 10 * time.Minute
	// FaintHP is the health a player wakes up with at home after losing.
	FaintHP = 15
	// Grace is extra time allowed for an answer on its way over the network.
	Grace = 1500 * time.Millisecond
	// ReviewWords: a learner with fewer words than this in their vocabulary
	// gets common words from the monster's band as well.
	ReviewWords = 8
)

// FaintFine is the gold lost on fainting: a tenth, at most 50.
func FaintFine(gold int) int {
	return min(50, gold/10)
}

// Strike is the damage a right answer does: double when it came in the first
// third of the time allowed.
func Strike(elapsed, allowed time.Duration) int {
	if elapsed <= allowed/3 {
		return 2
	}
	return 1
}

// TimeFor is how long a monster gives for a kind of question.
func TimeFor(m Monster, kind string) time.Duration {
	if kind == GameScramble {
		return time.Duration(m.ScrambleSeconds) * time.Second
	}
	return time.Duration(m.Seconds) * time.Second
}
