package game

import (
	"hash/fnv"
	"math/rand"
)

// Counter says what a quest counts. Progress is counted from what is already
// written down — the game's own event log, the learner's takes and flashcards —
// when it is asked for, rather than kept in counters every action would have to
// remember to bump.
type Counter struct {
	// Kind is one of:
	//   "event"   — game events of kind Item (plant, harvest, buy, sleep, unlock, listen…)
	//   "words"   — words harvested
	//   "takes"   — Shadowing lines practised, scoring at least MinScore when set
	//   "reviews" — flashcards reviewed
	//   "spent"   — gold spent
	Kind     string `json:"-"`
	Item     string `json:"-"`
	MinScore int    `json:"-"`
	// Ever counts from the start of the game rather than from when the quest
	// began: "collect ten words" means ten in all.
	Ever bool `json:"-"`
}

type Reward struct {
	Gold    int            `json:"gold,omitempty"`
	Stamina int            `json:"stamina,omitempty"`
	Items   map[string]int `json:"items,omitempty"`
}

// Step is one step of the main quest line: someone says something, asks for
// something, and pays for it.
type Step struct {
	ID        string  `json:"id"`
	Chapter   int     `json:"chapter"`
	Giver     string  `json:"giver"`
	Title     Text    `json:"title"`
	Lines     []Text  `json:"lines"`
	Objective Text    `json:"objective"`
	Counter   Counter `json:"-"`
	Target    int     `json:"target"`
	Reward    Reward  `json:"reward"`
}

// The main-quest steps that open the better seeds in the shop.
const (
	BloomStep  = 8
	GoldenStep = 9
)

