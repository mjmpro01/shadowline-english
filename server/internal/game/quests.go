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
	//   "event"   — game events of kind Item (plant, harvest, buy, sleep, unlock,
	//               listen, enter_woods, win, win_clean, answer_right…), of Of
	//               when it is set (win of word_slime)
	//   "words"   — words harvested
	//   "takes"   — Shadowing lines practised, scoring at least MinScore when set
	//   "reviews" — flashcards reviewed
	//   "spent"   — gold spent
	Kind     string `json:"-"`
	Item     string `json:"-"`
	Of       string `json:"-"`
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

// The main-quest steps that open things: the better seeds in the shop, and
// the woods (and what is sold for them).
const (
	BloomStep  = 8
	GoldenStep = 9
	WoodsStep  = 10
	// TrollStep is Bram's request, from which the troll is in its lair.
	TrollStep = 15
)

// MainQuests is the story so far. Chapter 1, the farm, doubles as the
// tutorial — each step asks for the next thing a new farmer needs to learn.
// Chapter 2 goes into the woods, where the Silence is.
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
	{
		ID: "guild", Chapter: 2, Giver: "sir_shadow",
		Title: Text{"The Knights' Guild", "Hội Hiệp sĩ"},
		Lines: []Text{
			{"The Silence has reached the woods.", "Màn Im Lặng đã tràn tới khu rừng."},
			{"Monsters there steal words. We fight them with words.", "Lũ quái ở đó cướp ngôn từ. Ta đánh chúng bằng chính ngôn từ."},
			{"Answer right, and you strike. Answer wrong, and they strike you.", "Trả lời đúng là cậu ra đòn. Trả lời sai thì chúng đánh lại."},
			{"Take these salves. Join the guild, farmer.", "Cầm lấy thuốc này. Gia nhập hội đi, bác nông dân."},
		},
		Objective: Text{"Join the Knights' Guild", "Gia nhập Hội Hiệp sĩ"},
		Target:    0,
		Reward:    Reward{Items: map[string]int{"herb_salve": 2}},
	},
	{
		ID: "enter_woods", Chapter: 2, Giver: "sir_shadow",
		Title: Text{"Into the woods", "Bước vào rừng"},
		Lines: []Text{
			{"The gate to the woods is east of the farm.", "Cổng vào rừng ở phía đông trang trại."},
			{"Go in and look around. Be careful.", "Vào trong xem thử. Cẩn thận đấy."},
		},
		Objective: Text{"Go into the woods", "Đi vào rừng"},
		Counter:   Counter{Kind: "event", Item: "enter_woods"}, Target: 1,
		Reward: Reward{Gold: 10},
	},
	{
		ID: "first_win", Chapter: 2, Giver: "sir_shadow",
		Title: Text{"Your first fight", "Trận đầu tiên"},
		Lines: []Text{
			{"See that slime? It is full of stolen words.", "Thấy con slime kia không? Nó đầy những từ bị cướp."},
			{"Walk up to it and press the action button.", "Đi tới gần nó rồi bấm nút hành động."},
		},
		Objective: Text{"Win a fight", "Thắng một trận"},
		Counter:   Counter{Kind: "event", Item: "win"}, Target: 1,
		Reward: Reward{Gold: 20},
	},
	{
		ID: "five_slimes", Chapter: 2, Giver: "sir_shadow",
		Title: Text{"Slime hunt", "Săn slime"},
		Lines: []Text{
			{"Well fought! But there are many more.", "Đánh hay lắm! Nhưng chúng còn nhiều lắm."},
			{"Beat five Word-slimes and the path will be safer.", "Hạ năm con Slime chữ thì đường đi sẽ an toàn hơn."},
		},
		Objective: Text{"Beat 5 Word-slimes", "Hạ 5 Slime chữ"},
		Counter:   Counter{Kind: "event", Item: "win", Of: "word_slime"}, Target: 5,
		Reward: Reward{Gold: 60},
	},
	{
		ID: "sharp_ears", Chapter: 2, Giver: "sir_shadow",
		Title: Text{"Sharp ears", "Tai thính"},
		Lines: []Text{
			{"The bats speak in echoes. Listen closely.", "Lũ dơi nói bằng tiếng vọng. Hãy nghe thật kỹ."},
			{"Answer fifteen questions right in battle.", "Trả lời đúng mười lăm câu trong trận."},
		},
		Objective: Text{"Answer 15 questions right in battle", "Trả lời đúng 15 câu trong trận"},
		Counter:   Counter{Kind: "event", Item: "answer_right"}, Target: 15,
		Reward: Reward{Gold: 40, Items: map[string]int{"seed_bloom": 1}},
	},
	{
		ID: "thorns", Chapter: 2, Giver: "sir_shadow",
		Title: Text{"Thorns in the dark", "Gai trong bóng tối"},
		Lines: []Text{
			{"Your ears are sharp now. Good.", "Tai cậu đã thính rồi. Tốt lắm."},
			{"Deeper in, mushrooms grow thorns and hard words.", "Sâu hơn trong rừng, lũ nấm mọc gai và nói toàn từ khó."},
			{"They ask in every way at once. Beat three of them.", "Chúng hỏi đủ mọi kiểu. Hạ ba con xem nào."},
		},
		Objective: Text{"Beat 3 Thorn-shrooms", "Hạ 3 Nấm gai"},
		Counter:   Counter{Kind: "event", Item: "win", Of: "thorn_mushroom"}, Target: 3,
		Reward: Reward{Gold: 50, Items: map[string]int{"herb_salve": 2}},
	},
	{
		ID: "brams_hammer", Chapter: 2, Giver: "bram",
		Title: Text{"Bram's hammer", "Chiếc búa của Bram"},
		Lines: []Text{
			{"Farmer! A troll came out of the woods last night.", "Bác nông dân! Tối qua có một con quỷ từ trong rừng mò ra."},
			{"It mumbled and mumbled, and it took my hammer.", "Nó cứ lầm bầm mãi, rồi cuỗm mất chiếc búa của tôi."},
			{"It hides in a lair at the east end of the woods.", "Nó trốn trong hang ở cuối phía đông khu rừng."},
			{"Bring it back and I can work your soil richer than ever.", "Lấy lại được búa thì tôi sẽ làm đất cho cậu tốt hơn bao giờ hết."},
		},
		Objective: Text{"Beat the Mumble Troll", "Hạ Quỷ Lầm Bầm"},
		Counter:   Counter{Kind: "event", Item: "win", Of: "mumble_troll"}, Target: 1,
		Reward: Reward{Gold: 100, Items: map[string]int{"bram_hammer": 1, "seed_golden": 1}},
	},
	{
		ID: "smoke", Chapter: 2, Giver: "sir_shadow",
		Title: Text{"Smoke on the hill", "Khói trên đồi"},
		Lines: []Text{
			{"The woods are quieter now. You did that.", "Khu rừng giờ đã yên hơn. Là nhờ cậu đấy."},
			{"But look, past the trees. Smoke, over Echo town.", "Nhưng nhìn kìa, phía sau rặng cây. Có khói bốc lên trên thị trấn Echo."},
			{"The Silence did not stop at the woods.", "Màn Im Lặng không dừng lại ở khu rừng."},
			{"Rest well, farmer. Soon we go to Echo.", "Nghỉ ngơi đi, bác nông dân. Chẳng bao lâu nữa ta sẽ tới Echo."},
		},
		Objective: Text{"Listen to Sir Shadow", "Nghe Hiệp sĩ Shadow kể"},
		Target:    0,
		Reward:    Reward{Gold: 30},
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
	// Woods tasks are only drawn once the woods are open.
	Woods bool `json:"woods"`
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
	{ID: "win3", Title: Text{"Win 3 fights", "Thắng 3 trận"}, Woods: true,
		Counter: Counter{Kind: "event", Item: "win"}, Target: 3, Reward: Reward{Gold: 40, Items: map[string]int{"herb_salve": 1}}},
	{ID: "answer10", Title: Text{"Answer 10 questions right in battle", "Trả lời đúng 10 câu trong trận"}, Woods: true,
		Learning: true, Counter: Counter{Kind: "event", Item: "answer_right"}, Target: 10, Reward: Reward{Gold: 40, Stamina: 5}},
	{ID: "clean1", Title: Text{"Win a fight without being hit", "Thắng một trận không bị trúng đòn"}, Woods: true,
		Counter: Counter{Kind: "event", Item: "win_clean"}, Target: 1, Reward: Reward{Gold: 50}},
	{ID: "shroom1", Title: Text{"Beat a Thorn-shroom", "Hạ một Nấm gai"}, Woods: true,
		Counter: Counter{Kind: "event", Item: "win", Of: "thorn_mushroom"}, Target: 1, Reward: Reward{Gold: 50, Stamina: 5}},
}

// DailyCount is how many tasks a day holds.
const DailyCount = 3

// DailyChest is the reward for finishing all of the day's tasks.
var DailyChest = Reward{Gold: 60, Items: map[string]int{"seed_bloom": 1, "ginger_tea": 1}}

// DailyFor is the day's tasks for one player: random, but the same every time
// that player asks on that day, and always with at least one in the app itself.
// Tasks in the woods come into the draw once the woods are open.
func DailyFor(user, day string, woods bool) []Daily {
	h := fnv.New64a()
	_, _ = h.Write([]byte(user + "|" + day))
	r := rand.New(rand.NewSource(int64(h.Sum64())))

	var learning, other []Daily
	for _, d := range DailyPool {
		if d.Woods && !woods {
			continue
		}
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
