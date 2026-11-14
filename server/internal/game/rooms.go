package game

import (
	"hash/fnv"
)

// Chapter 4: the Word Hall's rooms, each a topic, empty of words since the
// Silence. A room is filled a bundle at a time, four words to a bundle, and a
// word goes in when the player can bring it back from its meaning: hearing it
// among others, or putting its letters in order. A room whose bundles are all
// filled wakes its Lexi.

// RoomWord is one word a room wants: its sound and what it means in
// Vietnamese, which is what the empty slot shows.
type RoomWord struct {
	Word string `json:"word"`
	IPA  string `json:"ipa"`
	Vi   string `json:"vi"`
	// Sentence uses the word, and SentenceVi is what it means: upstairs, a
	// word is also asked for by leaving it out of its sentence.
	Sentence   string `json:"-"`
	SentenceVi string `json:"-"`
}

// Bundle is four words of a room, and what filling them earns.
type Bundle struct {
	ID     string     `json:"id"`
	Name   Text       `json:"name"`
	Words  []RoomWord `json:"-"`
	Reward Reward     `json:"reward"`
}

// Room is one of the Word Hall's rooms.
type Room struct {
	ID   string `json:"id"`
	Name Text   `json:"name"`
	// Lexi is the spirit of the room's words, who wakes when it is full.
	Lexi    Text     `json:"lexi"`
	Icon    string   `json:"icon"`
	Bundles []Bundle `json:"-"`
	// Reward is the room's own, on top of its last bundle's.
	Reward Reward `json:"reward"`
	// Upstairs rooms open later in the chapter, at UpstairsStep.
	Upstairs bool `json:"upstairs"`
}

// RoomCount is how many rooms the hall has.
const RoomCount = 6

