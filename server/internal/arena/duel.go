package arena

import (
	"math"
	"time"
)

// The word duel's rules: how long a learner has to answer, what an answer
// does, rage and the special, the big attack that can be blocked, energy, and
// levels. Nothing here keeps state; the store does.

// The duel's numbers.
const (
	// MinSeconds is the least time a question ever gives.
	MinSeconds = 5
	// ScrambleExtra is the time added for putting letters in order.
	ScrambleExtra = 6
	// HeavyWithin is how early, as a share of the time, a right answer has
	// to come to land a heavy hit.
	HeavyWithin = 0.4
	// Grace is the network's share of an answer's time.
	Grace = 1500 * time.Millisecond
	// RageFull is when the special can be used.
	RageFull = 100
	// RageBase is rage for a right answer, before gear; ComboBonus more for
	// the third right in a row and every one after.
	RageBase   = 20
	ComboBonus = 10
	// EnergyMax is the most duels saved up; one comes back every EnergyEvery,
	// and every PointsPerEnergy points of practice give one too.
	EnergyMax       = 5
	EnergyEvery     = time.Hour
	PointsPerEnergy = 10
)

// Moves an answer turns into.
const (
	MoveLight   = "light"
	MoveHeavy   = "heavy"
	MoveSpecial = "special"
	MoveBlock   = "block"
	MoveHit     = "hit"
)

// AnswerSeconds is the time a question gives: the fighter's time, less the
// opponent's, and more for a scramble; never under MinSeconds. A blockable
// attack gives less: it has to be quick.
func AnswerSeconds(fighterTime int, o Opponent, kind string, block bool) int {
	s := max(MinSeconds, fighterTime-o.TimeDelta)
	if kind == AskScramble {
		s += ScrambleExtra
	}
	if block {
		s = max(MinSeconds-1, s*7/10)
	}
	return s
}

// IsTelegraph is whether turn n (counted from 1) is the opponent's big attack.
func IsTelegraph(turn int, o Opponent) bool {
	return o.Telegraph > 0 && turn > 0 && turn%o.Telegraph == 0
}

// Fight is the state an answer acts on.
type Fight struct {
	Atk, Def  int
	RageStat  int
	OppAtk    int
	OppDef    int
	Rage      int
	Combo     int
	Block     bool
	Special   bool
	Elapsed   time.Duration
	Allowed   time.Duration
	Right     bool
	OppHP, HP int
}

// Result is what an answer did.
type Result struct {
	Move  string `json:"move"`
	Dealt int    `json:"dealt"`
	Taken int    `json:"taken"`
	Rage  int    `json:"rage"`
	Combo int    `json:"combo"`
	HP    int    `json:"hp"`
	OppHP int    `json:"oppHp"`
}

func hit(power, def int) int { return max(1, power-def) }

// Resolve is what one answer does.
func Resolve(f Fight) Result {
	r := Result{Rage: f.Rage, Combo: f.Combo, HP: f.HP, OppHP: f.OppHP}
	switch {
	case f.Block && f.Right:
		r.Move = MoveBlock
		r.Dealt = hit(f.Atk, f.OppDef)
		r.Combo++
	case f.Block:
		r.Move = MoveHit
		r.Taken = hit(int(math.Round(float64(f.OppAtk)*1.8)), f.Def)
		r.Combo = 0
	case f.Right && f.Special && f.Rage >= RageFull:
		r.Move = MoveSpecial
		r.Dealt = hit(f.Atk*3, f.OppDef)
		r.Combo++
	case f.Right && f.Allowed > 0 && float64(f.Elapsed) <= HeavyWithin*float64(f.Allowed):
		r.Move = MoveHeavy
		r.Dealt = hit(int(math.Round(float64(f.Atk)*1.6)), f.OppDef)
		r.Combo++
	case f.Right:
		r.Move = MoveLight
		r.Dealt = hit(f.Atk, f.OppDef)
		r.Combo++
	default:
		r.Move = MoveHit
		r.Taken = hit(f.OppAtk, f.Def)
		r.Combo = 0
	}
	switch {
	case r.Move == MoveSpecial:
		r.Rage = 0
	case f.Right:
		gain := RageBase + 5*f.RageStat
		if r.Combo >= 3 {
			gain += ComboBonus
		}
		r.Rage = min(RageFull, f.Rage+gain)
	case f.Special && f.Rage >= RageFull:
		// Armed and missed: half of it goes.
		r.Rage = RageFull / 2
	}
	r.OppHP = max(0, f.OppHP-r.Dealt)
	r.HP = max(0, f.HP-r.Taken)
	return r
}

// Energy is the energy a fighter has now, saved at `at`, with the time the
// next one comes back (zero when full).
func Energy(saved int, at, now time.Time) (int, time.Time) {
	if saved >= EnergyMax {
		return EnergyMax, time.Time{}
	}
	gained := int(now.Sub(at) / EnergyEvery)
	e := min(EnergyMax, saved+max(0, gained))
	if e >= EnergyMax {
		return EnergyMax, time.Time{}
	}
	return e, at.Add(time.Duration(max(0, gained)+1) * EnergyEvery)
}

// SetEnergy is the saved energy and its time after energy is spent or added
// now, keeping the hour already under way.
func SetEnergy(saved int, at, now time.Time, to int) (int, time.Time) {
	current, _ := Energy(saved, at, now)
	if current >= EnergyMax {
		return min(to, EnergyMax), now
	}
	gained := int(now.Sub(at) / EnergyEvery)
	return min(to, EnergyMax), at.Add(time.Duration(max(0, gained)) * EnergyEvery)
}

// XPForNext is the experience a fighter at a level needs for the next.
func XPForNext(level int) int { return 100 * max(1, level) }

// AddXP is a fighter's level and experience after gaining some.
func AddXP(level, xp, gained int) (int, int) {
	level, xp = max(1, level), xp+gained
	for xp >= XPForNext(level) {
		xp -= XPForNext(level)
		level++
	}
	return level, xp
}
