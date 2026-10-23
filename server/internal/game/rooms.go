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
}

// RoomCount is how many rooms the hall has; the first chapters of the work
// open Rooms, the rest are still asleep.
const RoomCount = 6

// Rooms are the rooms open so far, in the hall's order.
var Rooms = []Room{
	{
		ID: "kitchen", Name: Text{"The Kitchen", "Gian bếp"}, Lexi: Text{"Pip, the Lexi of the kitchen", "Pip, Lexi của gian bếp"}, Icon: "🍳",
		Bundles: []Bundle{
			{ID: "kitchen_tools", Name: Text{"Things to cook with", "Đồ làm bếp"}, Reward: Reward{Gold: 50, Items: map[string]int{"ginger_tea": 1}},
				Words: []RoomWord{{"pan", "pæn", "cái chảo"}, {"knife", "naɪf", "con dao"}, {"spoon", "spuːn", "cái thìa"}, {"bowl", "boʊl", "cái bát"}}},
			{ID: "kitchen_food", Name: Text{"Something to eat", "Món ăn"}, Reward: Reward{Gold: 60, Items: map[string]int{"seed_bloom": 1}},
				Words: []RoomWord{{"bread", "brɛd", "bánh mì"}, {"rice", "raɪs", "cơm, gạo"}, {"soup", "suːp", "món súp, canh"}, {"egg", "ɛɡ", "quả trứng"}}},
			{ID: "kitchen_cooking", Name: Text{"Ways to cook", "Cách nấu"}, Reward: Reward{Gold: 80},
				Words: []RoomWord{{"boil", "bɔɪl", "luộc, đun sôi"}, {"fry", "fraɪ", "chiên, rán"}, {"bake", "beɪk", "nướng (bằng lò)"}, {"cut", "kʌt", "cắt"}}},
		},
		Reward: Reward{Gold: 150, Items: map[string]int{"seed_golden": 1}},
	},
	{
		ID: "body", Name: Text{"The Body Room", "Phòng Cơ thể"}, Lexi: Text{"Thump, the Lexi of the body", "Thump, Lexi của cơ thể"}, Icon: "🩺",
		Bundles: []Bundle{
			{ID: "body_parts", Name: Text{"Parts of the body", "Các bộ phận cơ thể"}, Reward: Reward{Gold: 50, Items: map[string]int{"herb_salve": 1}},
				Words: []RoomWord{{"head", "hɛd", "cái đầu"}, {"hand", "hænd", "bàn tay"}, {"knee", "niː", "đầu gối"}, {"shoulder", "ˈʃoʊldɚ", "vai"}}},
			{ID: "body_unwell", Name: Text{"Feeling unwell", "Khi bị ốm"}, Reward: Reward{Gold: 60, Items: map[string]int{"herb_salve": 1}},
				Words: []RoomWord{{"cough", "kɔːf", "ho"}, {"fever", "ˈfiːvɚ", "sốt"}, {"headache", "ˈhɛdeɪk", "đau đầu"}, {"sore", "sɔːr", "đau, nhức"}}},
			{ID: "body_better", Name: Text{"Getting better", "Mau khoẻ lại"}, Reward: Reward{Gold: 80},
				Words: []RoomWord{{"rest", "rɛst", "nghỉ ngơi"}, {"medicine", "ˈmɛdəsən", "thuốc"}, {"healthy", "ˈhɛlθi", "khoẻ mạnh"}, {"breathe", "briːð", "thở"}}},
		},
		Reward: Reward{Gold: 150, Items: map[string]int{"seed_golden": 1}},
	},
	{
		ID: "nature", Name: Text{"The Garden Room", "Phòng Thiên nhiên"}, Lexi: Text{"Fern, the Lexi of growing things", "Fern, Lexi của cỏ cây"}, Icon: "🌿",
		Bundles: []Bundle{
			{ID: "nature_weather", Name: Text{"The weather", "Thời tiết"}, Reward: Reward{Gold: 50, Items: map[string]int{"seed_sprout": 3}},
				Words: []RoomWord{{"rain", "reɪn", "mưa"}, {"cloud", "klaʊd", "đám mây"}, {"wind", "wɪnd", "gió"}, {"storm", "stɔːrm", "cơn bão"}}},
			{ID: "nature_plants", Name: Text{"Plants", "Cây cỏ"}, Reward: Reward{Gold: 60, Items: map[string]int{"seed_bloom": 1}},
				Words: []RoomWord{{"leaf", "liːf", "chiếc lá"}, {"root", "ruːt", "rễ cây"}, {"branch", "bræntʃ", "cành cây"}, {"seed", "siːd", "hạt giống"}}},
			{ID: "nature_animals", Name: Text{"Animals", "Con vật"}, Reward: Reward{Gold: 80},
				Words: []RoomWord{{"rabbit", "ˈræbɪt", "con thỏ"}, {"owl", "aʊl", "con cú"}, {"fox", "fɑːks", "con cáo"}, {"frog", "frɑːɡ", "con ếch"}}},
		},
		Reward: Reward{Gold: 150, Items: map[string]int{"seed_golden": 1}},
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
			out = append(out, Entry{Word: w.Word, IPA: w.IPA, Meaning: w.Vi})
		}
	}
	return out
}

// RoomGame is how a player is asked for a word: always the same for the same
// player and word, half heard among the room's other words and half spelled
// from its letters — and heard when it does not spell.
func RoomGame(user, word string) string {
	if !Scrambles(word) {
		return GameListen
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(user + "|" + word))
	if h.Sum32()%2 == 0 {
		return GameScramble
	}
	return GameListen
}
