package arena

// The tower: fifteen floors of fighters to beat in a word duel, a boss on every
// fifth. Each opponent is one of the characters a learner can play, so they
// are drawn the same way, and their words get harder as the tower goes up.

// Opponent is the fighter on one floor of the tower.
type Opponent struct {
	Floor int    `json:"floor"`
	ID    string `json:"id"`
	Name  Text   `json:"name"`
	Boss  bool   `json:"boss"`
	// Character is who they are drawn as; Mirror draws them as the learner's
	// own character instead.
	Character Character `json:"character"`
	Mirror    bool      `json:"mirror,omitempty"`

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

	Coins int `json:"coins"`
	XP    int `json:"xp"`

	// A shadow: another learner's fighter, or a sparring bot, as fought.
	Level  int  `json:"level,omitempty"`
	Rating int  `json:"rating,omitempty"`
	Bot    bool `json:"bot,omitempty"`
}

// mirrorName is the thirteenth floor: the learner's own shadow.
var mirrorName = Text{"Mirror shadow", "Bóng gương"}

// Tower is every floor, from the first.
var Tower = func() []Opponent {
	out := make([]Opponent, len(towerCharacters))
	for i, id := range towerCharacters {
		n := i + 1
		boss := n%5 == 0
		o := Opponent{
			Floor: n, ID: id, Boss: boss,
			Atk: 3 + n, Def: n / 3, HP: 30 + 8*n,
			TimeDelta: n / 4, Telegraph: 5,
			Coins: 10 + 6*n, XP: 20 * n,
		}
		if c, ok := CharacterByID(id); ok {
			o.Name, o.Character = c.Name, c
		} else {
			// The mirror: drawn as whoever climbs the tower.
			o.Name, o.Mirror = mirrorName, true
			o.Character, _ = CharacterByID("beggar")
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

// BossBonus is what beating a boss's floor pays the first time, on top of its
// coins: a big step towards the next character.
func BossBonus(floor int) int {
	switch floor {
	case 5:
		return 300
	case 10:
		return 800
	case 15:
		return 1500
	}
	return 0
}

// Floor is the opponent on floor n, counted from 1.
func Floor(n int) (Opponent, bool) {
	if n < 1 || n > len(Tower) {
		return Opponent{}, false
	}
	return Tower[n-1], true
}