// Rooms are the hall's rooms in order: three downstairs, open with the
// chapter, and three upstairs, open once half the hall is awake.
var Rooms = []Room{
	{
		ID: "kitchen", Name: Text{"The Kitchen", "Gian bếp"}, Lexi: Text{"Pip, the Lexi of the kitchen", "Pip, Lexi của gian bếp"}, Icon: "🍳",
		Bundles: []Bundle{
			{ID: "kitchen_tools", Name: Text{"Things to cook with", "Đồ làm bếp"}, Reward: Reward{Gold: 50, Items: map[string]int{"ginger_tea": 1}},
				Words: []RoomWord{{"pan", "pæn", "cái chảo", "", ""}, {"knife", "naɪf", "con dao", "", ""}, {"spoon", "spuːn", "cái thìa", "", ""}, {"bowl", "boʊl", "cái bát", "", ""}}},
			{ID: "kitchen_food", Name: Text{"Something to eat", "Món ăn"}, Reward: Reward{Gold: 60, Items: map[string]int{"seed_bloom": 1}},
				Words: []RoomWord{{"bread", "brɛd", "bánh mì", "", ""}, {"rice", "raɪs", "cơm, gạo", "", ""}, {"soup", "suːp", "món súp, canh", "", ""}, {"egg", "ɛɡ", "quả trứng", "", ""}}},
			{ID: "kitchen_cooking", Name: Text{"Ways to cook", "Cách nấu"}, Reward: Reward{Gold: 80},
				Words: []RoomWord{{"boil", "bɔɪl", "luộc, đun sôi", "", ""}, {"fry", "fraɪ", "chiên, rán", "", ""}, {"bake", "beɪk", "nướng (bằng lò)", "", ""}, {"cut", "kʌt", "cắt", "", ""}}},
		},
		Reward: Reward{Gold: 150, Items: map[string]int{"seed_golden": 1}},
	},
	{
		ID: "body", Name: Text{"The Body Room", "Phòng Cơ thể"}, Lexi: Text{"Thump, the Lexi of the body", "Thump, Lexi của cơ thể"}, Icon: "🩺",
		Bundles: []Bundle{
			{ID: "body_parts", Name: Text{"Parts of the body", "Các bộ phận cơ thể"}, Reward: Reward{Gold: 50, Items: map[string]int{"herb_salve": 1}},
				Words: []RoomWord{{"head", "hɛd", "cái đầu", "", ""}, {"hand", "hænd", "bàn tay", "", ""}, {"knee", "niː", "đầu gối", "", ""}, {"shoulder", "ˈʃoʊldɚ", "vai", "", ""}}},
			{ID: "body_unwell", Name: Text{"Feeling unwell", "Khi bị ốm"}, Reward: Reward{Gold: 60, Items: map[string]int{"herb_salve": 1}},
				Words: []RoomWord{{"cough", "kɔːf", "ho", "", ""}, {"fever", "ˈfiːvɚ", "sốt", "", ""}, {"headache", "ˈhɛdeɪk", "đau đầu", "", ""}, {"sore", "sɔːr", "đau, nhức", "", ""}}},
			{ID: "body_better", Name: Text{"Getting better", "Mau khoẻ lại"}, Reward: Reward{Gold: 80},
				Words: []RoomWord{{"rest", "rɛst", "nghỉ ngơi", "", ""}, {"medicine", "ˈmɛdəsən", "thuốc", "", ""}, {"healthy", "ˈhɛlθi", "khoẻ mạnh", "", ""}, {"breathe", "briːð", "thở", "", ""}}},
		},
		Reward: Reward{Gold: 150, Items: map[string]int{"seed_golden": 1}},
	},
	{
		ID: "nature", Name: Text{"The Garden Room", "Phòng Thiên nhiên"}, Lexi: Text{"Fern, the Lexi of growing things", "Fern, Lexi của cỏ cây"}, Icon: "🌿",
		Bundles: []Bundle{
			{ID: "nature_weather", Name: Text{"The weather", "Thời tiết"}, Reward: Reward{Gold: 50, Items: map[string]int{"seed_sprout": 3}},
				Words: []RoomWord{{"rain", "reɪn", "mưa", "", ""}, {"cloud", "klaʊd", "đám mây", "", ""}, {"wind", "wɪnd", "gió", "", ""}, {"storm", "stɔːrm", "cơn bão", "", ""}}},
			{ID: "nature_plants", Name: Text{"Plants", "Cây cỏ"}, Reward: Reward{Gold: 60, Items: map[string]int{"seed_bloom": 1}},
				Words: []RoomWord{{"leaf", "liːf", "chiếc lá", "", ""}, {"root", "ruːt", "rễ cây", "", ""}, {"branch", "bræntʃ", "cành cây", "", ""}, {"seed", "siːd", "hạt giống", "", ""}}},
			{ID: "nature_animals", Name: Text{"Animals", "Con vật"}, Reward: Reward{Gold: 80},
				Words: []RoomWord{{"rabbit", "ˈræbɪt", "con thỏ", "", ""}, {"owl", "aʊl", "con cú", "", ""}, {"fox", "fɑːks", "con cáo", "", ""}, {"frog", "frɑːɡ", "con ếch", "", ""}}},
		},
		Reward: Reward{Gold: 150, Items: map[string]int{"seed_golden": 1}},
	},
	{
		ID: "feelings", Name: Text{"The Room of Feelings", "Phòng Cảm xúc"}, Lexi: Text{"Glow, the Lexi of feelings", "Glow, Lexi của cảm xúc"}, Icon: "💛", Upstairs: true,
		Bundles: []Bundle{
			{ID: "feelings_good", Name: Text{"Feeling good", "Khi vui"}, Reward: Reward{Gold: 60, Items: map[string]int{"honey_cake": 1}},
				Words: []RoomWord{
					{"happy", "ˈhæpi", "vui, hạnh phúc", "She was so happy to see her old friend.", "Cô ấy rất vui khi gặp lại bạn cũ."},
					{"proud", "praʊd", "tự hào", "I am proud of my little brother.", "Tôi tự hào về em trai mình."},
					{"excited", "ɪkˈsaɪtɪd", "háo hức", "The kids are excited about the trip.", "Bọn trẻ háo hức về chuyến đi."},
					{"calm", "kɑːm", "bình tĩnh", "Take a deep breath and stay calm.", "Hít thở sâu và giữ bình tĩnh."},
				}},
			{ID: "feelings_low", Name: Text{"Feeling low", "Khi buồn"}, Reward: Reward{Gold: 70, Items: map[string]int{"ginger_tea": 2}},
				Words: []RoomWord{
					{"sad", "sæd", "buồn", "He felt sad when the summer ended.", "Anh ấy thấy buồn khi mùa hè kết thúc."},
					{"angry", "ˈæŋɡri", "tức giận", "Please don't be angry with me.", "Đừng giận tôi nhé."},
					{"worried", "ˈwɝːid", "lo lắng", "My mom is worried about the exam.", "Mẹ tôi lo lắng về kỳ thi."},
					{"tired", "ˈtaɪɚd", "mệt", "I'm too tired to cook tonight.", "Tối nay tôi mệt quá, không nấu nổi."},
				}},
			{ID: "feelings_others", Name: Text{"Feelings between people", "Cảm xúc với người khác"}, Reward: Reward{Gold: 90},
				Words: []RoomWord{
					{"sorry", "ˈsɑːri", "xin lỗi, tiếc", "I'm sorry I was late.", "Xin lỗi vì tôi đến muộn."},
					{"kind", "kaɪnd", "tốt bụng", "It was very kind of you to help.", "Bạn thật tốt bụng khi giúp tôi."},
					{"lonely", "ˈloʊnli", "cô đơn", "He feels lonely in the big city.", "Anh ấy thấy cô đơn ở thành phố lớn."},
					{"surprised", "sɚˈpraɪzd", "ngạc nhiên", "We were surprised by the snow.", "Chúng tôi ngạc nhiên vì tuyết rơi."},
				}},
		},
		Reward: Reward{Gold: 200, Items: map[string]int{"seed_golden": 1}},
	},
	{
		ID: "streets", Name: Text{"The Room of Streets", "Phòng Đường phố"}, Lexi: Text{"Zip, the Lexi of the streets", "Zip, Lexi của phố phường"}, Icon: "🚲", Upstairs: true,
		Bundles: []Bundle{
			{ID: "streets_places", Name: Text{"Places in town", "Nơi chốn trong phố"}, Reward: Reward{Gold: 60, Items: map[string]int{"coffee": 2}},
				Words: []RoomWord{
					{"station", "ˈsteɪʃən", "nhà ga", "The train leaves the station at nine.", "Tàu rời ga lúc chín giờ."},
					{"bridge", "brɪdʒ", "cây cầu", "There is an old bridge over the river.", "Có một cây cầu cũ bắc qua sông."},
					{"corner", "ˈkɔːrnɚ", "góc phố", "The café is on the corner.", "Quán cà phê ở ngay góc phố."},
					{"market", "ˈmɑːrkɪt", "chợ", "We buy fresh fruit at the market.", "Chúng tôi mua trái cây tươi ở chợ."},
				}},
			{ID: "streets_getting_around", Name: Text{"Getting around", "Đi lại"}, Reward: Reward{Gold: 70, Items: map[string]int{"seed_bloom": 1}},
				Words: []RoomWord{
					{"bus", "bʌs", "xe buýt", "I take the bus to school every day.", "Ngày nào tôi cũng đi xe buýt đến trường."},
					{"ticket", "ˈtɪkɪt", "vé", "How much is a ticket to the city?", "Vé vào thành phố bao nhiêu tiền?"},
					{"train", "treɪn", "tàu hoả", "The train was full this morning.", "Sáng nay tàu đông kín người."},
					{"bicycle", "ˈbaɪsɪkəl", "xe đạp", "She rides her bicycle to the park.", "Cô ấy đạp xe đến công viên."},
				}},
			{ID: "streets_directions", Name: Text{"Which way?", "Đi lối nào?"}, Reward: Reward{Gold: 90},
				Words: []RoomWord{
					{"left", "lɛft", "bên trái", "Turn left at the bank.", "Rẽ trái ở chỗ ngân hàng."},
					{"straight", "streɪt", "thẳng", "Go straight for two blocks.", "Đi thẳng qua hai dãy nhà."},
					{"near", "nɪr", "gần", "Is there a pharmacy near here?", "Gần đây có hiệu thuốc nào không?"},
					{"across", "əˈkrɔːs", "bên kia, băng qua", "The bakery is across the street.", "Tiệm bánh ở bên kia đường."},
				}},
		},
		Reward: Reward{Gold: 200, Items: map[string]int{"seed_golden": 1}},
	},
	{
		ID: "work", Name: Text{"The Room of Work and Time", "Phòng Công việc"}, Lexi: Text{"Tock, the Lexi of work and time", "Tock, Lexi của công việc và thời gian"}, Icon: "🕰️", Upstairs: true,
		Bundles: []Bundle{
			{ID: "work_jobs", Name: Text{"Jobs", "Nghề nghiệp"}, Reward: Reward{Gold: 60, Items: map[string]int{"soup": 1}},
				Words: []RoomWord{
					{"teacher", "ˈtiːtʃɚ", "giáo viên", "My teacher explains things clearly.", "Thầy giáo tôi giảng rất dễ hiểu."},
					{"nurse", "nɝːs", "y tá", "The nurse took my temperature.", "Y tá đo nhiệt độ cho tôi."},
					{"farmer", "ˈfɑːrmɚ", "nông dân", "The farmer gets up before the sun.", "Người nông dân dậy trước khi mặt trời mọc."},
					{"driver", "ˈdraɪvɚ", "tài xế", "The driver stopped the car for us.", "Bác tài dừng xe cho chúng tôi."},
				}},
			{ID: "work_office", Name: Text{"At the office", "Ở văn phòng"}, Reward: Reward{Gold: 70, Items: map[string]int{"coffee": 2}},
				Words: []RoomWord{
					{"meeting", "ˈmiːtɪŋ", "cuộc họp", "We have a meeting at ten.", "Chúng tôi có cuộc họp lúc mười giờ."},
					{"email", "ˈiːmeɪl", "thư điện tử", "I'll send you an email this afternoon.", "Chiều nay tôi sẽ gửi email cho bạn."},
					{"desk", "dɛsk", "bàn làm việc", "Your keys are on my desk.", "Chìa khoá của bạn ở trên bàn làm việc của tôi."},
					{"boss", "bɔːs", "sếp", "My boss gave me a day off.", "Sếp cho tôi nghỉ một ngày."},
				}},
			{ID: "work_time", Name: Text{"On time", "Giờ giấc"}, Reward: Reward{Gold: 90},
				Words: []RoomWord{
					{"early", "ˈɝːli", "sớm", "I got to work early today.", "Hôm nay tôi đến chỗ làm sớm."},
					{"late", "leɪt", "muộn, trễ", "Sorry, the bus is late again.", "Xin lỗi, xe buýt lại trễ nữa rồi."},
					{"week", "wiːk", "tuần", "I work five days a week.", "Tôi làm việc năm ngày một tuần."},
					{"tomorrow", "təˈmɑːroʊ", "ngày mai", "Let's finish it tomorrow.", "Mai mình làm cho xong nhé."},
				}},
		},
		Reward: Reward{Gold: 200, Items: map[string]int{"seed_golden": 1}},
	},
}

