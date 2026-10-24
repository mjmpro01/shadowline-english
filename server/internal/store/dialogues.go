package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Dialogues are short everyday conversations: heard, read along with line by
// line until the learner knows them, and copied from into a phrasebook of
// their own — the situation and phrase in one column, the context and how it
// feels in the other.

// DialogueLine is one thing one of the two people says.
type DialogueLine struct {
	// Speaker is "A" or "B".
	Speaker string `json:"speaker"`
	// Name is who they are in the scene: "Barista", "You".
	Name string `json:"name"`
	Text string `json:"text"`
	// Vi is what it means in Vietnamese.
	Vi string `json:"vi"`
}

// DialoguePhrase is a phrase worth copying down, with why.
type DialoguePhrase struct {
	Phrase string `json:"phrase"`
	Note   string `json:"note"`
}

// DialogueInput is everything an admin writes about a dialogue.
type DialogueInput struct {
	Title     string           `json:"title"`
	Situation string           `json:"situation"`
	Topic     string           `json:"topic"`
	Level     string           `json:"level"`
	Lines     []DialogueLine   `json:"lines"`
	Phrases   []DialoguePhrase `json:"phrases"`
	Published bool             `json:"published"`
	Position  int              `json:"position"`
}

// Dialogue is one, as kept.
type Dialogue struct {
	ID   uuid.UUID `json:"id"`
	Slug string    `json:"slug"`
	DialogueInput
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ErrBadDialogue is a dialogue the app could not use; the message says why.
type ErrBadDialogue struct{ Why string }

func (e ErrBadDialogue) Error() string { return e.Why }

// Limits on what a dialogue holds.
const (
	DialogueMinLines = 2
	DialogueMaxLines = 20
	DialogueMaxText  = 300
	PhraseMaxText    = 300
	PhraseNoteMax    = 1000
)

var dialogueLevels = map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true}

// DialogueLevel is whether a level is one a dialogue can have.
func DialogueLevel(level string) bool { return dialogueLevels[level] }

// Clean trims a dialogue and says what is wrong with it, if anything.
func (in *DialogueInput) Clean() error {
	in.Title = strings.TrimSpace(in.Title)
	in.Situation = strings.TrimSpace(in.Situation)
	in.Topic = strings.TrimSpace(in.Topic)
	if in.Level == "" {
		in.Level = "A2"
	}
	if in.Title == "" {
		return ErrBadDialogue{"a dialogue needs a title"}
	}
	if !dialogueLevels[in.Level] {
		return ErrBadDialogue{"the level is A1, A2, B1 or B2"}
	}
	if len(in.Lines) < DialogueMinLines || len(in.Lines) > DialogueMaxLines {
		return ErrBadDialogue{fmt.Sprintf("a dialogue has %d to %d lines", DialogueMinLines, DialogueMaxLines)}
	}
	speakers := map[string]bool{}
	for i := range in.Lines {
		l := &in.Lines[i]
		l.Speaker = strings.ToUpper(strings.TrimSpace(l.Speaker))
		l.Name, l.Text, l.Vi = strings.TrimSpace(l.Name), strings.TrimSpace(l.Text), strings.TrimSpace(l.Vi)
		if l.Speaker != "A" && l.Speaker != "B" {
			return ErrBadDialogue{fmt.Sprintf("line %d: the speaker is A or B", i+1)}
		}
		if l.Text == "" || len([]rune(l.Text)) > DialogueMaxText {
			return ErrBadDialogue{fmt.Sprintf("line %d: a line has 1 to %d characters", i+1, DialogueMaxText)}
		}
		speakers[l.Speaker] = true
	}
	if len(speakers) != 2 {
		return ErrBadDialogue{"a dialogue is between two people, A and B"}
	}
	kept := in.Phrases[:0]
	for _, p := range in.Phrases {
		p.Phrase, p.Note = strings.TrimSpace(p.Phrase), strings.TrimSpace(p.Note)
		if p.Phrase != "" {
			kept = append(kept, p)
		}
	}
	in.Phrases = kept
	if in.Phrases == nil {
		in.Phrases = []DialoguePhrase{}
	}
	return nil
}

const dialogueColumns = `id, slug, title, situation, topic, level, lines, phrases, published, position, created_at, updated_at`