// MainQuests is the story so far: chapter 1, the farm. It doubles as the
// tutorial — each step asks for the next thing a new farmer needs to learn.
var MainQuests = []Step{
	{
		ID: "letter", Chapter: 1, Giver: "grandma",
		Title: Text{"A letter from Grandma", "Thư của bà"},
		Lines: []Text{
			{"Dear child, the farm in Echo Vale is yours now.", "Cháu yêu, trang trại ở Echo Vale giờ là của cháu."},
			{"Plant a seed, and the land will give you a word.", "Hãy gieo một hạt giống, mảnh đất sẽ tặng cháu một từ."},
			{"Love, Grandma", "Thương cháu, Bà"},
		},
		Objective: Text{"Plant your first seed", "Gieo hạt giống đầu tiên"},
		Counter:   Counter{Kind: "event", Item: "plant"}, Target: 1,
		Reward: Reward{Gold: 20},
	},
	{
		ID: "first_harvest", Chapter: 1, Giver: "sir_shadow",
		Title: Text{"The first harvest", "Mùa thu hoạch đầu tiên"},
		Lines: []Text{
			{"Welcome to Echo Vale! I am Sir Shadow.", "Chào mừng đến Echo Vale! Ta là Hiệp sĩ Shadow."},
			{"Your seed is growing. When it is ready, harvest it.", "Hạt của cậu đang lớn. Khi nó chín, hãy thu hoạch."},
		},
		Objective: Text{"Harvest your first crop", "Thu hoạch cây đầu tiên"},
		Counter:   Counter{Kind: "event", Item: "harvest"}, Target: 1,
		Reward: Reward{Gold: 20},
	},
	{
		ID: "listen", Chapter: 1, Giver: "sir_shadow",
		Title: Text{"A word to hear", "Một từ để nghe"},
		Lines: []Text{
			{"Every crop here grows a word.", "Mỗi cây ở đây đều mọc ra một từ."},
			{"Tap the speaker and listen to your new word.", "Bấm vào loa và nghe từ mới của cậu."},
		},
		Objective: Text{"Listen to a word you harvested", "Nghe một từ cậu đã thu hoạch"},
		Counter:   Counter{Kind: "event", Item: "listen"}, Target: 1,
		Reward: Reward{Gold: 10},
	},
	{
		ID: "meet_mira", Chapter: 1, Giver: "mira",
		Title: Text{"Mira's cart", "Xe hàng của Mira"},
		Lines: []Text{
			{"Hello! I'm Mira. I sell seeds and tea.", "Xin chào! Tớ là Mira. Tớ bán hạt giống và trà."},
			{"Would you like to buy something?", "Cậu có muốn mua gì không?"},
		},
		Objective: Text{"Buy something from Mira", "Mua một món ở chỗ Mira"},
		Counter:   Counter{Kind: "event", Item: "buy"}, Target: 1,
		Reward: Reward{Gold: 15},
	},
	{
		ID: "sleep", Chapter: 1, Giver: "sir_shadow",
		Title: Text{"A good rest", "Một giấc ngủ ngon"},
		Lines: []Text{
			{"You look tired. Farming takes energy.", "Trông cậu mệt rồi. Làm nông tốn sức lắm."},
			{"Go home and sleep. You will feel better.", "Về nhà ngủ đi. Cậu sẽ thấy khoẻ hơn."},
		},
		Objective: Text{"Sleep in your house", "Ngủ trong nhà"},
		Counter:   Counter{Kind: "event", Item: "sleep"}, Target: 1,
		Reward: Reward{Items: map[string]int{"ginger_tea": 1}},
	},
	{
		ID: "meet_bram", Chapter: 1, Giver: "bram",
		Title: Text{"More land", "Thêm đất"},
		Lines: []Text{
			{"Hi, I'm Bram, the carpenter.", "Chào, tôi là Bram, thợ mộc."},
			{"I can clear more land for you. It costs some gold.", "Tôi có thể dọn thêm đất cho cậu. Tốn ít vàng thôi."},
		},
		Objective: Text{"Open a new plot with Bram", "Nhờ Bram mở thêm một ô đất"},
		Counter:   Counter{Kind: "event", Item: "unlock"}, Target: 1,
		Reward: Reward{Gold: 30},
	},
	{
		ID: "ten_words", Chapter: 1, Giver: "sir_shadow",
		Title: Text{"A basket of words", "Một giỏ từ"},
		Lines: []Text{
			{"Look at all those words!", "Nhìn kìa, bao nhiêu là từ!"},
			{"Collect ten. They wait for you in your flashcards.", "Hãy thu đủ mười từ. Chúng sẽ chờ cậu trong thẻ ghi nhớ."},
		},
		Objective: Text{"Collect 10 words", "Thu thập 10 từ"},
		Counter:   Counter{Kind: "words", Ever: true}, Target: 10,
		Reward: Reward{Gold: 50},
	},
	{
		ID: "say_it", Chapter: 1, Giver: "sir_shadow",
		Title: Text{"Say it out loud", "Nói thành tiếng"},
		Lines: []Text{
			{"Words are stronger when you say them.", "Từ ngữ mạnh hơn khi cậu nói ra."},
			{"Practise one line in Shadowing, then come back.", "Hãy luyện một câu ở Shadowing rồi quay lại."},
		},
		Objective: Text{"Practise 1 line in Shadowing", "Luyện 1 câu ở Shadowing"},
		Counter:   Counter{Kind: "takes"}, Target: 1,
		Reward: Reward{Items: map[string]int{"seed_bloom": 2}},
	},
	{
		ID: "the_silence", Chapter: 1, Giver: "sir_shadow",
		Title: Text{"The Silence", "Màn Im Lặng"},
		Lines: []Text{
			{"You did well. Mira now sells Bloom seeds.", "Cậu làm tốt lắm. Giờ Mira đã bán hạt Hoa nở."},
			{"But listen. A Silence is spreading from the woods.", "Nhưng nghe này. Một Màn Im Lặng đang lan ra từ khu rừng."},
			{"The people there are forgetting their words.", "Người dân ở đó đang quên dần ngôn từ của họ."},
			{"Grow strong. Soon, we must stop it.", "Hãy mạnh lên. Chẳng bao lâu nữa, ta phải ngăn nó lại."},
		},
		Objective: Text{"Listen to Sir Shadow", "Nghe Hiệp sĩ Shadow kể"},
		Target:    0,
		Reward:    Reward{Gold: 50, Items: map[string]int{"seed_golden": 1}},
	},
}

