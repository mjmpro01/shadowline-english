package store

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// Dictation: a learner listens to half a minute to a minute and a half of an
// episode, then to it a few seconds at a time, writing down what they hear;
// checks it against what was said; shadows it; and listens again the next
// day. A passage is consecutive lines of one episode, and its pieces are cut
// at word boundaries from the episode's transcript, so the learner hears a
// phrase rather than a whole line at once.

const (
	// A passage is at least this long when the episode has that much…
	PassageMin = 30.0
	// …and never longer than this.
	PassageMax = 90.0
	// A piece is a phrase: long enough to mean something, short enough to hold
	// in the ear while writing it down.
	ChunkMin = 3.0
	ChunkMax = 7.0
	// A phrase may end a little early where the sentence itself pauses: at a
	// comma or a full stop.
	ChunkAtPunctuation = 2.0
)

// PassageClip is one line of a passage.
type PassageClip struct {
	ID              uuid.UUID `json:"id"`
	Title           string    `json:"title"`
	DurationSeconds float64   `json:"durationSeconds"`
	Text            string    `json:"text"`
}

// Chunk is a piece of a line to listen to and write down: where it is in the
// line's own audio, and what was said.
type Chunk struct {
	ClipID uuid.UUID `json:"clipId"`
	Start  float64   `json:"start"`
	End    float64   `json:"end"`
	Text   string    `json:"text"`
}

// Passage is what a dictation is done on.
type Passage struct {
	Episode struct {
		ID    uuid.UUID `json:"id"`
		Title string    `json:"title"`
	} `json:"episode"`
	Clips        []PassageClip `json:"clips"`
	Chunks       []Chunk       `json:"chunks"`
	TotalSeconds float64       `json:"totalSeconds"`
}

// PassageFrom is the run of lines a dictation starting at a clip covers: that
// clip and the ones after it in the episode, until there is at least half a
// minute and before there is more than a minute and a half. A line without
// its sound cannot be listened to and is passed over. An episode shorter than
// half a minute is taken whole from the start clip.
func PassageFrom(clips []Clip, start uuid.UUID) []Clip {
	at := -1
	for i, c := range clips {
		if c.ID == start {
			at = i
			break
		}
	}
	if at < 0 {
		return nil
	}
	var out []Clip
	total := 0.0
	for _, c := range clips[at:] {
		if !c.HasAudio {
			continue
		}
		if len(out) > 0 && total+c.DurationSeconds > PassageMax {
			break
		}
		out = append(out, c)
		total += c.DurationSeconds
		if total >= PassageMin {
			break
		}
	}
	return out
}

func captionText(c Clip) string {
	var lines []string
	for _, l := range c.Captions {
		if t := strings.TrimSpace(l.Text); t != "" {
			lines = append(lines, t)
		}
	}
	return strings.Join(lines, " ")
}

// spoken is a word worth comparing: something with a letter or a digit in it.
func spoken(token string) bool {
	return strings.IndexFunc(token, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }) >= 0
}

func endsPhrase(token string) bool {
	return strings.ContainsAny(token[max(0, len(token)-1):], ".,!?;:")
}