func scanDialogue(row pgx.CollectableRow) (Dialogue, error) {
	var d Dialogue
	var lines, phrases []byte
	if err := row.Scan(&d.ID, &d.Slug, &d.Title, &d.Situation, &d.Topic, &d.Level, &lines, &phrases,
		&d.Published, &d.Position, &d.CreatedAt, &d.UpdatedAt); err != nil {
		return d, err
	}
	if err := json.Unmarshal(lines, &d.Lines); err != nil {
		return d, err
	}
	return d, json.Unmarshal(phrases, &d.Phrases)
}

func (s *Store) dialogues(ctx context.Context, sql string, args ...any) ([]Dialogue, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanDialogue)
}

// AllDialogues is every dialogue, drafts too, for the console.
func (s *Store) AllDialogues(ctx context.Context) ([]Dialogue, error) {
	return s.dialogues(ctx, `select `+dialogueColumns+` from dialogues order by position, created_at`)
}

// slugOf is slugify's rule, falling back to a word of its own.
func slugOf(title string) string {
	s := strings.Trim(notSlug.ReplaceAllString(strings.ToLower(title), "-"), "-")
	if s == "" {
		s = "dialogue"
	}
	return s
}

// CreateDialogue keeps a new dialogue, under a slug made from its title.
func (s *Store) CreateDialogue(ctx context.Context, in DialogueInput) (Dialogue, error) {
	if err := in.Clean(); err != nil {
		return Dialogue{}, err
	}
	lines, _ := json.Marshal(in.Lines)
	phrases, _ := json.Marshal(in.Phrases)
	base := slugOf(in.Title)
	for n := 1; n < 100; n++ {
		slug := base
		if n > 1 {
			slug = fmt.Sprintf("%s-%d", base, n)
		}
		rows, err := s.pool.Query(ctx, `
			insert into dialogues (slug, title, situation, topic, level, lines, phrases, published, position)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			on conflict (slug) do nothing
			returning `+dialogueColumns,
			slug, in.Title, in.Situation, in.Topic, in.Level, lines, phrases, in.Published, in.Position)
		if err != nil {
			return Dialogue{}, err
		}
		got, err := pgx.CollectRows(rows, scanDialogue)
		if err != nil {
			return Dialogue{}, err
		}
		if len(got) == 1 {
			return got[0], nil
		}
	}
	return Dialogue{}, errors.New("could not find a free slug for " + in.Title)
}

// UpdateDialogue replaces what an admin wrote about a dialogue.
func (s *Store) UpdateDialogue(ctx context.Context, id uuid.UUID, in DialogueInput) (Dialogue, error) {
	if err := in.Clean(); err != nil {
		return Dialogue{}, err
	}
	lines, _ := json.Marshal(in.Lines)
	phrases, _ := json.Marshal(in.Phrases)
	got, err := s.dialogues(ctx, `
		update dialogues set title = $2, situation = $3, topic = $4, level = $5, lines = $6, phrases = $7,
		       published = $8, position = $9, updated_at = now()
		where id = $1 returning `+dialogueColumns,
		id, in.Title, in.Situation, in.Topic, in.Level, lines, phrases, in.Published, in.Position)
	if err != nil {
		return Dialogue{}, err
	}
	if len(got) == 0 {
		return Dialogue{}, ErrNotFound
	}
	// A line taken out takes its passes with it; the ones after it move up
	// only in number, which is close enough to start them again.
	if _, err := s.pool.Exec(ctx, `delete from dialogue_passes where dialogue_id = $1 and line >= $2`,
		id, len(in.Lines)); err != nil {
		return Dialogue{}, err
	}
	return got[0], nil
}

