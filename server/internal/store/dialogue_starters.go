package store

// StarterDialogues are the conversations a new install begins with: everyday
// situations, written for this app, each with what it means in Vietnamese and
// the phrases worth copying into a phrasebook.
func StarterDialogues() []DialogueInput {
	type l = DialogueLine
	type p = DialoguePhrase
	return []DialogueInput{
		{
			Title: "Ordering a coffee", Topic: "Food & drink", Level: "A1",
			Situation: "Bạn gọi đồ uống ở một quán cà phê.",
			Lines: []DialogueLine{
				l{"A", "Barista", "Hi there! What can I get for you?", "Chào bạn! Bạn muốn gọi gì?"},
				l{"B", "You", "Can I get a medium latte, please?", "Cho mình một ly latte cỡ vừa nhé."},
				l{"A", "Barista", "Sure. For here or to go?", "Được ạ. Uống ở đây hay mang đi?"},
				l{"B", "You", "To go, please.", "Mang đi nhé."},
				l{"A", "Barista", "Anything else? We have fresh croissants today.", "Bạn có cần gì thêm không? Hôm nay có bánh sừng bò mới ra lò."},
				l{"B", "You", "No, that's all, thanks.", "Không, vậy thôi, cảm ơn."},
				l{"A", "Barista", "That'll be four fifty.", "Của bạn hết bốn đô năm mươi."},
				l{"B", "You", "Here you go. Keep the change.", "Gửi bạn. Không cần thối lại đâu."},
			},
			Phrases: []DialoguePhrase{
				p{"Can I get …, please?", "Cách gọi món tự nhiên nhất; lịch sự mà không quá trang trọng như \"Could I have\"."},
				p{"For here or to go?", "Câu nhân viên hay hỏi; trả lời ngắn: \"For here\" / \"To go\"."},
				p{"That's all, thanks.", "Báo là mình gọi xong rồi, giọng nhẹ nhàng, thân thiện."},
				p{"Keep the change.", "Nói khi muốn để lại tiền thừa; nghe hào phóng, vui vẻ."},
			},
		},
		{
			Title: "Asking for directions", Topic: "Travel", Level: "A1",
			Situation: "Bạn bị lạc và hỏi đường tới ga tàu.",
			Lines: []DialogueLine{
				l{"A", "You", "Excuse me, sorry to bother you. Is the train station near here?", "Xin lỗi, phiền bạn chút. Ga tàu có gần đây không?"},
				l{"B", "Local", "Yes, it's about ten minutes on foot.", "Có, đi bộ khoảng mười phút."},
				l{"A", "You", "Great. Which way do I go?", "Tuyệt. Mình đi hướng nào ạ?"},
				l{"B", "Local", "Go straight down this street and turn left at the bank.", "Đi thẳng con đường này rồi rẽ trái ở chỗ ngân hàng."},
				l{"A", "You", "Left at the bank. And then?", "Rẽ trái ở ngân hàng. Rồi sao nữa ạ?"},
				l{"B", "Local", "Then it's on your right. You can't miss it.", "Rồi nó ở bên tay phải. Bạn không thể lạc được đâu."},
				l{"A", "You", "Thank you so much!", "Cảm ơn bạn nhiều lắm!"},
				l{"B", "Local", "No problem. Have a good trip!", "Không có gì. Chúc bạn đi vui vẻ!"},
			},
			Phrases: []DialoguePhrase{
				p{"Sorry to bother you.", "Mở lời với người lạ một cách lịch sự, làm họ dễ chịu giúp mình."},
				p{"It's about ten minutes on foot.", "\"on foot\" = đi bộ; dùng để nói khoảng cách bằng thời gian."},
				p{"Turn left at the bank.", "Mẫu chỉ đường: turn left/right at + một địa điểm dễ thấy."},
				p{"You can't miss it.", "Ý là rất dễ thấy; nói để người hỏi yên tâm."},
			},
		},
		{
			Title: "Small talk with a coworker", Topic: "Work", Level: "A2",
			Situation: "Sáng thứ Hai, bạn gặp đồng nghiệp ở chỗ pha cà phê trong văn phòng.",
			Lines: []DialogueLine{
				l{"A", "Coworker", "Morning! How was your weekend?", "Chào buổi sáng! Cuối tuần của bạn thế nào?"},
				l{"B", "You", "Pretty good, thanks. I finally got some rest. How about you?", "Khá ổn, cảm ơn. Cuối cùng mình cũng được nghỉ ngơi. Còn bạn?"},
				l{"A", "Coworker", "Busy! My sister's wedding was on Saturday.", "Bận lắm! Đám cưới em gái mình vào thứ Bảy."},
				l{"B", "You", "Oh, congratulations! How did it go?", "Ồ, chúc mừng nhé! Đám cưới thế nào?"},
				l{"A", "Coworker", "It was lovely, but I'm exhausted.", "Đẹp lắm, nhưng giờ mình mệt rã rời."},
				l{"B", "You", "I bet. Well, at least it's a short week.", "Chắc chắn rồi. Mà dù sao tuần này cũng ngắn."},
				l{"A", "Coworker", "True. See you at the meeting later.", "Đúng vậy. Lát nữa gặp ở cuộc họp nhé."},
			},
			Phrases: []DialoguePhrase{
				p{"How was your weekend?", "Câu mở chuyện an toàn đầu tuần với đồng nghiệp."},
				p{"I finally got some rest.", "\"finally\" thể hiện sự nhẹ nhõm sau một thời gian bận."},
				p{"How did it go?", "Hỏi diễn biến/kết quả một sự kiện; thể hiện mình quan tâm."},
				p{"I bet.", "Đồng cảm ngắn gọn, nghĩa là \"chắc chắn rồi, mình hiểu\"."},
			},
		},
		{
			Title: "Booking a doctor's appointment", Topic: "Health", Level: "A2",
			Situation: "Bạn gọi điện tới phòng khám để đặt lịch khám.",
			Lines: []DialogueLine{
				l{"A", "Receptionist", "Good morning, City Clinic. How can I help you?", "Chào buổi sáng, phòng khám City. Tôi có thể giúp gì cho bạn?"},
				l{"B", "You", "Hi, I'd like to make an appointment with a doctor.", "Xin chào, tôi muốn đặt lịch khám bác sĩ."},
				l{"A", "Receptionist", "Of course. What seems to be the problem?", "Vâng. Bạn đang gặp vấn đề gì ạ?"},
				l{"B", "You", "I've had a sore throat and a fever since Monday.", "Tôi bị đau họng và sốt từ thứ Hai."},
				l{"A", "Receptionist", "I see. We have an opening tomorrow at ten. Does that work for you?", "Tôi hiểu rồi. Mai lúc mười giờ còn trống. Giờ đó có tiện cho bạn không?"},
				l{"B", "You", "Yes, that works. Thank you.", "Vâng, được ạ. Cảm ơn."},
				l{"A", "Receptionist", "Can I have your name, please?", "Cho tôi xin tên của bạn nhé?"},
				l{"B", "You", "It's Linh Nguyen. L-I-N-H.", "Tôi là Linh Nguyễn. L-I-N-H."},
			},
			Phrases: []DialoguePhrase{
				p{"I'd like to make an appointment.", "Câu chuẩn để đặt lịch hẹn; lịch sự với \"I'd like to\"."},
				p{"What seems to be the problem?", "Cách nhân viên y tế hỏi triệu chứng một cách nhẹ nhàng."},
				p{"I've had … since Monday.", "Thì hiện tại hoàn thành + since: bệnh bắt đầu từ trước và vẫn còn."},
				p{"Does that work for you?", "Hỏi xem thời gian có tiện không; trả lời \"That works\"."},
			},
		},
		{
			Title: "Checking in at a hotel", Topic: "Travel", Level: "A2",
			Situation: "Bạn tới khách sạn và làm thủ tục nhận phòng.",
			Lines: []DialogueLine{
				l{"A", "Receptionist", "Good evening. Welcome to the Riverside Hotel.", "Chào buổi tối. Chào mừng quý khách tới khách sạn Riverside."},
				l{"B", "You", "Hi, I have a reservation under the name Tran.", "Chào bạn, tôi có đặt phòng dưới tên Trần."},
				l{"A", "Receptionist", "Let me check. Yes, a double room for three nights.", "Để tôi kiểm tra. Vâng, một phòng đôi trong ba đêm."},
				l{"B", "You", "That's right. Is breakfast included?", "Đúng rồi. Có bao gồm bữa sáng không?"},
				l{"A", "Receptionist", "Yes, it's served from six to ten on the ground floor.", "Có, phục vụ từ sáu tới mười giờ ở tầng trệt."},
				l{"B", "You", "Perfect. And what's the Wi-Fi password?", "Tuyệt. Còn mật khẩu Wi-Fi là gì vậy?"},
				l{"A", "Receptionist", "It's on your key card. Here you are, room 512.", "Có ghi trên thẻ phòng ạ. Của quý khách đây, phòng 512."},
				l{"B", "You", "Thanks a lot.", "Cảm ơn nhiều."},
			},
			Phrases: []DialoguePhrase{
				p{"I have a reservation under the name …", "Câu mở đầu khi nhận phòng hoặc tới nhà hàng đã đặt bàn."},
				p{"Is breakfast included?", "Hỏi xem giá đã gồm thứ gì chưa; \"included\" dùng rất nhiều khi đi du lịch."},
				p{"Here you are.", "Nói khi đưa đồ cho ai đó; lịch sự, tự nhiên."},
			},
		},
		{
			Title: "Introducing yourself in an interview", Topic: "Work", Level: "B1",
			Situation: "Buổi phỏng vấn xin việc: người phỏng vấn mời bạn giới thiệu bản thân.",
			Lines: []DialogueLine{
				l{"A", "Interviewer", "Thanks for coming in. Could you tell me a little about yourself?", "Cảm ơn bạn đã tới. Bạn có thể giới thiệu đôi chút về bản thân không?"},
				l{"B", "You", "Sure. I'm a marketing assistant with two years of experience in social media.", "Vâng. Tôi là trợ lý marketing với hai năm kinh nghiệm về mạng xã hội."},
				l{"A", "Interviewer", "What do you enjoy most about your work?", "Bạn thích điều gì nhất trong công việc của mình?"},
				l{"B", "You", "I love turning data into ideas that people actually respond to.", "Tôi thích biến dữ liệu thành những ý tưởng mà mọi người thực sự hưởng ứng."},
				l{"A", "Interviewer", "And why are you interested in this role?", "Vì sao bạn quan tâm tới vị trí này?"},
				l{"B", "You", "I'm looking for a chance to lead my own campaigns, and your team does exactly that.", "Tôi đang tìm cơ hội tự dẫn dắt chiến dịch của mình, và đội của anh chị làm đúng điều đó."},
				l{"A", "Interviewer", "That's great to hear.", "Thật vui khi nghe vậy."},
			},
			Phrases: []DialoguePhrase{
				p{"Could you tell me a little about yourself?", "Câu hỏi mở đầu gần như buổi phỏng vấn nào cũng có; nên chuẩn bị sẵn 3–4 câu trả lời."},
				p{"… with two years of experience in …", "Cấu trúc gọn để nói kinh nghiệm; nghe chuyên nghiệp."},
				p{"I'm looking for a chance to …", "Nói mục tiêu một cách tích cực, hướng về phía trước."},
				p{"That's great to hear.", "Đáp lại thông tin tích cực một cách ấm áp."},
			},
		},
		{
			Title: "Returning something at a shop", Topic: "Shopping", Level: "A2",
			Situation: "Bạn mang chiếc áo đã mua tới cửa hàng để đổi.",
			Lines: []DialogueLine{
				l{"A", "You", "Hi, I bought this shirt last week, but it's too small.", "Chào bạn, tuần trước mình mua chiếc áo này nhưng nó chật quá."},
				l{"B", "Assistant", "No problem. Do you have the receipt?", "Không sao. Bạn có hoá đơn không?"},
				l{"A", "You", "Yes, here it is.", "Có, đây ạ."},
				l{"B", "Assistant", "Would you like to exchange it or get a refund?", "Bạn muốn đổi hay lấy lại tiền?"},
				l{"A", "You", "Could I exchange it for a larger size?", "Mình đổi sang cỡ lớn hơn được không?"},
				l{"B", "Assistant", "Let me see if we have one in stock. Yes, here's a large.", "Để tôi xem còn hàng không. Có rồi, cỡ L đây."},
				l{"A", "You", "Thanks for your help!", "Cảm ơn bạn đã giúp!"},
			},
			Phrases: []DialoguePhrase{
				p{"It's too small.", "Nói lý do đổi hàng; thay small bằng big/long/short tuỳ trường hợp."},
				p{"Exchange it or get a refund?", "Hai lựa chọn khi trả hàng: đổi món khác hoặc nhận lại tiền."},
				p{"Let me see if we have one in stock.", "Câu người bán nói khi đi xem còn hàng không; \"in stock\" = còn hàng."},
			},
		},
		{
			Title: "Making weekend plans", Topic: "Friends", Level: "A2",
			Situation: "Bạn nhắn tin rủ một người bạn đi chơi cuối tuần.",
			Lines: []DialogueLine{
				l{"A", "You", "Hey, are you free this Saturday?", "Này, thứ Bảy này bạn rảnh không?"},
				l{"B", "Friend", "I think so. What did you have in mind?", "Chắc là rảnh. Bạn định làm gì?"},
				l{"A", "You", "There's a new night market opening downtown. Want to check it out?", "Có một chợ đêm mới mở ở trung tâm. Đi xem thử không?"},
				l{"B", "Friend", "Sounds fun! What time?", "Nghe vui đấy! Mấy giờ?"},
				l{"A", "You", "How about seven? We could grab dinner there.", "Bảy giờ được không? Mình ăn tối ở đó luôn."},
				l{"B", "Friend", "Perfect. I'll meet you at the entrance.", "Hoàn hảo. Mình gặp nhau ở cổng nhé."},
				l{"A", "You", "Deal. See you then!", "Chốt. Gặp sau nhé!"},
			},
			Phrases: []DialoguePhrase{
				p{"Are you free this Saturday?", "Cách rủ đi chơi nhẹ nhàng, không gây áp lực."},
				p{"What did you have in mind?", "Hỏi ý định của người kia; thân thiện, tò mò."},
				p{"Want to check it out?", "Rủ đi xem thử; giọng hào hứng, thân mật giữa bạn bè."},
				p{"Deal.", "Một từ để chốt kế hoạch; vui vẻ, dứt khoát."},
			},
		},
		{
			Title: "Rescheduling a meeting", Topic: "Work", Level: "B1",
			Situation: "Bạn gọi điện cho khách hàng để xin dời lịch họp.",
			Lines: []DialogueLine{
				l{"A", "You", "Hi Mark, it's Ha from Bright Studio. Do you have a minute?", "Chào anh Mark, em là Hà từ Bright Studio. Anh có rảnh một phút không ạ?"},
				l{"B", "Client", "Sure, what's up?", "Được chứ, có chuyện gì vậy?"},
				l{"A", "You", "I'm afraid something urgent has come up, and I can't make our meeting on Thursday.", "Em e là có việc gấp, nên em không dự cuộc họp thứ Năm được."},
				l{"B", "Client", "Oh, that's okay. When would suit you?", "Ồ, không sao. Khi nào thì tiện cho em?"},
				l{"A", "You", "Would Friday morning work for you instead?", "Thay vào đó sáng thứ Sáu có được không ạ?"},
				l{"B", "Client", "Friday at nine is fine.", "Thứ Sáu lúc chín giờ thì được."},
				l{"A", "You", "Great, I'll send you an updated invite. Sorry for the trouble.", "Tuyệt, em sẽ gửi lại lời mời mới. Xin lỗi đã làm phiền anh."},
				l{"B", "Client", "No worries at all.", "Không sao đâu."},
			},
			Phrases: []DialoguePhrase{
				p{"Do you have a minute?", "Hỏi xem người kia có thời gian không trước khi vào việc; tôn trọng thời gian của họ."},
				p{"I'm afraid something urgent has come up.", "\"I'm afraid\" làm tin xấu nhẹ đi; rất hay dùng ở công sở."},
				p{"Would Friday morning work for you instead?", "Đề xuất thời gian khác một cách lịch sự."},
				p{"Sorry for the trouble.", "Xin lỗi vì gây bất tiện; khép lại cuộc gọi nhã nhặn."},
			},
		},
		{
			Title: "At the airport check-in", Topic: "Travel", Level: "A2",
			Situation: "Bạn làm thủ tục ở quầy hãng bay.",
			Lines: []DialogueLine{
				l{"A", "Agent", "Good morning. Where are you flying to today?", "Chào buổi sáng. Hôm nay quý khách bay đi đâu?"},
				l{"B", "You", "To Singapore. Here's my passport.", "Đi Singapore. Hộ chiếu của tôi đây."},
				l{"A", "Agent", "Thank you. Are you checking any bags?", "Cảm ơn. Quý khách có ký gửi hành lý không?"},
				l{"B", "You", "Just this one suitcase.", "Chỉ một vali này thôi."},
				l{"A", "Agent", "Would you prefer a window or an aisle seat?", "Quý khách muốn ngồi cạnh cửa sổ hay lối đi?"},
				l{"B", "You", "A window seat, if possible.", "Cạnh cửa sổ, nếu được."},
				l{"A", "Agent", "Here's your boarding pass. Boarding starts at gate 14 at 8:30.", "Thẻ lên máy bay của quý khách đây. Lên máy bay ở cổng 14 lúc 8 giờ 30."},
				l{"B", "You", "Thank you very much.", "Cảm ơn nhiều."},
			},
			Phrases: []DialoguePhrase{
				p{"Are you checking any bags?", "Hỏi về hành lý ký gửi; trả lời \"Just one\" hoặc \"Only carry-on\"."},
				p{"Would you prefer a window or an aisle seat?", "Chọn chỗ ngồi: cạnh cửa sổ hay lối đi."},
				p{"…, if possible.", "Thêm vào cuối lời đề nghị cho mềm mỏng, không đòi hỏi."},
			},
		},
	}
}