// Daily is one of the day's three small tasks.
type Daily struct {
	ID       string  `json:"id"`
	Title    Text    `json:"title"`
	Counter  Counter `json:"-"`
	Target   int     `json:"target"`
	Reward   Reward  `json:"reward"`
	Learning bool    `json:"learning"`
}

// DailyPool is what the day's tasks are drawn from. The learning ones are
// practice in the app itself — the point of the game is to bring learners back
// to it.
var DailyPool = []Daily{
	{ID: "plant4", Title: Text{"Plant 4 seeds", "Gieo 4 hạt giống"},
		Counter: Counter{Kind: "event", Item: "plant"}, Target: 4, Reward: Reward{Gold: 30}},
	{ID: "harvest3", Title: Text{"Harvest 3 crops", "Thu hoạch 3 cây"},
		Counter: Counter{Kind: "event", Item: "harvest"}, Target: 3, Reward: Reward{Gold: 30}},
	{ID: "words2", Title: Text{"Get 2 new words", "Nhận 2 từ mới"},
		Counter: Counter{Kind: "words"}, Target: 2, Reward: Reward{Gold: 30}},
	{ID: "spend50", Title: Text{"Spend 50 gold", "Tiêu 50 vàng"},
		Counter: Counter{Kind: "spent"}, Target: 50, Reward: Reward{Gold: 20, Stamina: 5}},
	{ID: "shadow2", Title: Text{"Practise 2 lines in Shadowing", "Luyện 2 câu Shadowing"}, Learning: true,
		Counter: Counter{Kind: "takes"}, Target: 2, Reward: Reward{Gold: 40, Stamina: 5}},
	{ID: "shadow75", Title: Text{"Score 75+ on a Shadowing line", "Đạt 75+ điểm một câu Shadowing"}, Learning: true,
		Counter: Counter{Kind: "takes", MinScore: 75}, Target: 1, Reward: Reward{Gold: 50}},
	{ID: "review5", Title: Text{"Review 5 flashcards", "Ôn 5 thẻ ghi nhớ"}, Learning: true,
		Counter: Counter{Kind: "reviews"}, Target: 5, Reward: Reward{Gold: 40, Stamina: 5}},
}

// DailyCount is how many tasks a day holds.
const DailyCount = 3

// DailyChest is the reward for finishing all of the day's tasks.
var DailyChest = Reward{Gold: 60, Items: map[string]int{"seed_bloom": 1, "ginger_tea": 1}}

// DailyFor is the day's tasks for one player: random, but the same every time
// that player asks on that day, and always with at least one in the app itself.
func DailyFor(user, day string) []Daily {
	h := fnv.New64a()
	_, _ = h.Write([]byte(user + "|" + day))
	r := rand.New(rand.NewSource(int64(h.Sum64())))

	var learning, other []Daily
	for _, d := range DailyPool {
		if d.Learning {
			learning = append(learning, d)
		} else {
			other = append(other, d)
		}
	}
	picked := []Daily{learning[r.Intn(len(learning))]}
	rest := append([]Daily{}, other...)
	for _, d := range learning {
		if d.ID != picked[0].ID {
			rest = append(rest, d)
		}
	}
	r.Shuffle(len(rest), func(i, j int) { rest[i], rest[j] = rest[j], rest[i] })
	picked = append(picked, rest[:DailyCount-1]...)
	// Learning first was how one was guaranteed, not an order worth keeping.
	r.Shuffle(len(picked), func(i, j int) { picked[i], picked[j] = picked[j], picked[i] })
	return picked
}

// DailyByID is a task from the pool.
func DailyByID(id string) (Daily, bool) {
	for _, d := range DailyPool {
		if d.ID == id {
			return d, true
		}
	}
	return Daily{}, false
}

// StreakBonus is the extra a chest pays for finishing every day's tasks so many
// days in a row: at three, at seven, and every week after that.
func StreakBonus(streak int) Reward {
	switch {
	case streak == 3:
		return Reward{Items: map[string]int{"seed_golden": 1}}
	case streak == 7:
		return Reward{Gold: 150, Items: map[string]int{"seed_golden": 2}}
	case streak > 7 && streak%7 == 0:
		return Reward{Gold: 300, Items: map[string]int{"seed_golden": 3}}
	}
	return Reward{}
}