// ChunksOf cuts a line into pieces of three to seven seconds at word
// boundaries, from the episode's transcript words. Times are the line's own,
// from the start of its audio. The words written on the line by whoever
// published it are preferred over the transcriber's, as they were checked by
// a person, when the two have the same number of words; otherwise the
// transcriber's are what was heard. Without a transcript the whole line is one
// piece.
func ChunksOf(c Clip, words []Word) []Chunk {
	text := captionText(c)
	var mine []Word
	for _, w := range words {
		mid := (w.Start + w.End) / 2
		t := strings.TrimSpace(w.Text)
		if mid >= c.StartSeconds && mid < c.EndSeconds && spoken(t) {
			mine = append(mine, Word{Start: w.Start - c.StartSeconds, End: w.End - c.StartSeconds, Text: t})
		}
	}
	whole := []Chunk{{ClipID: c.ID, Start: 0, End: c.DurationSeconds, Text: text}}
	if len(mine) == 0 || c.EndSeconds <= c.StartSeconds {
		return whole
	}
	var written []string
	for _, f := range strings.Fields(text) {
		if spoken(f) {
			written = append(written, f)
		}
	}
	label := func(i int) string { return mine[i].Text }
	if len(written) == len(mine) {
		label = func(i int) string { return written[i] }
	}

	type run struct{ from, to int } // words [from, to)
	var runs []run
	from := 0
	for i := range mine {
		length := mine[i].End - mine[from].Start
		if i > from && length > ChunkMax && mine[i-1].End-mine[from].Start >= ChunkMin {
			runs = append(runs, run{from, i})
			from = i
			continue
		}
		sofar := mine[i].End - mine[from].Start
		pause := i+1 < len(mine) && mine[i+1].Start-mine[i].End > 0.25
		if i+1 < len(mine) && ((sofar >= ChunkAtPunctuation && endsPhrase(mine[i].Text)) || (sofar >= ChunkMin && pause)) {
			runs = append(runs, run{from, i + 1})
			from = i + 1
		}
	}
	if from < len(mine) {
		runs = append(runs, run{from, len(mine)})
	}
	// A last scrap too short to hear as a phrase joins the one before it; if
	// that makes one too long to hold in the ear, the two are cut again, in the
	// middle.
	if n := len(runs); n > 1 && mine[runs[n-1].to-1].End-mine[runs[n-1].from].Start < ChunkMin/2 {
		joined := run{runs[n-2].from, runs[n-1].to}
		runs = runs[:n-2]
		if mine[joined.to-1].End-mine[joined.from].Start <= ChunkMax {
			runs = append(runs, joined)
		} else {
			middle := (mine[joined.from].Start + mine[joined.to-1].End) / 2
			cut := joined.from + 1
			for cut < joined.to-1 && mine[cut].Start < middle {
				cut++
			}
			runs = append(runs, run{joined.from, cut}, run{cut, joined.to})
		}
	}

	out := make([]Chunk, 0, len(runs))
	for _, r := range runs {
		parts := make([]string, 0, r.to-r.from)
		for i := r.from; i < r.to; i++ {
			parts = append(parts, label(i))
		}
		out = append(out, Chunk{
			ClipID: c.ID,
			Start:  math.Max(0, mine[r.from].Start-0.15),
			End:    math.Min(c.DurationSeconds, mine[r.to-1].End+0.2),
			Text:   strings.Join(parts, " "),
		})
	}
	return out
}

func transcriptWords(ctx context.Context, tx pgx.Tx, source uuid.UUID) ([]Word, error) {
	var raw []byte
	err := tx.QueryRow(ctx, `select words from transcripts where source_id = $1`, source).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var words []Word
	return words, json.Unmarshal(raw, &words)
}

// DictationPassage is the passage a dictation starting at a clip covers.
func (s *Store) DictationPassage(ctx context.Context, clipID uuid.UUID) (Passage, error) {
	var out Passage
	start, err := s.ClipByID(ctx, clipID)
	if err != nil {
		return out, err
	}
	if start.SourceID == nil {
		return out, ErrNotFound
	}
	episode, err := s.EpisodeByID(ctx, *start.SourceID)
	if err != nil {
		return out, err
	}
	clips, err := s.ClipsByEpisode(ctx, episode.ID)
	if err != nil {
		return out, err
	}
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		words, err := transcriptWords(ctx, tx, episode.ID)
		if err != nil {
			return err
		}
		out.Episode.ID, out.Episode.Title = episode.ID, episode.Title
		out.Clips, out.Chunks = []PassageClip{}, []Chunk{}
		for _, c := range PassageFrom(clips, clipID) {
			out.Clips = append(out.Clips, PassageClip{ID: c.ID, Title: c.Title, DurationSeconds: c.DurationSeconds, Text: captionText(c)})
			out.Chunks = append(out.Chunks, ChunksOf(c, words)...)
			out.TotalSeconds += c.DurationSeconds
		}
		return nil
	})
	if err == nil && len(out.Clips) == 0 {
		return out, ErrNotFound // the line asked for has no sound to listen to
	}
	return out, err
}

// DictationErrors counts a dictation's mistakes by kind.
type DictationErrors struct {
	MissingEnding int `json:"missingEnding"`
	ShortWord     int `json:"shortWord"`
	UnknownWord   int `json:"unknownWord"`
	Sound         int `json:"sound"`
	Linking       int `json:"linking"`
	Other         int `json:"other"`
}

// ErrBadDictation is a report of a dictation that cannot be right: more words
// right than there were, or no lines.
var ErrBadDictation = errors.New("a dictation needs its lines, and no more right than there were words")

// NewDictation is a dictation done, as the app reports it.
type NewDictation struct {
	FirstClipID uuid.UUID       `json:"firstClipId"`
	ClipIDs     []uuid.UUID     `json:"clipIds"`
	Total       int             `json:"total"`
	Right       int             `json:"right"`
	Errors      DictationErrors `json:"errors"`
}

