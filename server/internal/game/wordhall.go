package game

// The second half of Echo Town: the Word Hall the Silence has closed, the notes
// its Lexi left on the door in IPA, Lina's library of words, and the letters
// the townsfolk send asking for things. Each is a way of practising: reading
// sounds, knowing what words mean, reading a request.

const (
	// NotesPerDay is how many Lexi notes are on the Word Hall's door each day.
	NotesPerDay = 3
	// NoteGold is what a note read right earns.
	NoteGold = 8
	// The band of how common a note's words are, when the learner's own
	// vocabulary runs short.
	NoteRankLo = 1
	NoteRankHi = 3000
	// LetterPoints is the friendship a letter's request earns, done.
	LetterPoints = 40
)

// LibraryMilestone is a number of words given to the library, and what Lina
// gives back for reaching it.
type LibraryMilestone struct {
	Words  int    `json:"words"`
	Reward Reward `json:"reward"`
}

// LibraryMilestones are the library's thanks, smallest first.
var LibraryMilestones = []LibraryMilestone{
	{Words: 5, Reward: Reward{Gold: 50}},
	{Words: 15, Reward: Reward{Gold: 120, Items: map[string]int{"seed_bloom": 2}}},
	{Words: 30, Reward: Reward{Gold: 150, Items: map[string]int{"seed_golden": 1}}},
	{Words: 50, Reward: Reward{Gold: 300, Items: map[string]int{"seed_golden": 2}}},
}

// MilestoneByWords is the milestone at a number of words.
func MilestoneByWords(words int) (LibraryMilestone, bool) {
	for _, m := range LibraryMilestones {
		if m.Words == words {
			return m, true
		}
	}
	return LibraryMilestone{}, false
}

// Letter is a request someone in town sends to the farm: a few lines of
// English saying what they would like brought, and how many. The browser shows
// the words, not the item — reading them is the point.
type Letter struct {
	Body []Text `json:"body"`
	Item string `json:"-"`
	Qty  int    `json:"-"`
	Gold int    `json:"gold"`
}

// LetterFor is the day's letter, and who it is from: one a day, the same every
// time it is asked for that day.
func LetterFor(user, day string) (Townsperson, Letter) {
	r := dayRand(user, day, "letter")
	from := Townsfolk[r.Intn(len(Townsfolk))]
	letters := Letters[from.ID]
	return from, letters[r.Intn(len(letters))]
}

