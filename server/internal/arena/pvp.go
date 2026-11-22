package arena

import (
	"fmt"
	"math"
)

// Duels against shadows: another learner's fighter, as strong as their level
// and gear make them, played by the machine. Nobody has to be there at the
// same time. A win or a loss moves the attacker's rating; the defender, who
// was not playing, keeps theirs.

// The rating everyone starts at, the least anyone can fall to, and how far
// one duel can move it.
const (
	StartRating = 1000
	MinRating   = 100
	EloK        = 32
)

// PvPXP is the experience a win over a shadow gives.
const PvPXP = 15

// Elo is how far a duel moves the attacker's rating.
func Elo(attacker, defender int, won bool) int {
	expected := 1 / (1 + math.Pow(10, float64(defender-attacker)/400))
	score := 0.0
	if won {
		score = 1
	}
	return int(math.Round(EloK * (score - expected)))
}

// PvPCoins is what beating a shadow pays: more for one above the learner.
func PvPCoins(level, opponentLevel int) int {
	return 15 + 5*max(0, opponentLevel-level)
}

// Shadow is a learner's fighter as an opponent: their stats in their gear,
// questions as hard as their rating says.
func Shadow(id string, name string, look Look, equipped map[string]string, level, rating int) Opponent {
	var worn []Item
	for _, itemID := range equipped {
		if it, ok := ItemByID(itemID); ok {
			worn = append(worn, it)
		}
	}
	stats := StatsOf(level, worn)
	o := Opponent{
		ID: id, Name: Text{En: name, Vi: name}, Look: look, Equipped: equipped,
		Atk: stats.Atk, Def: stats.Def, HP: stats.HP,
		TimeDelta: 1, Telegraph: 4,
		Level: max(1, level), Rating: rating,
	}
	switch {
	case rating < 1100:
		o.Kinds, o.RankLo, o.RankHi = []string{AskMeaning, AskListen}, 1, 3000
	case rating < 1300:
		o.Kinds, o.RankLo, o.RankHi = []string{AskMeaning, AskListen, AskIPA}, 1, 6000
	default:
		o.Kinds, o.RankLo, o.RankHi = []string{AskMeaning, AskListen, AskIPA, AskScramble}, 2000, 10000
	}
	return o
}

// BotFloor is the tower floor a sparring bot for a fighter of this level
// comes from, offset by `step` floors.
func BotFloor(level, step int) int {
	return min(len(Tower), max(1, level+step))
}

// Bot is a tower fighter as a sparring shadow, for when there are too few
// learners to fight: rated like a learner of their strength.
func Bot(floor int) (Opponent, bool) {
	o, ok := Floor(floor)
	if !ok {
		return o, false
	}
	o.ID = fmt.Sprintf("bot:%d", floor)
	o.Bot, o.Boss = true, false
	o.Level, o.Rating = floor, 900+25*floor
	o.Drop, o.DropChance = "", 0
	return o, true
}
