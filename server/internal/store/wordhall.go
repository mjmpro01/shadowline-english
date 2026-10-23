package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// The rest of Echo Town: the Lexi's notes on the Word Hall's door, read with
// Sage Orin's glasses; Lina's library, given words whose meaning the player
// knows; and the letter someone in town sends each day. A question asked here
// is kept with its answer in game_quizzes until it is answered, the way a
// fight keeps its question: the browser is only ever sent the choices.

func (p profileRow) hallOpen() bool    { return p.reached(game.HallStep) }
func (p profileRow) libraryOpen() bool { return p.reached(game.LibraryStep) }
func (p profileRow) lettersOpen() bool { return p.reached(game.LetterStep) }

// The words the notes and the library's questions come from when the
// learner's own run short, and the words to choose among.
var (
	noteWords    = game.Monster{RankLo: game.NoteRankLo, RankHi: game.NoteRankHi}
	libraryWords = game.Monster{RankLo: 1, RankHi: 6000}
)

// QuizView is a question as the browser sees it: no answer.
type QuizView struct {
	Kind    string   `json:"kind"`
	Prompt  string   `json:"prompt"`
	Options []string `json:"options"`
	// Say is the word to speak aloud, for a word to be heard.
	Say string `json:"say,omitempty"`
}

// quiz is a question as it is kept, answer and all.
type quiz struct {
	Kind    string   `json:"kind"`
	Prompt  string   `json:"prompt"`
	Options []string `json:"options"`
	Word    string   `json:"word"`
	Answer  string   `json:"answer"`
	IPA     string   `json:"ipa"`
	Meaning string   `json:"meaning"`
}

func (q quiz) view() *QuizView {
	return &QuizView{Kind: q.Kind, Prompt: q.Prompt, Options: q.Options}
}

func newQuiz(q game.Question, e game.Entry) quiz {
	return quiz{Kind: q.Kind, Prompt: q.Prompt, Options: q.Options, Word: q.Word, Answer: q.Answer,
		IPA: e.IPA, Meaning: e.Meaning}
}

func pendingQuiz(ctx context.Context, tx pgx.Tx, user uuid.UUID, kind string) (*quiz, error) {
	var raw []byte
	err := tx.QueryRow(ctx, `select question from game_quizzes where user_id = $1 and kind = $2 for update`,
		user, kind).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var q quiz
	return &q, json.Unmarshal(raw, &q)
}