// RoomByID is a room by its id.
func RoomByID(id string) (Room, bool) {
	for _, r := range Rooms {
		if r.ID == id {
			return r, true
		}
	}
	return Room{}, false
}

// BundleByID is a bundle by its id, and the room it is in.
func BundleByID(id string) (Room, Bundle, bool) {
	for _, r := range Rooms {
		for _, b := range r.Bundles {
			if b.ID == id {
				return r, b, true
			}
		}
	}
	return Room{}, Bundle{}, false
}

// WordInRooms is where a word goes: its room, its bundle, and itself.
func WordInRooms(word string) (Room, Bundle, RoomWord, bool) {
	for _, r := range Rooms {
		for _, b := range r.Bundles {
			for _, w := range b.Words {
				if w.Word == word {
					return r, b, w, true
				}
			}
		}
	}
	return Room{}, Bundle{}, RoomWord{}, false
}

// RoomEntries are a room's words as the questions read them: the meaning is
// the Vietnamese one.
func RoomEntries(r Room) []Entry {
	var out []Entry
	for _, b := range r.Bundles {
		for _, w := range b.Words {
			out = append(out, Entry{Word: w.Word, IPA: w.IPA, Meaning: w.Vi, Sentence: w.Sentence, SentenceVi: w.SentenceVi})
		}
	}
	return out
}

// RoomGame is how a player is asked for a word: always the same for the same
// player and word. Downstairs, half heard among the room's other words and
// half spelled from its letters — and heard when it does not spell. Upstairs,
// where words come with a sentence, half are left out of it to be put back.
func RoomGame(user string, w RoomWord) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(user + "|" + w.Word))
	n := h.Sum32()
	if w.Sentence != "" {
		if n%2 == 0 {
			return GameCloze
		}
		n /= 2
	}
	if !Scrambles(w.Word) {
		return GameListen
	}
	if n%2 == 0 {
		return GameScramble
	}
	return GameListen
}