// Letters are what each person in town might write, in their own voice.
var Letters = map[string][]Letter{
	"elsa": {
		{Body: []Text{
			{"Dear farmer,", "Bác nông dân thân mến,"},
			{"We have a town meeting tonight, and I would like something sweet for it.", "Tối nay có họp thị trấn, và tôi muốn có chút đồ ngọt."},
			{"Could you bring me two honey cakes?", "Cậu mang giúp tôi hai cái bánh mật ong nhé?"},
			{"Thank you, Elsa", "Cảm ơn cậu, Elsa"},
		}, Item: "honey_cake", Qty: 2, Gold: 70},
		{Body: []Text{
			{"Dear farmer,", "Bác nông dân thân mến,"},
			{"The town hall looks so grey since the Silence.", "Toà thị chính trông xám xịt quá từ khi có Màn Im Lặng."},
			{"Please bring me one bunch of flowers for my desk.", "Làm ơn mang cho tôi một bó hoa để trên bàn làm việc."},
			{"Elsa", "Elsa"},
		}, Item: "flowers", Qty: 1, Gold: 40},
		{Body: []Text{
			{"Hello again,", "Chào cậu lần nữa,"},
			{"I work late every night. I need something to keep me awake.", "Đêm nào tôi cũng làm việc muộn. Tôi cần thứ gì đó cho tỉnh táo."},
			{"Three cups of coffee from Hugo's café would be perfect.", "Ba ly cà phê ở quán Hugo là tuyệt nhất."},
			{"Elsa", "Elsa"},
		}, Item: "coffee", Qty: 3, Gold: 80},
	},
	"orin": {
		{Body: []Text{
			{"Young one,", "Cháu nhỏ,"},
			{"My tower is cold, and my old neck feels it most.", "Tháp của ta lạnh lắm, cái cổ già này thấy rõ nhất."},
			{"Bring me a wool scarf, if you would be so kind.", "Mang cho ta một chiếc khăn len, nếu cháu tử tế đến vậy."},
			{"Orin", "Orin"},
		}, Item: "wool_scarf", Qty: 1, Gold: 55},
		{Body: []Text{
			{"Young one,", "Cháu nhỏ,"},
			{"I have read every book in my tower twice.", "Ta đã đọc mỗi cuốn sách trong tháp hai lần rồi."},
			{"Find me two old books, and I will be happy for a month.", "Tìm cho ta hai cuốn sách cũ, ta sẽ vui cả tháng."},
			{"Orin", "Orin"},
		}, Item: "old_book", Qty: 2, Gold: 80},
		{Body: []Text{
			{"Young one,", "Cháu nhỏ,"},
			{"My voice is rough from reading aloud all day.", "Giọng ta khàn vì đọc to cả ngày."},
			{"A cup of ginger tea would help. Just one, please.", "Một tách trà gừng sẽ đỡ hơn. Chỉ một tách thôi nhé."},
			{"Orin", "Orin"},
		}, Item: "ginger_tea", Qty: 1, Gold: 40},
	},
	"lina": {
		{Body: []Text{
			{"Hi farmer!", "Chào bác nông dân!"},
			{"Some pages fell out of our oldest books. I need new ones to copy them into.", "Vài trang rơi ra khỏi những cuốn sách cổ nhất. Tôi cần sách mới để chép lại."},
			{"Could you bring me one old book?", "Cậu mang cho tôi một cuốn sách cũ được không?"},
			{"Lina", "Lina"},
		}, Item: "old_book", Qty: 1, Gold: 45},
		{Body: []Text{
			{"Hi farmer!", "Chào bác nông dân!"},
			{"The library needs some colour. Readers like a happy room.", "Thư viện cần chút màu sắc. Người đọc thích một căn phòng vui tươi."},
			{"Please bring two bunches of flowers.", "Làm ơn mang hai bó hoa nhé."},
			{"Lina", "Lina"},
		}, Item: "flowers", Qty: 2, Gold: 60},
		{Body: []Text{
			{"Hi farmer!", "Chào bác nông dân!"},
			{"I forgot to eat lunch again. I was reading.", "Tôi lại quên ăn trưa. Mải đọc sách quá."},
			{"A bowl of warm soup would save me!", "Một bát súp nóng sẽ cứu tôi đấy!"},
			{"Lina", "Lina"},
		}, Item: "soup", Qty: 1, Gold: 50},
	},
	"hugo": {
		{Body: []Text{
			{"Hey there!", "Chào cậu!"},
			{"I want to make a new tea for the café, but I need to taste the old one first.", "Tôi muốn pha một loại trà mới cho quán, nhưng phải nếm loại cũ trước."},
			{"Bring me two ginger teas from Mira, please.", "Mang giúp tôi hai tách trà gừng của Mira nhé."},
			{"Hugo", "Hugo"},
		}, Item: "ginger_tea", Qty: 2, Gold: 60},
		{Body: []Text{
			{"Hey there!", "Chào cậu!"},
			{"My tables look sad. Customers want flowers on them.", "Bàn trong quán trông buồn quá. Khách muốn có hoa trên bàn."},
			{"Three bunches of flowers, please. One for each table.", "Ba bó hoa nhé. Mỗi bàn một bó."},
			{"Hugo", "Hugo"},
		}, Item: "flowers", Qty: 3, Gold: 80},
		{Body: []Text{
			{"Hey there!", "Chào cậu!"},
			{"The kitchen is cold in the morning.", "Buổi sáng bếp lạnh lắm."},
			{"Could you find me a wool scarf?", "Cậu tìm giúp tôi một chiếc khăn len được không?"},
			{"Hugo", "Hugo"},
		}, Item: "wool_scarf", Qty: 1, Gold: 55},
	},
	"vy": {
		{Body: []Text{
			{"Dear farmer,", "Bác nông dân thân mến,"},
			{"Many people came back from the woods with cuts today.", "Hôm nay nhiều người từ rừng về bị trầy xước."},
			{"Please bring me two herb salves for the clinic.", "Làm ơn mang cho tôi hai lọ thuốc thảo mộc cho phòng khám."},
			{"Dr. Vy", "Bác sĩ Vy"},
		}, Item: "herb_salve", Qty: 2, Gold: 75},
		{Body: []Text{
			{"Dear farmer,", "Bác nông dân thân mến,"},
			{"A sick child is staying at the clinic tonight.", "Tối nay có một em bé ốm ở lại phòng khám."},
			{"Warm soup is the best medicine. Could you bring one bowl?", "Súp nóng là thuốc tốt nhất. Cậu mang giúp một bát nhé?"},
			{"Dr. Vy", "Bác sĩ Vy"},
		}, Item: "soup", Qty: 1, Gold: 50},
		{Body: []Text{
			{"Dear farmer,", "Bác nông dân thân mến,"},
			{"My patients wait a long time, and they get bored.", "Bệnh nhân của tôi phải chờ lâu, và họ thấy chán."},
			{"Two old books for the waiting room would be wonderful.", "Hai cuốn sách cũ cho phòng chờ thì tuyệt vời."},
			{"Dr. Vy", "Bác sĩ Vy"},
		}, Item: "old_book", Qty: 2, Gold: 80},
	},
}
