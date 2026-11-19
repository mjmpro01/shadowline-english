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