// DeleteDialogue removes a dialogue; phrases copied from it stay in their
// phrasebooks.
func (s *Store) DeleteDialogue(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from dialogues where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- The learner's side ------------------------------------------------------

// DialoguePassesGoal is how many times a line is read aloud before it counts
// as known: the method says five to ten.
const DialoguePassesGoal = 5

// DialogueSummary is a dialogue in the list, with how far this learner is.
type DialogueSummary struct {
	ID        uuid.UUID `json:"id"`
	Slug      string    `json:"slug"`
	Title     string    `json:"title"`
	Situation string    `json:"situation"`
	Topic     string    `json:"topic"`
	Level     string    `json:"level"`
	Lines     int       `json:"lines"`
	// Known is how many lines have been read aloud the goal's number of times.
	Known int `json:"known"`
}

// PublishedDialogues is the list a learner chooses from.
func (s *Store) PublishedDialogues(ctx context.Context, user uuid.UUID) ([]DialogueSummary, error) {
	rows, err := s.pool.Query(ctx, `
		select d.id, d.slug, d.title, d.situation, d.topic, d.level, jsonb_array_length(d.lines),
		       (select count(*)::int from dialogue_passes p
		        where p.dialogue_id = d.id and p.user_id = $1 and p.passes >= $2)
		from dialogues d where d.published
		order by d.position, d.created_at`, user, DialoguePassesGoal)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DialogueSummary{}
	for rows.Next() {
		var d DialogueSummary
		if err := rows.Scan(&d.ID, &d.Slug, &d.Title, &d.Situation, &d.Topic, &d.Level, &d.Lines, &d.Known); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// LinePasses is a learner's reading of one line.
type LinePasses struct {
	Passes int     `json:"passes"`
	Best   float64 `json:"best"`
}

// LearnerDialogue is a published dialogue and this learner's passes at it.
type LearnerDialogue struct {
	Dialogue
	Passes []LinePasses `json:"passes"`
	Goal   int          `json:"goal"`
}

// PublishedDialogue is one dialogue to learn, by id or slug.
func (s *Store) PublishedDialogue(ctx context.Context, user uuid.UUID, ref string) (LearnerDialogue, error) {
	var out LearnerDialogue
	where, arg := `slug = $1`, any(ref)
	if id, err := uuid.Parse(ref); err == nil {
		where, arg = `id = $1`, id
	}
	got, err := s.dialogues(ctx, `select `+dialogueColumns+` from dialogues where published and `+where, arg)
	if err != nil {
		return out, err
	}
	if len(got) == 0 {
		return out, ErrNotFound
	}
	out.Dialogue, out.Goal = got[0], DialoguePassesGoal
	out.Passes = make([]LinePasses, len(out.Lines))
	rows, err := s.pool.Query(ctx, `
		select line, passes, best from dialogue_passes where user_id = $1 and dialogue_id = $2`, user, out.ID)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var line int
		var p LinePasses
		if err := rows.Scan(&line, &p.Passes, &p.Best); err != nil {
			return out, err
		}
		if line < len(out.Passes) {
			out.Passes[line] = p
		}
	}
	return out, rows.Err()
}

// RecordPass counts one reading of a line aloud. heard of total is how much
// of it the browser heard, when it could listen; total is zero when it could
// not, and the reading counts on the learner's word.
func (s *Store) RecordPass(ctx context.Context, user, dialogue uuid.UUID, line, heard, total int) (LinePasses, error) {
	var out LinePasses
	var lines int
	err := s.pool.QueryRow(ctx, `select jsonb_array_length(lines) from dialogues where id = $1 and published`,
		dialogue).Scan(&lines)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrNotFound
	}
	if err != nil {
		return out, err
	}
	if line < 0 || line >= lines || heard < 0 || total < 0 || heard > total {
		return out, ErrBadDialogue{"no such line, or more heard than was said"}
	}
	share := 0.0
	if total > 0 {
		share = float64(heard) / float64(total)
	}
	err = s.pool.QueryRow(ctx, `
		insert into dialogue_passes (user_id, dialogue_id, line, passes, best) values ($1, $2, $3, 1, $4)
		on conflict (user_id, dialogue_id, line) do update
		set passes = dialogue_passes.passes + 1, best = greatest(dialogue_passes.best, excluded.best), updated_at = now()
		returning passes, best`, user, dialogue, line, share).Scan(&out.Passes, &out.Best)
	return out, err
}

// --- The phrasebook ------------------------------------------------------------

// PhrasebookEntry is one row of a learner's phrasebook.
type PhrasebookEntry struct {
	ID         uuid.UUID  `json:"id"`
	DialogueID *uuid.UUID `json:"dialogueId"`
	Situation  string     `json:"situation"`
	Phrase     string     `json:"phrase"`
	Note       string     `json:"note"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// PhraseInput is what a learner writes in their phrasebook.
type PhraseInput struct {
	DialogueID *uuid.UUID `json:"dialogueId"`
	Situation  string     `json:"situation"`
	Phrase     string     `json:"phrase"`
	Note       string     `json:"note"`
}

func (in *PhraseInput) clean() error {
	in.Situation, in.Phrase, in.Note = strings.TrimSpace(in.Situation), strings.TrimSpace(in.Phrase), strings.TrimSpace(in.Note)
	if in.Phrase == "" || len([]rune(in.Phrase)) > PhraseMaxText || len([]rune(in.Situation)) > PhraseMaxText {
		return ErrBadDialogue{fmt.Sprintf("a phrase has 1 to %d characters", PhraseMaxText)}
	}
	if len([]rune(in.Note)) > PhraseNoteMax {
		return ErrBadDialogue{fmt.Sprintf("a note has at most %d characters", PhraseNoteMax)}
	}
	return nil
}

const phraseColumns = `id, dialogue_id, situation, phrase, note, created_at, updated_at`

func scanPhrase(row pgx.CollectableRow) (PhrasebookEntry, error) {
	var p PhrasebookEntry
	err := row.Scan(&p.ID, &p.DialogueID, &p.Situation, &p.Phrase, &p.Note, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func (s *Store) phrases(ctx context.Context, sql string, args ...any) ([]PhrasebookEntry, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanPhrase)
}

// Phrasebook is a learner's phrasebook, newest first.
func (s *Store) Phrasebook(ctx context.Context, user uuid.UUID) ([]PhrasebookEntry, error) {
	return s.phrases(ctx, `select `+phraseColumns+` from phrasebook where user_id = $1 order by created_at desc`, user)
}

// AddPhrase writes a phrase into a learner's phrasebook.
func (s *Store) AddPhrase(ctx context.Context, user uuid.UUID, in PhraseInput) (PhrasebookEntry, error) {
	if err := in.clean(); err != nil {
		return PhrasebookEntry{}, err
	}
	got, err := s.phrases(ctx, `
		insert into phrasebook (user_id, dialogue_id, situation, phrase, note)
		values ($1, (select id from dialogues where id = $2), $3, $4, $5)
		returning `+phraseColumns, user, in.DialogueID, in.Situation, in.Phrase, in.Note)
	if err != nil {
		return PhrasebookEntry{}, err
	}
	return got[0], nil
}

// UpdatePhrase rewrites a row of a learner's own phrasebook.
func (s *Store) UpdatePhrase(ctx context.Context, user, id uuid.UUID, in PhraseInput) (PhrasebookEntry, error) {
	if err := in.clean(); err != nil {
		return PhrasebookEntry{}, err
	}
	got, err := s.phrases(ctx, `
		update phrasebook set situation = $3, phrase = $4, note = $5, updated_at = now()
		where id = $1 and user_id = $2 returning `+phraseColumns, id, user, in.Situation, in.Phrase, in.Note)
	if err != nil {
		return PhrasebookEntry{}, err
	}
	if len(got) == 0 {
		return PhrasebookEntry{}, ErrNotFound
	}
	return got[0], nil
}

// DeletePhrase takes a row out of a learner's own phrasebook.
func (s *Store) DeletePhrase(ctx context.Context, user, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from phrasebook where id = $1 and user_id = $2`, id, user)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// --- The starters --------------------------------------------------------------

const startersMarker = "00033_starter_dialogues"

// SeedStarterDialoguesOnce publishes the starter dialogues the first time a
// server runs with dialogues, recorded in schema_migrations like a migration —
// so an install that later deletes them does not get them back.
func (s *Store) SeedStarterDialoguesOnce(ctx context.Context) error {
	tag, err := s.pool.Exec(ctx,
		`insert into schema_migrations (name) values ($1) on conflict do nothing`, startersMarker)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	return s.SeedStarterDialogues(ctx)
}

// SeedStarterDialogues publishes the starter dialogues.
func (s *Store) SeedStarterDialogues(ctx context.Context) error {
	for i, d := range StarterDialogues() {
		d.Published, d.Position = true, i
		if _, err := s.CreateDialogue(ctx, d); err != nil {
			return fmt.Errorf("starter dialogue %q: %w", d.Title, err)
		}
	}
	return nil
}
