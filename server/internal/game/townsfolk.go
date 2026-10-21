package game

import (
	"hash/fnv"
	"math/rand"
)

// Echo Town and the people in it. Each of them keeps to a corner of English —
// greetings, sounds, reading, ordering food, health — so a chat with anyone is
// practice: they say a line, and the player picks the reply that fits. Friends
// are made by talking every day and by gifts they like.

// Reply is one of three answers to a line: one that fits, one that is good
// English in the wrong place, and one that is wrong English. Why says which,
// for the learner, whichever was picked.
type Reply struct {
	Text  Text `json:"text"`
	Right bool `json:"-"`
	Why   Text `json:"-"`
}

// Exchange is a line someone says and three replies to it, the right one first
// here; they are shuffled before the player sees them.
type Exchange struct {
	Line    Text     `json:"line"`
	Replies [3]Reply `json:"-"`
}

// HeartEvent is what someone shares on reaching a number of hearts: a little of
// their story, and a present.
type HeartEvent struct {
	Hearts int    `json:"hearts"`
	Lines  []Text `json:"lines"`
	Reward Reward `json:"reward"`
}

// Townsperson is someone in Echo Town.
type Townsperson struct {
	ID   string `json:"id"`
	Name Text   `json:"name"`
	Role Text   `json:"role"`
	// What they make of a gift: loved, liked, or disliked; anything else is
	// taken politely.
	Loves     []string     `json:"-"`
	Likes     []string     `json:"-"`
	Dislikes  []string     `json:"-"`
	Exchanges []Exchange   `json:"-"`
	Events    []HeartEvent `json:"-"`
}

const (
	// PointsPerHeart: friendship is counted in points, a heart every hundred.
	PointsPerHeart = 100
	MaxHearts      = 10
	TalkRight      = 30
	TalkWrong      = 10
	GiftLoved      = 80
	GiftLiked      = 45
	GiftNeutral    = 20
	GiftDisliked   = -20
	// ClinicCost is what Dr. Vy asks to make the player well again.
	ClinicCost = 20
)

// Hearts is the hearts a number of points makes.
func Hearts(points int) int {
	return min(MaxHearts, max(0, points)/PointsPerHeart)
}

// Taste is how someone takes a gift: "loved", "liked", "disliked" or "neutral".
func Taste(t Townsperson, item string) string {
	switch {
	case contains(t.Loves, item):
		return "loved"
	case contains(t.Likes, item):
		return "liked"
	case contains(t.Dislikes, item):
		return "disliked"
	}
	return "neutral"
}