func saveQuiz(ctx context.Context, tx pgx.Tx, user uuid.UUID, kind string, q quiz) error {
	raw, err := json.Marshal(q)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		insert into game_quizzes (user_id, kind, question) values ($1, $2, $3)
		on conflict (user_id, kind) do update set question = excluded.question, created_at = now()`,
		user, kind, raw)
	return err
}

func dropQuiz(ctx context.Context, tx pgx.Tx, user uuid.UUID, kind string) error {
	_, err := tx.Exec(ctx, `delete from game_quizzes where user_id = $1 and kind = $2`, user, kind)
	return err
}

// QuizAnswer is what a question was about, told once it is answered.
type QuizAnswer struct {
	Right   bool   `json:"right"`
	Word    string `json:"word"`
	IPA     string `json:"ipa"`
	Meaning string `json:"meaning"`
	Gold    int    `json:"gold"`
}

func (q quiz) answered(answer string) QuizAnswer {
	return QuizAnswer{Right: game.Question{Answer: q.Answer}.Right(answer), Word: q.Word, IPA: q.IPA, Meaning: q.Meaning}
}

// --- The Word Hall ---------------------------------------------------------

// HallView is the Word Hall's door: whether the player can read what is on
// it, and the note to read if there is one left today.
type HallView struct {
	Glasses bool      `json:"glasses"`
	Read    int       `json:"read"`
	PerDay  int       `json:"perDay"`
	Note    *QuizView `json:"note"`
}

func notesRead(ctx context.Context, tx pgx.Tx, user uuid.UUID, day string) (int, error) {
	var read int
	err := tx.QueryRow(ctx, `
		select coalesce((select read from game_notes where user_id = $1 and day = $2::date), 0)`,
		user, day).Scan(&read)
	return read, err
}

// VisitHall is the player at the Word Hall's door: the visit is noted, once a
// day, and the next note is put up if the player has the glasses to read it.
func (s *Store) VisitHall(ctx context.Context, user uuid.UUID) (HallView, GameState, error) {
	var out HallView
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if !p.townOpen() {
			return refuse("town_locked", "the town is not open yet")
		}
		day, start, _ := game.Day(now)
		var seen bool
		if err := tx.QueryRow(ctx, `
			select exists (select 1 from game_events where user_id = $1 and kind = 'word_hall' and at >= $2)`,
			user, start).Scan(&seen); err != nil {
			return err
		}
		if !seen {
			if err := logEvent(ctx, tx, user, "word_hall", "", 0); err != nil {
				return err
			}
		}
		glasses, err := p.hasGlasses(ctx, tx, user)
		if err != nil || !glasses {
			return err
		}
		out.Glasses, out.PerDay = true, game.NotesPerDay
		if out.Read, err = notesRead(ctx, tx, user, day); err != nil || out.Read >= game.NotesPerDay {
			return err
		}
		note, err := pendingQuiz(ctx, tx, user, "note")
		if err != nil {
			return err
		}
		if note == nil {
			q, e, err := askOne(ctx, tx, user, noteWords, game.GameIPA, "")
			if err != nil {
				return err
			}
			made := newQuiz(q, e)
			if err := saveQuiz(ctx, tx, user, "note", made); err != nil {
				return err
			}
			note = &made
		}
		out.Note = note.view()
		return nil
	})
	return out, state, err
}

// ReadNote is the player's reading of the note on the door.
func (s *Store) ReadNote(ctx context.Context, user uuid.UUID, answer string) (QuizAnswer, GameState, error) {
	var res QuizAnswer
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		glasses, err := p.hasGlasses(ctx, tx, user)
		if err != nil {
			return err
		}
		if !glasses {
			return refuse("need_glasses", "the notes cannot be read without Sage Orin's glasses")
		}
		note, err := pendingQuiz(ctx, tx, user, "note")
		if err != nil {
			return err
		}
		if note == nil {
			return refuse("no_note", "there is no note to read")
		}
		day, _, _ := game.Day(now)
		res = note.answered(answer)
		if _, err := tx.Exec(ctx, `
			insert into game_notes (user_id, day, read) values ($1, $2::date, 1)
			on conflict (user_id, day) do update set read = game_notes.read + 1`, user, day); err != nil {
			return err
		}
		if err := dropQuiz(ctx, tx, user, "note"); err != nil {
			return err
		}
		if err := logEvent(ctx, tx, user, "note", note.Word, 0); err != nil {
			return err
		}
		if !res.Right {
			return nil
		}
		res.Gold = game.NoteGold
		p.gold += game.NoteGold
		return logEvent(ctx, tx, user, "note_right", note.Word, game.NoteGold)
	})
	return res, state, err
}

// askOne makes one question of a kind: about word if it is given, otherwise
// about the next word the learner should see.
func askOne(ctx context.Context, tx pgx.Tx, user uuid.UUID, band game.Monster, kind, word string) (game.Question, game.Entry, error) {
	r := newRand()
	var asked []string
	for try := 0; try < 6; try++ {
		var target game.Entry
		if word != "" {
			e, err := vocabEntry(ctx, tx, user, word)
			if err != nil {
				return game.Question{}, e, err
			}
			target = e
		} else {
			e, ok, err := nextWord(ctx, tx, user, band, asked, 1, r)
			if err != nil {
				return game.Question{}, e, err
			}
			if !ok {
				asked = nil
				continue
			}
			target = e
		}
		pool, err := wrongAnswers(ctx, tx, band, target.Word)
		if err != nil {
			return game.Question{}, target, err
		}
		if q, ok := game.NewQuestion(kind, target, pool, r); ok {
			return q, target, nil
		}
		if word != "" {
			break
		}
		asked = append(asked, target.Word)
	}
	return game.Question{}, game.Entry{}, errors.New("no word to ask about")
}

// --- The library -----------------------------------------------------------

// MilestoneView is one of the library's milestones, and where the player is
// with it.
type MilestoneView struct {
	game.LibraryMilestone
	Reached bool `json:"reached"`
	Claimed bool `json:"claimed"`
}

// LibraryWord is a word the player could give.
type LibraryWord struct {
	Word string `json:"word"`
	IPA  string `json:"ipa"`
}

// LibraryView is Lina's library as the player sees it.
type LibraryView struct {
	Donated    int             `json:"donated"`
	Milestones []MilestoneView `json:"milestones"`
	// Words the player could give, first page of them, and how many in all.
	Words     []LibraryWord `json:"words"`
	Available int           `json:"available"`
	// Asked is a question already put and not yet answered.
	Asked *QuizView `json:"asked"`
	// AskedWord is the word Asked is about.
	AskedWord string `json:"askedWord"`
}

// libraryPage is how many givable words the library lists at a time.
const libraryPage = 60

// givable is the words the player could give the library: theirs, with a
// meaning to be asked about, never given, and not missed today.
const givable = `
	from vocab_words v left join glosses g on g.word = v.word
	left join game_library l on l.user_id = v.user_id and l.word = v.word
	where v.user_id = $1
	  and coalesce(nullif(g.meaning, ''), v.meaning) <> ''
	  and l.donated_at is null and (l.tried_on is null or l.tried_on <> $2::date)
	  and ($3 = '' or v.word ilike '%' || $3 || '%')`

func libraryView(ctx context.Context, tx pgx.Tx, user uuid.UUID, day, search string) (LibraryView, error) {
	out := LibraryView{Milestones: []MilestoneView{}, Words: []LibraryWord{}}
	if err := tx.QueryRow(ctx, `
		select count(*)::int from game_library where user_id = $1 and donated_at is not null`,
		user).Scan(&out.Donated); err != nil {
		return out, err
	}
	claimed := map[int]bool{}
	rows, err := tx.Query(ctx, `select milestone from game_library_claims where user_id = $1`, user)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var m int
		if err := rows.Scan(&m); err != nil {
			rows.Close()
			return out, err
		}
		claimed[m] = true
	}
	rows.Close()
	for _, m := range game.LibraryMilestones {
		out.Milestones = append(out.Milestones, MilestoneView{LibraryMilestone: m,
			Reached: out.Donated >= m.Words, Claimed: claimed[m.Words]})
	}
	if err := tx.QueryRow(ctx, `select count(*)::int `+givable, user, day, search).Scan(&out.Available); err != nil {
		return out, err
	}
	rows, err = tx.Query(ctx, `
		select v.word, coalesce(nullif(g.ipa, ''), v.ipa) `+givable+`
		order by v.word limit $4`, user, day, search, libraryPage)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var w LibraryWord
		if err := rows.Scan(&w.Word, &w.IPA); err != nil {
			return out, err
		}
		out.Words = append(out.Words, w)
	}
	return out, rows.Err()
}

func libraryClosed(p profileRow) error {
	if !p.libraryOpen() {
		return refuse("library_closed", "Lina is not taking words yet")
	}
	return nil
}

// Library is the library, with the words the player could give that match a
// search.
func (s *Store) Library(ctx context.Context, user uuid.UUID, search string) (LibraryView, error) {
	var out LibraryView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		if err := libraryClosed(p); err != nil {
			return err
		}
		day, _, _ := game.Day(now)
		if out, err = libraryView(ctx, tx, user, day, search); err != nil {
			return err
		}
		asked, err := pendingQuiz(ctx, tx, user, "donate")
		if err != nil || asked == nil {
			return err
		}
		out.Asked, out.AskedWord = asked.view(), asked.Word
		return nil
	})
	return out, err
}

// vocabEntry is one of the player's words with what the dictionary says.
func vocabEntry(ctx context.Context, tx pgx.Tx, user uuid.UUID, word string) (game.Entry, error) {
	e := game.Entry{Word: word}
	err := tx.QueryRow(ctx, `
		select coalesce(nullif(g.ipa, ''), v.ipa), coalesce(nullif(g.meaning, ''), v.meaning)
		from vocab_words v left join glosses g on g.word = v.word
		where v.user_id = $1 and v.word = $2`, user, word).Scan(&e.IPA, &e.Meaning)
	if errors.Is(err, pgx.ErrNoRows) {
		return e, badMove("not_yours", "that word is not in your vocabulary")
	}
	return e, err
}

// AskDonation is Lina asking what a word the player would give means.
func (s *Store) AskDonation(ctx context.Context, user uuid.UUID, word string) (QuizView, error) {
	var out QuizView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		if err := libraryClosed(p); err != nil {
			return err
		}
		day, _, _ := game.Day(now)
		var ok bool
		if err := tx.QueryRow(ctx, `select exists (select 1 `+givable+` and v.word = $4)`,
			user, day, "", word).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return refuse("not_givable", "that word cannot be given today")
		}
		q, e, err := askOne(ctx, tx, user, libraryWords, game.GameMeaning, word)
		if err != nil {
			return err
		}
		made := newQuiz(q, e)
		if err := saveQuiz(ctx, tx, user, "donate", made); err != nil {
			return err
		}
		out = *made.view()
		return nil
	})
	return out, err
}

// Donate is the player's answer to what the word means: right, and the word
// is the library's; wrong, and it waits for another day.
func (s *Store) Donate(ctx context.Context, user uuid.UUID, answer string) (QuizAnswer, GameState, error) {
	var res QuizAnswer
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if err := libraryClosed(*p); err != nil {
			return err
		}
		asked, err := pendingQuiz(ctx, tx, user, "donate")
		if err != nil {
			return err
		}
		if asked == nil {
			return refuse("no_question", "Lina has not asked about a word")
		}
		if err := dropQuiz(ctx, tx, user, "donate"); err != nil {
			return err
		}
		res = asked.answered(answer)
		day, _, _ := game.Day(now)
		if !res.Right {
			_, err := tx.Exec(ctx, `
				insert into game_library (user_id, word, tried_on) values ($1, $2, $3::date)
				on conflict (user_id, word) do update set tried_on = excluded.tried_on`, user, asked.Word, day)
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into game_library (user_id, word, donated_at) values ($1, $2, $3)
			on conflict (user_id, word) do update set donated_at = excluded.donated_at`, user, asked.Word, now); err != nil {
			return err
		}
		return logEvent(ctx, tx, user, "donate", asked.Word, 0)
	})
	return res, state, err
}

