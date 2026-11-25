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
	// to come to be drawn as a heavy hit. The damage itself falls with every
	// second taken (see Resolve).
	HeavyWithin = 0.4
	// CounterAfter is the share of the time after which a right answer is
	// hit back: the opponent had time to strike too.
	CounterAfter = 0.3
	// Grace is the network's share of an answer's time.
	Grace = 1500 * time.Millisecond
	// RageFull is when the special can be used.
	RageFull = 100
	// RageBase is rage for a right answer, before the character; ComboBonus more for
	// the third right in a row and every one after.
	RageBase   = 20
	ComboBonus = 10
	// EnergyMax is the most duels saved up; one comes back every EnergyEvery,
	// and every PointsPerEnergy points of practice give one too.
	EnergyMax       = 5
	EnergyEvery     = time.Hour
	PointsPerEnergy = 10
	// FocusSeconds is the time a focus skill adds to each of the next
	// FocusTurns questions.
	FocusSeconds = 4
	FocusTurns   = 3
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
// attack gives less: it has to be quick. focused adds a focus skill's seconds.
func AnswerSeconds(fighterTime int, o Opponent, kind string, block, focused bool) int {
	s := max(MinSeconds, fighterTime-o.TimeDelta)
	if focused {
		s += FocusSeconds
	}
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
	// The fighter's skill and their character's tier, and their health when
	// full, which a heal never goes past.
	Skill string
	Tier  int
	MaxHP int
	// Shield is hits still to be shrugged off, from a stun.
	Shield int
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
	// What a skill did besides the hit: its kind, the health it gave back,
	// a hit it left the opponent unable to land, the questions with more time.
	Skill  string `json:"skill,omitempty"`
	Healed int    `json:"healed,omitempty"`
	Shield int    `json:"shield"`
	// Shielded is a hit taken for nothing: the opponent was stunned.
	Shielded bool `json:"shielded,omitempty"`
	Focus    int  `json:"focus,omitempty"`
	// Countered is a right answer the opponent still hit back: it came late.
	Countered bool `json:"countered,omitempty"`
	// Speed is the share of the time left when the answer came, 0 to 100.
	Speed int `json:"speed"`
}

// used is the share of the time an answer took, 0 to 1; an answer with no
// time limit counts as instant.
func used(f Fight) float64 {
	if f.Allowed <= 0 {
		return 0
	}
	return math.Min(1, math.Max(0, float64(f.Elapsed)/float64(f.Allowed)))
}

// Swing is how hard a right answer hits, as a multiple of attack, after a
// share s of the time: 1.6 at once, 0.6 at the buzzer.
func Swing(s float64) float64 { return 1.6 - s }

// Counter is how hard the opponent hits back after a right answer that took
// a share s of the time, as a multiple of their attack: nothing within the
// first CounterAfter of it, then up to 0.7 at the buzzer.
func Counter(s float64) float64 {
	return 0.7 * math.Max(0, (s-CounterAfter)/(1-CounterAfter))
}

// times is power at a multiple, rounded.
func times(power int, by float64) int { return int(math.Round(float64(power) * by)) }

// skill is what a skill does: the damage, the health back, a stun, focus.
// Each tier above common makes it 10% stronger.
func skill(f Fight) (dealt, healed, shield, focus int) {
	// Stronger up the tiers, and the quicker it comes the harder it lands.
	p := (1 + 0.1*float64(f.Tier)) * (1.3 - 0.6*used(f))
	switch f.Skill {
	case SkillCrit:
		return hit(times(f.Atk, 3.5*p), f.OppDef), 0, 0, 0
	case SkillCombo:
		return hit(times(f.Atk, 2*p), f.OppDef) + hit(times(f.Atk, 1.5*p), f.OppDef), 0, 0, 0
	case SkillDrain:
		d := hit(times(f.Atk, 2.5*p), f.OppDef)
		return d, d / 2, 0, 0
	case SkillHeal:
		return hit(times(f.Atk, 2*p), f.OppDef), times(max(f.MaxHP, f.HP), 0.3*p), 0, 0
	case SkillStun:
		return hit(times(f.Atk, 2*p), f.OppDef), 0, 1, 0
	case SkillFocus:
		return hit(times(f.Atk, 2.5*p), f.OppDef), 0, 0, FocusTurns
	}
	// A duel from before characters had skills.
	return hit(f.Atk*3, f.OppDef), 0, 0, 0
}

func hit(power, def int) int { return max(1, power-def) }

// Resolve is what one answer does.
func Resolve(f Fight) Result {
	r := Result{Rage: f.Rage, Combo: f.Combo, HP: f.HP, OppHP: f.OppHP, Shield: f.Shield}
	s := used(f)
	r.Speed = int(math.Round(100 * (1 - s)))
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
		var shield int
		r.Dealt, r.Healed, shield, r.Focus = skill(f)
		r.Shield = max(r.Shield, shield)
		r.Skill = f.Skill
		r.Combo++
	case f.Right:
		// The sooner the harder; and late enough, the opponent hits back.
		r.Move = MoveLight
		if s <= HeavyWithin {
			r.Move = MoveHeavy
		}
		r.Dealt = hit(times(f.Atk, Swing(s)), f.OppDef)
		r.Taken = max(0, times(f.OppAtk, Counter(s))-f.Def)
		r.Countered = r.Taken > 0
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
	if r.Taken > 0 && r.Shield > 0 {
		// Stunned: the opponent's hit does not land.
		r.Taken, r.Shielded = 0, true
		r.Shield--
	}
	r.OppHP = max(0, f.OppHP-r.Dealt)
	r.HP = max(0, f.HP-r.Taken+r.Healed)
	if f.MaxHP > 0 {
		r.HP = min(r.HP, f.MaxHP)
		r.Healed = min(r.Healed, max(0, f.MaxHP-(f.HP-r.Taken)))
	}
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