// GiftPoints is what a gift does for a friendship. Giving it with the wrong
// words halves what a good gift earns; a gift they dislike costs the same
// either way.
func GiftPoints(taste string, rightWords bool) int {
	points := map[string]int{"loved": GiftLoved, "liked": GiftLiked, "disliked": GiftDisliked}[taste]
	if taste == "neutral" {
		points = GiftNeutral
	}
	if points > 0 && !rightWords {
		points /= 2
	}
	return points
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func TownspersonByID(id string) (Townsperson, bool) {
	for _, t := range Townsfolk {
		if t.ID == id {
			return t, true
		}
	}
	return Townsperson{}, false
}

// Today's chat with someone: which exchange, and the order its replies are in.
// Fixed by player, day and person, so it is the same every time it is asked
// for that day and the server can check an answer without writing it down.
type Chat struct {
	Exchange Exchange
	// Order[i] is the reply shown in place i.
	Order [3]int
}

func dayRand(user, day, salt string) *rand.Rand {
	h := fnv.New64a()
	_, _ = h.Write([]byte(user + "|" + day + "|" + salt))
	return rand.New(rand.NewSource(int64(h.Sum64())))
}

// ChatFor is the day's chat with someone.
func ChatFor(user, day string, t Townsperson) Chat {
	r := dayRand(user, day, "talk:"+t.ID)
	c := Chat{Exchange: t.Exchanges[r.Intn(len(t.Exchanges))]}
	copy(c.Order[:], r.Perm(3))
	return c
}

// Shown is the replies in the order the player sees them.
func (c Chat) Shown() [3]Reply {
	var out [3]Reply
	for i, j := range c.Order {
		out[i] = c.Exchange.Replies[j]
	}
	return out
}

// GiftWordsFor is the day's three ways of handing someone a gift, shuffled.
func GiftWordsFor(user, day string, t Townsperson) [3]Reply {
	r := dayRand(user, day, "gift:"+t.ID)
	var out [3]Reply
	for i, j := range r.Perm(3) {
		out[i] = GiftWords[j]
	}
	return out
}

// GiftWords are the ways to hand over a gift; the right one first.
var GiftWords = [3]Reply{
	{Text: Text{"This is for you. I hope you like it!", "Cái này tặng bạn. Mong là bạn thích!"}, Right: true,
		Why: Text{"A warm, natural way to give a present.", "Cách tặng quà tự nhiên và thân thiện."}},
	{Text: Text{"Give me this, please.", "Làm ơn đưa tôi cái này."},
		Why: Text{"Good English, but it asks for something instead of giving it.", "Đúng ngữ pháp, nhưng là xin chứ không phải tặng."}},
	{Text: Text{"This are for you.", "Cái này cho bạn."},
		Why: Text{"\"This\" is one thing: \"This is\", not \"This are\".", "\"This\" là số ít: phải là \"This is\", không phải \"This are\"."}},
}

// The three kinds of reply, built the same way for every exchange.
func right(en, vi string) Reply {
	return Reply{Text: Text{en, vi}, Right: true, Why: Text{"That fits.", "Câu này hợp ngữ cảnh."}}
}

func offTopic(en, vi, whyEn, whyVi string) Reply {
	return Reply{Text: Text{en, vi}, Why: Text{whyEn, whyVi}}
}

func badGrammar(en, vi, whyEn, whyVi string) Reply {
	return Reply{Text: Text{en, vi}, Why: Text{whyEn, whyVi}}
}

var Townsfolk = []Townsperson{
	{
		ID: "elsa", Name: Text{"Mayor Elsa", "Thị trưởng Elsa"}, Role: Text{"The mayor", "Thị trưởng"},
		Loves: []string{"honey_cake"}, Likes: []string{"flowers"},
		Exchanges: []Exchange{
			{Line: Text{"Good morning! Welcome to Echo Town.", "Chào buổi sáng! Chào mừng đến thị trấn Echo."}, Replies: [3]Reply{
				right("Good morning! Thank you, it's lovely here.", "Chào buổi sáng! Cảm ơn, ở đây đẹp quá."),
				offTopic("Good night! Sleep well.", "Chúc ngủ ngon!", "\"Good night\" is for the end of the day.", "\"Good night\" dùng khi chào lúc đi ngủ."),
				badGrammar("Good morning! I am very happy be here.", "Chào buổi sáng! Tôi rất vui ở đây.", "It needs \"to\": \"happy to be here\".", "Thiếu \"to\": phải là \"happy to be here\"."),
			}},
			{Line: Text{"How are you today?", "Hôm nay bạn thế nào?"}, Replies: [3]Reply{
				right("I'm fine, thank you. And you?", "Tôi khoẻ, cảm ơn. Còn bà?"),
				offTopic("I'm twenty years old.", "Tôi hai mươi tuổi.", "That answers \"How old are you?\".", "Câu này trả lời cho \"Bạn bao nhiêu tuổi?\"."),
				badGrammar("I fine, thanks you.", "Tôi khoẻ, cảm ơn.", "Say \"I'm fine\" and \"thank you\".", "Phải nói \"I'm fine\" và \"thank you\"."),
			}},
			{Line: Text{"May I ask your name?", "Cho tôi hỏi tên bạn được không?"}, Replies: [3]Reply{
				right("Of course. My name is on my farm sign!", "Tất nhiên. Tên tôi ghi trên biển trang trại!"),
				offTopic("It's three o'clock.", "Bây giờ là ba giờ.", "That tells the time, not your name.", "Câu này nói giờ, không phải tên."),
				badGrammar("Of course. Me name is Farmer.", "Tất nhiên. Tên tôi là Farmer.", "Use \"my\", not \"me\": \"My name is…\".", "Dùng \"my\", không dùng \"me\": \"My name is…\"."),
			}},
			{Line: Text{"Thank you for helping the woods.", "Cảm ơn cậu đã giúp khu rừng."}, Replies: [3]Reply{
				right("You're welcome. I was happy to help.", "Không có gì. Tôi rất vui được giúp."),
				offTopic("I'm sorry, I'm late.", "Xin lỗi, tôi đến muộn.", "An apology does not answer thanks.", "Lời xin lỗi không đáp lại lời cảm ơn."),
				badGrammar("You welcome. I happy help.", "Không có gì. Tôi vui được giúp.", "Say \"You're welcome\" and \"I was happy to help\".", "Phải nói \"You're welcome\" và \"I was happy to help\"."),
			}},
			{Line: Text{"Have you met everyone in town yet?", "Cậu đã gặp hết mọi người trong thị trấn chưa?"}, Replies: [3]Reply{
				right("Not yet, but I will say hello to them today.", "Chưa, nhưng hôm nay tôi sẽ đi chào họ."),
				offTopic("Yes, I like apples.", "Vâng, tôi thích táo.", "Apples have nothing to do with meeting people.", "Táo chẳng liên quan gì đến việc gặp mọi người."),
				badGrammar("Not yet, but I will says hello today.", "Chưa, nhưng hôm nay tôi sẽ chào.", "After \"will\", the verb has no -s: \"will say\".", "Sau \"will\" động từ không thêm -s: \"will say\"."),
			}},
			{Line: Text{"Please, make yourself at home.", "Cứ tự nhiên như ở nhà nhé."}, Replies: [3]Reply{
				right("Thank you, that's very kind of you.", "Cảm ơn, bà thật tốt bụng."),
				offTopic("Where is my home?", "Nhà tôi ở đâu?", "\"Make yourself at home\" means \"relax here\", not a question about where you live.", "\"Make yourself at home\" nghĩa là \"cứ tự nhiên\", không hỏi nhà ở đâu."),
				badGrammar("Thank you, that's very kindly of you.", "Cảm ơn, bà thật tốt.", "\"Kind\" is the adjective here: \"very kind of you\".", "Ở đây cần tính từ \"kind\": \"very kind of you\"."),
			}},
		},
		Events: []HeartEvent{{Hearts: 2, Lines: []Text{
			{"When I was young, this town sang all day.", "Hồi tôi còn trẻ, thị trấn này hát suốt ngày."},
			{"Then the Silence came, and people forgot their words.", "Rồi Màn Im Lặng đến, và mọi người quên mất ngôn từ."},
			{"You remind me of those days. Take this.", "Cậu làm tôi nhớ những ngày ấy. Cầm lấy này."},
		}, Reward: Reward{Gold: 50, Items: map[string]int{"seed_golden": 1}}}},
	},
	{
		ID: "orin", Name: Text{"Sage Orin", "Hiền triết Orin"}, Role: Text{"The sound-keeper", "Người giữ âm thanh"},
		Loves: []string{"old_book"}, Likes: []string{"wool_scarf"}, Dislikes: []string{"flowers"},
		Exchanges: []Exchange{
			{Line: Text{"Listen: \"ship\" and \"sheep\". Can you hear the difference?", "Nghe này: \"ship\" và \"sheep\". Cậu có nghe ra khác biệt không?"}, Replies: [3]Reply{
				right("Yes, \"sheep\" has a longer sound.", "Có, \"sheep\" có âm dài hơn."),
				offTopic("Yes, I have a boat.", "Có, tôi có một chiếc thuyền.", "He asked about the sounds, not about boats.", "Ông ấy hỏi về âm, không hỏi về thuyền."),
				badGrammar("Yes, \"sheep\" have a more long sound.", "Có, \"sheep\" có âm dài hơn.", "Say \"has a longer sound\".", "Phải nói \"has a longer sound\"."),
			}},
			{Line: Text{"Words are music. Do you practise speaking?", "Ngôn từ là âm nhạc. Cậu có luyện nói không?"}, Replies: [3]Reply{
				right("Yes, I practise a little every day.", "Có, mỗi ngày tôi luyện một chút."),
				offTopic("Yes, I play the guitar.", "Có, tôi chơi ghi-ta.", "He meant speaking, not playing music.", "Ông ấy hỏi về luyện nói, không phải chơi nhạc."),
				badGrammar("Yes, I practise a little every days.", "Có, mỗi ngày tôi luyện một chút.", "\"Every\" takes one: \"every day\".", "Sau \"every\" dùng số ít: \"every day\"."),
			}},
			{Line: Text{"Say \"th\" with your tongue between your teeth.", "Nói âm \"th\" với lưỡi đặt giữa hai hàm răng."}, Replies: [3]Reply{
				right("Like this: \"think\", \"thank\".", "Như thế này: \"think\", \"thank\"."),
				offTopic("I brush my teeth twice a day.", "Tôi đánh răng hai lần một ngày.", "True, maybe, but he was teaching a sound.", "Có thể đúng, nhưng ông ấy đang dạy cách phát âm."),
				badGrammar("Like this: \"I thinks\", \"I thanks\".", "Như thế này: \"I think\", \"I thank\".", "With \"I\", no -s: \"I think\".", "Với \"I\" không thêm -s: \"I think\"."),
			}},
			{Line: Text{"Which word rhymes with \"cat\"?", "Từ nào vần với \"cat\"?"}, Replies: [3]Reply{
				right("\"Hat\" rhymes with \"cat\".", "\"Hat\" vần với \"cat\"."),
				offTopic("I have a dog.", "Tôi có một con chó.", "He asked for a rhyme.", "Ông ấy hỏi từ cùng vần."),
				badGrammar("\"Hat\" rhyme with \"cat\".", "\"Hat\" vần với \"cat\".", "One word: \"rhymes\" with -s.", "Một từ: \"rhymes\" phải thêm -s."),
			}},
			{Line: Text{"Do you know why my tower is so quiet?", "Cậu có biết vì sao tháp của ta yên ắng thế không?"}, Replies: [3]Reply{
				right("Is it because of the Silence?", "Có phải vì Màn Im Lặng không?"),
				offTopic("Because it's Tuesday.", "Vì hôm nay là thứ Ba.", "The day of the week does not explain it.", "Ngày trong tuần không giải thích được chuyện đó."),
				badGrammar("Is it because the Silence come?", "Có phải vì Màn Im Lặng đến không?", "\"The Silence\" is one thing: \"came\" or \"has come\".", "Cần chia động từ: \"came\" hoặc \"has come\"."),
			}},
			{Line: Text{"Slow down. Say each sound clearly.", "Chậm thôi. Nói rõ từng âm."}, Replies: [3]Reply{
				right("Okay, I'll speak more slowly.", "Được, tôi sẽ nói chậm hơn."),
				offTopic("Okay, I'll run faster.", "Được, tôi sẽ chạy nhanh hơn.", "He asked you to slow down your speech.", "Ông ấy bảo cậu nói chậm lại."),
				badGrammar("Okay, I'll speak more slow.", "Được, tôi sẽ nói chậm hơn.", "\"Speak\" takes an adverb: \"more slowly\".", "Bổ nghĩa cho \"speak\" phải là trạng từ: \"more slowly\"."),
			}},
		},
		Events: []HeartEvent{{Hearts: 2, Lines: []Text{
			{"Once, my tower rang with every sound of English.", "Ngày xưa, tháp của ta vang lên mọi âm của tiếng Anh."},
			{"I wrote them all down in strange little letters.", "Ta đã ghi lại hết bằng những ký hiệu lạ lùng."},
			{"One day I will show you how to read them.", "Một ngày nào đó ta sẽ chỉ cậu cách đọc chúng."},
		}, Reward: Reward{Gold: 40, Items: map[string]int{"old_book": 1}}}},
	},
	{
		ID: "lina", Name: Text{"Lina", "Lina"}, Role: Text{"The librarian", "Thủ thư"},
		Loves: []string{"old_book"}, Likes: []string{"flowers"},
		Exchanges: []Exchange{
			{Line: Text{"Shh! This is a library.", "Suỵt! Đây là thư viện."}, Replies: [3]Reply{
				right("Sorry, I'll be quiet.", "Xin lỗi, tôi sẽ giữ yên lặng."),
				offTopic("Can I play music here?", "Tôi mở nhạc ở đây được không?", "Exactly what a library does not want.", "Đúng thứ mà thư viện không muốn."),
				badGrammar("Sorry, I'll be quietly.", "Xin lỗi, tôi sẽ yên lặng.", "After \"be\", use the adjective: \"be quiet\".", "Sau \"be\" dùng tính từ: \"be quiet\"."),
			}},
			{Line: Text{"What kind of books do you like?", "Cậu thích loại sách nào?"}, Replies: [3]Reply{
				right("I like stories about adventures.", "Tôi thích truyện phiêu lưu."),
				offTopic("I like blue.", "Tôi thích màu xanh.", "She asked about books, not colours.", "Cô ấy hỏi về sách, không hỏi màu."),
				badGrammar("I likes stories about adventure.", "Tôi thích truyện phiêu lưu.", "With \"I\", no -s: \"I like\".", "Với \"I\" không thêm -s: \"I like\"."),
			}},
			{Line: Text{"Can you tell me what \"borrow\" means?", "Cậu nói được \"borrow\" nghĩa là gì không?"}, Replies: [3]Reply{
				right("It means to take something and give it back later.", "Nghĩa là mượn một thứ rồi trả lại sau."),
				offTopic("It means a small animal.", "Nghĩa là một con vật nhỏ.", "That is \"burrow\"'s little cousin, not \"borrow\".", "Đó không phải nghĩa của \"borrow\"."),
				badGrammar("It mean take something and give back later.", "Nghĩa là mượn rồi trả lại sau.", "Say \"It means to take… and give it back\".", "Phải nói \"It means to take… and give it back\"."),
			}},
			{Line: Text{"This book is due back on Friday.", "Cuốn sách này phải trả vào thứ Sáu."}, Replies: [3]Reply{
				right("All right, I'll return it by Friday.", "Được, tôi sẽ trả trước thứ Sáu."),
				offTopic("All right, I'll eat it on Friday.", "Được, thứ Sáu tôi sẽ ăn nó.", "Books are for reading, not eating!", "Sách để đọc, không phải để ăn!"),
				badGrammar("All right, I return it on Friday ago.", "Được, tôi trả vào thứ Sáu.", "\"Ago\" is for the past; use \"I'll return it by Friday\".", "\"Ago\" dùng cho quá khứ; nói \"I'll return it by Friday\"."),
			}},
			{Line: Text{"Reading every day makes your English stronger.", "Đọc mỗi ngày giúp tiếng Anh của cậu vững hơn."}, Replies: [3]Reply{
				right("I agree. I'll try to read a little each night.", "Tôi đồng ý. Tôi sẽ cố đọc một chút mỗi tối."),
				offTopic("I agree. My arms are strong.", "Tôi đồng ý. Tay tôi khoẻ lắm.", "She meant strong English, not strong arms.", "Cô ấy nói tiếng Anh vững, không phải tay khoẻ."),
				badGrammar("I agree. I try read a little each nights.", "Tôi đồng ý. Tôi cố đọc mỗi tối.", "Say \"I'll try to read… each night\".", "Phải nói \"I'll try to read… each night\"."),
			}},
			{Line: Text{"Could you put this book back on the shelf?", "Cậu đặt lại cuốn sách này lên kệ giúp tôi nhé?"}, Replies: [3]Reply{
				right("Sure, no problem.", "Chắc chắn rồi, không thành vấn đề."),
				offTopic("Sure, I'll put it in the oven.", "Được, tôi sẽ cho nó vào lò.", "The shelf, not the oven!", "Lên kệ chứ không phải vào lò!"),
				badGrammar("Sure, no problems are.", "Được, không vấn đề.", "Just \"no problem\".", "Chỉ cần nói \"no problem\"."),
			}},
		},
		Events: []HeartEvent{{Hearts: 2, Lines: []Text{
			{"Every book here has a word that was lost.", "Mỗi cuốn sách ở đây đều có một từ đã bị mất."},
			{"When people forget a word, its page goes blank.", "Khi người ta quên một từ, trang của nó trở nên trắng trơn."},
			{"Maybe, with your help, we can fill them again.", "Có lẽ nhờ cậu, ta sẽ điền lại được chúng."},
		}, Reward: Reward{Gold: 40, Items: map[string]int{"flowers": 2}}}},
	},
	{
		ID: "hugo", Name: Text{"Hugo", "Hugo"}, Role: Text{"The café owner", "Chủ quán cà phê"},
		Loves: []string{"wool_scarf"}, Likes: []string{"flowers"}, Dislikes: []string{"honey_cake"},
		Exchanges: []Exchange{
			{Line: Text{"Hello! What can I get you?", "Xin chào! Tôi lấy gì cho cậu nhé?"}, Replies: [3]Reply{
				right("Could I have a coffee, please?", "Cho tôi một ly cà phê nhé?"),
				offTopic("Could I have a hammer, please?", "Cho tôi một cái búa nhé?", "This is a café, not a workshop.", "Đây là quán cà phê, không phải xưởng mộc."),
				badGrammar("I want coffee give me.", "Tôi muốn cà phê đưa tôi.", "Polite and in order: \"Could I have a coffee, please?\".", "Lịch sự và đúng trật tự: \"Could I have a coffee, please?\"."),
			}},
			{Line: Text{"Would you like sugar with that?", "Cậu có muốn thêm đường không?"}, Replies: [3]Reply{
				right("No, thank you. Just milk, please.", "Không, cảm ơn. Chỉ sữa thôi."),
				offTopic("No, thank you. I live on a farm.", "Không, cảm ơn. Tôi sống ở trang trại.", "Where you live does not answer the question.", "Nơi bạn sống không trả lời câu hỏi."),
				badGrammar("No, thanks you. Only milks.", "Không, cảm ơn. Chỉ sữa thôi.", "\"Thank you\", and milk has no plural here.", "\"Thank you\", và \"milk\" không thêm -s ở đây."),
			}},
			{Line: Text{"That's five gold, please.", "Của cậu năm vàng nhé."}, Replies: [3]Reply{
				right("Here you are.", "Đây ạ."),
				offTopic("Here you are: five apples.", "Đây ạ: năm quả táo.", "He asked for gold, not apples.", "Anh ấy cần vàng, không phải táo."),
				badGrammar("Here are you.", "Đây ạ.", "The fixed phrase is \"Here you are\".", "Cụm cố định là \"Here you are\"."),
			}},
			{Line: Text{"Is it for here or to take away?", "Uống ở đây hay mang đi?"}, Replies: [3]Reply{
				right("For here, please.", "Uống ở đây nhé."),
				offTopic("For tomorrow, please.", "Cho ngày mai nhé.", "He asked where, not when.", "Anh ấy hỏi ở đâu, không hỏi khi nào."),
				badGrammar("For here, pleased.", "Uống ở đây nhé.", "\"Please\", not \"pleased\".", "\"Please\", không phải \"pleased\"."),
			}},
			{Line: Text{"How was your meal?", "Bữa ăn thế nào?"}, Replies: [3]Reply{
				right("It was delicious, thank you.", "Ngon lắm, cảm ơn."),
				offTopic("It was raining.", "Trời mưa.", "That is about the weather, not the food.", "Câu đó nói về thời tiết, không phải món ăn."),
				badGrammar("It were delicious.", "Ngon lắm.", "One meal: \"It was\".", "Một bữa ăn: \"It was\"."),
			}},
			{Line: Text{"We close at nine tonight.", "Tối nay quán đóng cửa lúc chín giờ."}, Replies: [3]Reply{
				right("Thanks, I'll come back before nine.", "Cảm ơn, tôi sẽ quay lại trước chín giờ."),
				offTopic("Thanks, I'm nine years old.", "Cảm ơn, tôi chín tuổi.", "Nine o'clock, not your age.", "Chín giờ, không phải tuổi."),
				badGrammar("Thanks, I come back before nine o'clocks.", "Cảm ơn, tôi quay lại trước chín giờ.", "\"o'clock\" has no -s, and say \"I'll come back\".", "\"o'clock\" không thêm -s, và nói \"I'll come back\"."),
			}},
		},
		Events: []HeartEvent{{Hearts: 2, Lines: []Text{
			{"My grandmother opened this café fifty years ago.", "Bà tôi mở quán này năm mươi năm trước."},
			{"She said a good café is full of talk.", "Bà bảo một quán cà phê tốt là nơi đầy tiếng chuyện trò."},
			{"Lately it's too quiet. Thanks for talking with me.", "Dạo này quán vắng lặng quá. Cảm ơn cậu đã trò chuyện."},
		}, Reward: Reward{Gold: 40, Items: map[string]int{"coffee": 3}}}},
	},
	{
		ID: "vy", Name: Text{"Dr. Vy", "Bác sĩ Vy"}, Role: Text{"The doctor", "Bác sĩ"},
		Loves: []string{"flowers"}, Likes: []string{"old_book"}, Dislikes: []string{"honey_cake"},
		Exchanges: []Exchange{
			{Line: Text{"What seems to be the problem?", "Cậu bị làm sao vậy?"}, Replies: [3]Reply{
				right("I have a headache.", "Tôi bị đau đầu."),
				offTopic("I have a new hat.", "Tôi có một cái mũ mới.", "She asked what hurts.", "Bác sĩ hỏi cậu đau ở đâu."),
				badGrammar("I has a headache.", "Tôi bị đau đầu.", "With \"I\": \"I have\".", "Với \"I\": \"I have\"."),
			}},
			{Line: Text{"Take this medicine twice a day.", "Uống thuốc này hai lần một ngày."}, Replies: [3]Reply{
				right("Okay. Should I take it after meals?", "Vâng. Tôi uống sau bữa ăn nhé?"),
				offTopic("Okay. Should I plant it?", "Vâng. Tôi đem trồng nó nhé?", "Medicine is not a seed.", "Thuốc không phải hạt giống."),
				badGrammar("Okay. Should I taking it after meal?", "Vâng. Tôi uống sau bữa ăn nhé?", "After \"should\": \"take\", and \"after meals\".", "Sau \"should\" dùng \"take\", và \"after meals\"."),
			}},
			{Line: Text{"You should drink more water.", "Cậu nên uống nhiều nước hơn."}, Replies: [3]Reply{
				right("You're right. I'll drink more.", "Bác sĩ nói đúng. Tôi sẽ uống nhiều hơn."),
				offTopic("You're right. I'll buy a boat.", "Bác sĩ nói đúng. Tôi sẽ mua thuyền.", "Water to drink, not to sail on.", "Nước để uống, không phải để đi thuyền."),
				badGrammar("You're right. I'll drinks more.", "Bác sĩ nói đúng. Tôi sẽ uống nhiều hơn.", "After \"will\", no -s: \"I'll drink\".", "Sau \"will\" không thêm -s: \"I'll drink\"."),
			}},
			{Line: Text{"Where does it hurt?", "Đau ở đâu?"}, Replies: [3]Reply{
				right("It hurts here, in my knee.", "Đau ở đây, ở đầu gối."),
				offTopic("It hurts on Monday.", "Đau vào thứ Hai.", "She asked where, not when.", "Bác sĩ hỏi ở đâu, không hỏi khi nào."),
				badGrammar("It hurt here, in my knee.", "Đau ở đây, ở đầu gối.", "It is now: \"It hurts\".", "Đang đau: \"It hurts\"."),
			}},
			{Line: Text{"Get some rest and you'll feel better.", "Nghỉ ngơi đi rồi cậu sẽ thấy khá hơn."}, Replies: [3]Reply{
				right("Thank you, doctor. I'll go to bed early.", "Cảm ơn bác sĩ. Tôi sẽ đi ngủ sớm."),
				offTopic("Thank you, doctor. I'll fight a troll.", "Cảm ơn bác sĩ. Tôi sẽ đi đánh quỷ.", "Not quite resting!", "Như thế đâu phải là nghỉ ngơi!"),
				badGrammar("Thank you, doctor. I go bed early.", "Cảm ơn bác sĩ. Tôi đi ngủ sớm.", "Say \"I'll go to bed early\".", "Phải nói \"I'll go to bed early\"."),
			}},
			{Line: Text{"Did you eat breakfast today?", "Hôm nay cậu ăn sáng chưa?"}, Replies: [3]Reply{
				right("Yes, I had some bread and eggs.", "Rồi, tôi ăn bánh mì và trứng."),
				offTopic("Yes, I had a long walk.", "Rồi, tôi đi bộ một quãng dài.", "Walking is not breakfast.", "Đi bộ không phải bữa sáng."),
				badGrammar("Yes, I eated bread and egg.", "Rồi, tôi ăn bánh mì và trứng.", "The past of \"eat\" is \"ate\".", "Quá khứ của \"eat\" là \"ate\"."),
			}},
		},
		Events: []HeartEvent{{Hearts: 2, Lines: []Text{
			{"Since the Silence, people come to me with sore throats.", "Từ khi có Màn Im Lặng, người ta đến đây vì đau họng."},
			{"But it is not their throats. It is their words.", "Nhưng không phải tại họng. Mà là tại ngôn từ."},
			{"Here, for when the woods are hard on you.", "Đây, để dành khi khu rừng làm khó cậu."},
		}, Reward: Reward{Gold: 30, Items: map[string]int{"soup": 2, "herb_salve": 2}}}},
	},
}