// ClaimMilestone is Lina's thanks for reaching a number of words, once.
func (s *Store) ClaimMilestone(ctx context.Context, user uuid.UUID, words int) (game.Reward, GameState, error) {
	var reward game.Reward
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if err := libraryClosed(*p); err != nil {
			return err
		}
		m, ok := game.MilestoneByWords(words)
		if !ok {
			return badMove("no_milestone", "there is no milestone at that many words")
		}
		var donated int
		if err := tx.QueryRow(ctx, `
			select count(*)::int from game_library where user_id = $1 and donated_at is not null`,
			user).Scan(&donated); err != nil {
			return err
		}
		if donated < m.Words {
			return refuse("not_done", "not enough words given yet")
		}
		tag, err := tx.Exec(ctx, `
			insert into game_library_claims (user_id, milestone) values ($1, $2) on conflict do nothing`, user, m.Words)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return refuse("claimed", "already thanked for")
		}
		reward = m.Reward
		return applyReward(ctx, tx, user, p, now, m.Reward)
	})
	return reward, state, err
}

// --- Letters ---------------------------------------------------------------

// LetterView is the day's letter as the mailbox shows it: who wrote and what
// they wrote, but not the item — reading it is how the player finds out.
type LetterView struct {
	From game.Townsperson `json:"from"`
	Body []game.Text      `json:"body"`
	Gold int              `json:"gold"`
	Done bool             `json:"done"`
}

