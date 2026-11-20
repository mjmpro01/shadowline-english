package notify

import "fmt"

// Facts is what a reminder's words are made of.
type Facts struct {
	PointsLeft  int
	Streak      int
	Series      string
	SeriesCount int
	Episodes    int
	RemindAt    string
	// Rank, Gap: the week's race (Gap is fourth's distance behind a learner
	// in the top three, or the learner's distance behind third).
	Rank int
	Gap  int
	// Place and Gold: last week's medal.
	Place int
	Gold  int
	// AchTrack, AchTarget: the first achievement untold; AchCount, how many.
	AchTrack  string
	AchTarget int
	AchCount  int
}

// Words is a reminder's title and body, in the learner's language.
func Words(kind Kind, locale string, f Facts) (title, body string) {
	en := locale == "en"
	switch kind {
	case Goal:
		if en {
			return "Today's practice is waiting 🎧", fmt.Sprintf("%d more points to reach your goal — five minutes will do it.", f.PointsLeft)
		}
		return "Hôm nay bạn chưa luyện đủ 🎧", fmt.Sprintf("Còn %d điểm nữa là đạt mục tiêu — 5 phút luyện là xong.", f.PointsLeft)
	case Streak:
		if en {
			return fmt.Sprintf("🔥 Your %d-day streak ends tonight", f.Streak), "Practise one clip before midnight to keep it."
		}
		return fmt.Sprintf("🔥 Chuỗi %d ngày sắp mất!", f.Streak), "Luyện 1 clip trước nửa đêm để giữ chuỗi."
	case NewEpisode:
		if f.SeriesCount <= 1 {
			if en {
				return fmt.Sprintf("%s has %d new %s", f.Series, f.Episodes, plural(f.Episodes, "episode", "episodes")),
					"Every line is a clip to practise."
			}
			return fmt.Sprintf("%s có %d tập mới", f.Series, f.Episodes), "Mỗi câu thoại là một clip để luyện."
		}
		if en {
			return fmt.Sprintf("%d new episodes in series you follow", f.Episodes), "Every line is a clip to practise."
		}
		return fmt.Sprintf("%d tập mới trong các series bạn theo dõi", f.Episodes), "Mỗi câu thoại là một clip để luyện."
	case Rank:
		if f.Rank <= 3 {
			if en {
				return fmt.Sprintf("🏆 You're #%d this week", f.Rank),
					fmt.Sprintf("Fourth place is only %d %s behind — practise a little more to keep your medal before midnight.", f.Gap, plural(f.Gap, "point", "points"))
			}
			return fmt.Sprintf("🏆 Bạn đang hạng %d tuần này", f.Rank),
				fmt.Sprintf("Hạng 4 chỉ kém bạn %d điểm — luyện thêm để giữ huy hiệu trước nửa đêm.", f.Gap)
		}
		clips := (f.Gap + 1) / 2
		if clips < 1 {
			clips = 1
		}
		if en {
			return fmt.Sprintf("🏆 %d %s from the top three", f.Gap, plural(f.Gap, "point", "points")),
				fmt.Sprintf("The week ends at midnight — %d %s will do it.", clips, plural(clips, "clip", "clips"))
		}
		return fmt.Sprintf("🏆 Còn %d điểm nữa là vào top 3", f.Gap),
			fmt.Sprintf("Tuần kết thúc lúc nửa đêm — %d clip là đủ.", clips)
	case Medal:
		icon := [...]string{"🥇", "🥈", "🥉"}[min(max(f.Place, 1), 3)-1]
		if en {
			place := [...]string{"first", "second", "third"}[min(max(f.Place, 1), 3)-1]
			body := "Your medal is on your Profile."
			if f.Gold > 0 {
				body = fmt.Sprintf("Your medal is on your Profile, and +%d 🪙 in your purse.", f.Gold)
			}
			return fmt.Sprintf("%s You finished %s last week!", icon, place), body
		}
		place := [...]string{"về nhất", "về nhì", "về ba"}[min(max(f.Place, 1), 3)-1]
		body := "Huy hiệu đã vào Hồ sơ của bạn."
		if f.Gold > 0 {
			body = fmt.Sprintf("Huy hiệu đã vào Hồ sơ, +%d 🪙.", f.Gold)
		}
		return fmt.Sprintf("%s Bạn %s tuần trước!", icon, place), body
	case Achievement:
		if f.AchCount > 1 {
			if en {
				return fmt.Sprintf("🏅 %d new achievements are waiting", f.AchCount), "See what you have unlocked."
			}
			return fmt.Sprintf("🏅 %d thành tích mới đang chờ bạn", f.AchCount), "Xem những gì bạn vừa mở khóa."
		}
		if en {
			return "🏅 New achievement: " + achievementName(f.AchTrack, f.AchTarget, true), "See it with the rest of your milestones."
		}
		return "🏅 Thành tích mới: " + achievementName(f.AchTrack, f.AchTarget, false), "Xem cùng các cột mốc khác của bạn."
	default:
		if en {
			return "This is how Shadowline will remind you 🔔", fmt.Sprintf("You will be reminded at %s each day.", f.RemindAt)
		}
		return "Shadowline sẽ nhắc bạn như thế này 🔔", fmt.Sprintf("Bạn sẽ được nhắc lúc %s mỗi ngày.", f.RemindAt)
	}
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// achievementName is a milestone's name, as the app's achievements page has it.
func achievementName(track string, n int, en bool) string {
	if en {
		switch track {
		case "takes":
			if n == 1 {
				return "First take"
			}
			return fmt.Sprintf("%d takes", n)
		case "score":
			return fmt.Sprintf("%d %s scoring 90+", n, plural(n, "take", "takes"))
		case "streak":
			return fmt.Sprintf("%d-day streak", n)
		case "goal":
			return fmt.Sprintf("Daily goal reached on %d %s", n, plural(n, "day", "days"))
		case "dictation":
			if n == 1 {
				return "First dictation"
			}
			return fmt.Sprintf("%d dictations", n)
		case "perfect":
			return fmt.Sprintf("%d %s without a mistake", n, plural(n, "dictation", "dictations"))
		case "words":
			return fmt.Sprintf("%d words known", n)
		case "dialogue":
			return fmt.Sprintf("%d dialogue lines spoken", n)
		case "tutor":
			if n == 1 {
				return "First turn with the tutor"
			}
			return fmt.Sprintf("%d turns with the tutor", n)
		case "medal":
			if n == 1 {
				return "First weekly medal"
			}
			return fmt.Sprintf("%d weekly medals", n)
		}
		return fmt.Sprintf("%s %d", track, n)
	}
	switch track {
	case "takes":
		if n == 1 {
			return "Bản ghi đầu tiên"
		}
		return fmt.Sprintf("Ghi âm %d lần", n)
	case "score":
		return fmt.Sprintf("%d bản ghi đạt 90+", n)
	case "streak":
		return fmt.Sprintf("Chuỗi %d ngày", n)
	case "goal":
		return fmt.Sprintf("Đạt mục tiêu %d ngày", n)
	case "dictation":
		if n == 1 {
			return "Bài chép đầu tiên"
		}
		return fmt.Sprintf("Chép %d bài", n)
	case "perfect":
		return fmt.Sprintf("%d bài chép không sai chữ nào", n)
	case "words":
		return fmt.Sprintf("Thuộc %d từ", n)
	case "dialogue":
		return fmt.Sprintf("Nói %d câu hội thoại", n)
	case "tutor":
		if n == 1 {
			return "Lượt đầu tiên với gia sư"
		}
		return fmt.Sprintf("%d lượt nói với gia sư", n)
	case "medal":
		if n == 1 {
			return "Huy hiệu tuần đầu tiên"
		}
		return fmt.Sprintf("%d huy hiệu tuần", n)
	}
	return fmt.Sprintf("%s %d", track, n)
}