// Dictation is one done, and when it is to be listened to again.
type Dictation struct {
	ID           uuid.UUID       `json:"id"`
	EpisodeID    uuid.UUID       `json:"episodeId"`
	EpisodeTitle string          `json:"episodeTitle"`
	FirstClipID  uuid.UUID       `json:"firstClipId"`
	FirstLine    string          `json:"firstLine"`
	Total        int             `json:"total"`
	Right        int             `json:"right"`
	Errors       DictationErrors `json:"errors"`
	CreatedAt    time.Time       `json:"createdAt"`
	ReviewOn     string          `json:"reviewOn"`
	ReviewedAt   *time.Time      `json:"reviewedAt"`
}

// SaveDictation keeps a dictation and puts it down to be listened to again
// tomorrow, by the day in Vietnam.
func (s *Store) SaveDictation(ctx context.Context, user uuid.UUID, in NewDictation, now time.Time) (Dictation, error) {
	var out Dictation
	if in.Total < 0 || in.Right < 0 || in.Right > in.Total || len(in.ClipIDs) == 0 || len(in.ClipIDs) > 100 {
		return out, ErrBadDictation
	}
	first, err := s.ClipByID(ctx, in.FirstClipID)
	if err != nil {
		return out, err
	}
	if first.SourceID == nil {
		return out, ErrNotFound
	}
	errs, err := json.Marshal(in.Errors)
	if err != nil {
		return out, err
	}
	_, _, end := game.Day(now)
	tomorrow, _, _ := game.Day(end.Add(time.Hour))
	var id uuid.UUID
	if err := s.pool.QueryRow(ctx, `
		insert into dictations (user_id, episode_id, first_clip_id, clip_ids, total, "right", errors, review_on)
		values ($1, $2, $3, $4, $5, $6, $7, $8::date) returning id`,
		user, *first.SourceID, first.ID, in.ClipIDs, in.Total, in.Right, errs, tomorrow).Scan(&id); err != nil {
		return out, err
	}
	all, err := s.dictations(ctx, user, `d.id = $2`, id)
	if err != nil || len(all) == 0 {
		return out, err
	}
	return all[0], nil
}

func (s *Store) dictations(ctx context.Context, user uuid.UUID, where string, args ...any) ([]Dictation, error) {
	rows, err := s.pool.Query(ctx, `
		select d.id, d.episode_id, coalesce(src.title, ''), d.first_clip_id, coalesce(c.captions->0->>'text', ''),
		       d.total, d."right", d.errors, d.created_at, d.review_on::text, d.reviewed_at
		from dictations d
		left join clip_sources src on src.id = d.episode_id
		left join clips c on c.id = d.first_clip_id
		where d.user_id = $1 and `+where+`
		order by d.created_at desc limit 20`, append([]any{user}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Dictation{}
	for rows.Next() {
		var d Dictation
		var errs []byte
		if err := rows.Scan(&d.ID, &d.EpisodeID, &d.EpisodeTitle, &d.FirstClipID, &d.FirstLine,
			&d.Total, &d.Right, &errs, &d.CreatedAt, &d.ReviewOn, &d.ReviewedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(errs, &d.Errors); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DictationList is the learner's dictations: those due to be listened to
// again, and the latest.
type DictationList struct {
	Due    []Dictation `json:"due"`
	Recent []Dictation `json:"recent"`
}

func (s *Store) Dictations(ctx context.Context, user uuid.UUID, now time.Time) (DictationList, error) {
	var out DictationList
	today, _, _ := game.Day(now)
	var err error
	if out.Due, err = s.dictations(ctx, user, `d.reviewed_at is null and d.review_on <= $2::date`, today); err != nil {
		return out, err
	}
	out.Recent, err = s.dictations(ctx, user, `true`)
	return out, err
}

// ReviewDictation marks a dictation listened to again.
func (s *Store) ReviewDictation(ctx context.Context, user, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		update dictations set reviewed_at = coalesce(reviewed_at, now()) where id = $1 and user_id = $2`, id, user)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MakeDictationsDue moves a learner's dictations to be listened to again
// today, for a browser test that cannot wait for tomorrow.
func (s *Store) MakeDictationsDue(ctx context.Context, user uuid.UUID, now time.Time) error {
	today, _, _ := game.Day(now)
	_, err := s.pool.Exec(ctx, `update dictations set review_on = $2::date where user_id = $1`, user, today)
	return err
}