func todaysLetter(ctx context.Context, tx pgx.Tx, user uuid.UUID, p profileRow, now time.Time) (*LetterView, error) {
	if !p.lettersOpen() {
		return nil, nil
	}
	day, _, _ := game.Day(now)
	from, letter := game.LetterFor(user.String(), day)
	v := &LetterView{From: from, Body: letter.Body, Gold: letter.Gold}
	err := tx.QueryRow(ctx, `
		select exists (select 1 from game_letters where user_id = $1 and day = $2::date)`,
		user, day).Scan(&v.Done)
	return v, err
}

// DeliveredLetter is a letter's request done.
type DeliveredLetter struct {
	Gold   int        `json:"gold"`
	Points int        `json:"points"`
	Friend FriendView `json:"friend"`
}

// DeliverLetter brings the writer of today's letter what they asked for, if it
// is in the bag: all of it, or none is taken.
func (s *Store) DeliverLetter(ctx context.Context, user uuid.UUID, npc string) (DeliveredLetter, GameState, error) {
	var res DeliveredLetter
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if !p.lettersOpen() {
			return refuse("no_letter", "nobody has written yet")
		}
		day, _, _ := game.Day(now)
		from, letter := game.LetterFor(user.String(), day)
		if from.ID != npc {
			return refuse("not_the_writer", "today's letter is from someone else")
		}
		f, err := lockFriend(ctx, tx, user, npc)
		if err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `
			insert into game_letters (user_id, day) values ($1, $2::date) on conflict do nothing`, user, day)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return refuse("letter_done", "today's letter is done already")
		}
		tag, err = tx.Exec(ctx, `
			update game_inventory set qty = qty - $3
			where user_id = $1 and item = $2 and qty >= $3`, user, letter.Item, letter.Qty)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			// Not what was asked for, or not enough of it: the letter stays open.
			return refuse("no_item", "that is not what the letter asks for")
		}
		var points int
		if err := tx.QueryRow(ctx, `
			update game_friendship set points = least(1000, points + $3)
			where user_id = $1 and npc = $2 returning points`, user, npc, game.LetterPoints).Scan(&points); err != nil {
			return err
		}
		f.points = points
		res = DeliveredLetter{Gold: letter.Gold, Points: game.LetterPoints, Friend: friendView(from, f, day)}
		p.gold += letter.Gold
		return logEvent(ctx, tx, user, "letter_done", npc, letter.Gold)
	})
	return res, state, err
}

// QuizAnswerKey is the answer to a question waiting for the player, for a
// browser test.
func (s *Store) QuizAnswerKey(ctx context.Context, user uuid.UUID, kind string) (string, error) {
	var out string
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		q, err := pendingQuiz(ctx, tx, user, kind)
		if err != nil {
			return err
		}
		if q == nil {
			return errors.New("no question waiting")
		}
		out = q.Answer
		return nil
	})
	return out, err
}

// LetterKey is what today's letter asks for, for a browser test.
func LetterKey(user uuid.UUID, now time.Time) (npc, item string, qty int) {
	day, _, _ := game.Day(now)
	from, letter := game.LetterFor(user.String(), day)
	return from.ID, letter.Item, letter.Qty
}
