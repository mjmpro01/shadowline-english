package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
)

// Practice is what the tutor is told about one learner's work on one clip.
//
// Measurements only, and only this learner's. The tutor is a language model and
// will say something plausible about a score whether or not it has one; giving
// it the real numbers is how its "your stress was off" gets to be about this
// take rather than about takes in general.
type Practice struct {
	Takes int
	// Best is the best scored take, and nil until one has been scored.
	Best *float64
	// Latest is the four metrics of the most recent scored take.
	Latest map[string]float64
	// Unheard is the words of the line the transcriber did not hear in that
	// take — evidence, not a verdict, which the prompt says in as many words.
	Unheard []string
}

// PracticeOn reads Practice for one learner and one clip.
func (s *Store) PracticeOn(ctx context.Context, userID, clipID uuid.UUID) (Practice, error) {
	var out Practice
	if err := s.pool.QueryRow(ctx, `
		select count(*)::int, max(score)
		from takes where user_id = $1 and clip_id = $2 and status = 'scored'`,
		userID, clipID).Scan(&out.Takes, &out.Best); err != nil {
		return out, mapErr(err)
	}
	if out.Takes == 0 {
		return out, nil
	}

	var scores, analysis []byte
	err := s.pool.QueryRow(ctx, `
		select scores, analysis from takes
		where user_id = $1 and clip_id = $2 and status = 'scored'
		order by recorded_at desc limit 1`, userID, clipID).Scan(&scores, &analysis)
	if err != nil {
		return out, mapErr(err)
	}
	if len(scores) > 0 {
		_ = json.Unmarshal(scores, &out.Latest)
	}
	if len(analysis) > 0 {
		var a struct {
			Words *struct {
				Line []struct {
					Text  string `json:"text"`
					Heard bool   `json:"heard"`
				} `json:"line"`
			} `json:"words"`
		}
		if json.Unmarshal(analysis, &a) == nil && a.Words != nil {
			for _, w := range a.Words.Line {
				if !w.Heard {
					out.Unheard = append(out.Unheard, w.Text)
				}
			}
		}
	}
	return out, nil
}
