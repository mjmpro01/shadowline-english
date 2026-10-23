package store

import (
	"context"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// The Word Hall's rooms, chapter 4: each wants its words back, a bundle of
// four at a time. An empty place shows only what its word means; the word is
// sent once it is back, so the list itself never gives an answer away.

func (p profileRow) roomsOpen() bool { return p.reached(game.RoomsStep) }

func roomsClosed(p profileRow) error {
	if !p.roomsOpen() {
		return refuse("rooms_closed", "the Word Hall's rooms are not open yet")
	}
	return nil
}

// RoomWordView is one place in a bundle.
type RoomWordView struct {
	// Vi is what the word means: all an empty place shows.
	Vi         string `json:"vi"`
	Filled     bool   `json:"filled"`
	TriedToday bool   `json:"triedToday"`
	// Key names the place when asking for it, without saying the word: its
	// bundle and its position there.
	Key  string `json:"key"`
	Word string `json:"word,omitempty"`
	IPA  string `json:"ipa,omitempty"`
}

// BundleView is a bundle and how far along it is.
type BundleView struct {
	game.Bundle
	Words   []RoomWordView `json:"words"`
	Full    bool           `json:"full"`
	Claimed bool           `json:"claimed"`
}

// RoomView is a room, its bundles, and whether its Lexi is awake.
type RoomView struct {
	game.Room
	Bundles  []BundleView `json:"bundles"`
	Restored bool         `json:"restored"`
}

// RoomsView is the hall inside: the rooms open so far, and how many there
// are in all.
type RoomsView struct {
	Rooms []RoomView `json:"rooms"`
	Total int        `json:"total"`
}

func placeKey(bundle string, i int) string { return bundle + ":" + string(rune('0'+i)) }

// wordAt is the word a place names.
func wordAt(key string) (game.Room, game.Bundle, game.RoomWord, bool) {
	id, n, ok := strings.Cut(key, ":")
	if !ok || len(n) != 1 {
		return game.Room{}, game.Bundle{}, game.RoomWord{}, false
	}
	room, b, found := game.BundleByID(id)
	i := int(n[0] - '0')
	if !found || i < 0 || i >= len(b.Words) {
		return game.Room{}, game.Bundle{}, game.RoomWord{}, false
	}
	return room, b, b.Words[i], true
}

func roomsView(ctx context.Context, tx pgx.Tx, user uuid.UUID, day string) (RoomsView, error) {
	out := RoomsView{Rooms: []RoomView{}, Total: game.RoomCount}
	filled := map[string]bool{}
	tried := map[string]bool{}
	rows, err := tx.Query(ctx, `
		select word, filled_at is not null, coalesce(tried_on = $2::date, false)
		from game_room_words where user_id = $1`, user, day)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var w string
		var f, t bool
		if err := rows.Scan(&w, &f, &t); err != nil {
			rows.Close()
			return out, err
		}
		filled[w], tried[w] = f, t && !f
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}
	claims, err := roomClaims(ctx, tx, user)
	if err != nil {
		return out, err
	}
	for _, r := range game.Rooms {
		rv := RoomView{Room: r, Restored: claims["room:"+r.ID]}
		for _, b := range r.Bundles {
			bv := BundleView{Bundle: b, Full: true, Claimed: claims["bundle:"+b.ID]}
			for i, w := range b.Words {
				v := RoomWordView{Vi: w.Vi, Filled: filled[w.Word], TriedToday: tried[w.Word], Key: placeKey(b.ID, i)}
				if v.Filled {
					v.Word, v.IPA = w.Word, w.IPA
				} else {
					bv.Full = false
				}
				bv.Words = append(bv.Words, v)
			}
			rv.Bundles = append(rv.Bundles, bv)
		}
		out.Rooms = append(out.Rooms, rv)
	}
	return out, nil
}

func roomClaims(ctx context.Context, tx pgx.Tx, user uuid.UUID) (map[string]bool, error) {
	rows, err := tx.Query(ctx, `select claim from game_room_claims where user_id = $1`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out[c] = true
	}
	return out, rows.Err()
}

// roomsRestored is how many rooms have their Lexi awake.
func roomsRestored(ctx context.Context, tx pgx.Tx, user uuid.UUID) (int, error) {
	var n int
	err := tx.QueryRow(ctx, `
		select count(*)::int from game_room_claims where user_id = $1 and claim like 'room:%'`, user).Scan(&n)
	return n, err
}

// Rooms is the hall inside, as the player has filled it.
func (s *Store) Rooms(ctx context.Context, user uuid.UUID) (RoomsView, error) {
	var out RoomsView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		if err := roomsClosed(p); err != nil {
			return err
		}
		day, _, _ := game.Day(now)
		out, err = roomsView(ctx, tx, user, day)
		return err
	})
	return out, err
}

// AskRoomWord is the room asking for the word of one of its places.
func (s *Store) AskRoomWord(ctx context.Context, user uuid.UUID, key string) (QuizView, error) {
	var out QuizView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		if err := roomsClosed(p); err != nil {
			return err
		}
		room, _, w, ok := wordAt(key)
		if !ok {
			return badMove("no_place", "there is no such place in the hall")
		}
		day, _, _ := game.Day(now)
		var filled, tried bool
		err = tx.QueryRow(ctx, `
			select coalesce(bool_or(filled_at is not null), false), coalesce(bool_or(tried_on = $3::date), false)
			from game_room_words where user_id = $1 and word = $2`, user, w.Word, day).Scan(&filled, &tried)
		if err != nil {
			return err
		}
		if filled {
			return refuse("already_filled", "that word is back already")
		}
		if tried {
			return refuse("tried_today", "that word waits for tomorrow")
		}
		target := game.Entry{Word: w.Word, IPA: w.IPA, Meaning: w.Vi}
		r := rand.New(rand.NewSource(now.UnixNano()))
		q, ok := game.NewQuestion(game.RoomGame(user.String(), w.Word), target, game.RoomEntries(room), r)
		if !ok {
			q, _ = game.NewQuestion(game.GameListen, target, game.RoomEntries(room), r)
		}
		made := newQuiz(q, target)
		if err := saveQuiz(ctx, tx, user, "room", made); err != nil {
			return err
		}
		out = *made.view()
		// A word heard has to be said by the browser.
		out.Say = q.Say
		return nil
	})
	return out, err
}

// AnswerRoomWord is the player's answer for a place: right, and the word is
// back in its room and in the player's vocabulary; wrong, and it waits for
// tomorrow.
func (s *Store) AnswerRoomWord(ctx context.Context, user uuid.UUID, answer string) (QuizAnswer, GameState, error) {
	var res QuizAnswer
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if err := roomsClosed(*p); err != nil {
			return err
		}
		asked, err := pendingQuiz(ctx, tx, user, "room")
		if err != nil {
			return err
		}
		if asked == nil {
			return refuse("no_question", "no room has asked for a word")
		}
		if err := dropQuiz(ctx, tx, user, "room"); err != nil {
			return err
		}
		res = asked.answered(answer)
		room, _, _, _ := game.WordInRooms(asked.Word)
		day, _, _ := game.Day(now)
		if !res.Right {
			_, err := tx.Exec(ctx, `
				insert into game_room_words (user_id, word, room, tried_on) values ($1, $2, $3, $4::date)
				on conflict (user_id, word) do update set tried_on = excluded.tried_on`, user, asked.Word, room.ID, day)
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into game_room_words (user_id, word, room, filled_at) values ($1, $2, $3, $4)
			on conflict (user_id, word) do update set filled_at = excluded.filled_at`, user, asked.Word, room.ID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into vocab_words (user_id, word, ipa, meaning) values ($1, $2, $3, $4)
			on conflict (user_id, word) do nothing`, user, asked.Word, asked.IPA, asked.Meaning); err != nil {
			return err
		}
		return logEvent(ctx, tx, user, "room_word", room.ID, 0)
	})
	return res, state, err
}

// ClaimedBundle is what collecting for a bundle gave, and whether it woke
// its room.
type ClaimedBundle struct {
	Reward   game.Reward `json:"reward"`
	Restored string      `json:"restored,omitempty"`
}

// ClaimBundle collects for a full bundle, once; the last bundle of a room
// also brings the room's own reward, and wakes its Lexi.
func (s *Store) ClaimBundle(ctx context.Context, user uuid.UUID, bundle string) (ClaimedBundle, GameState, error) {
	var out ClaimedBundle
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if err := roomsClosed(*p); err != nil {
			return err
		}
		room, b, ok := game.BundleByID(bundle)
		if !ok {
			return badMove("no_bundle", "there is no such bundle")
		}
		words := make([]string, len(b.Words))
		for i, w := range b.Words {
			words[i] = w.Word
		}
		var n int
		if err := tx.QueryRow(ctx, `
			select count(*)::int from game_room_words where user_id = $1 and word = any($2) and filled_at is not null`,
			user, words).Scan(&n); err != nil {
			return err
		}
		if n < len(words) {
			return refuse("bundle_incomplete", "the bundle still has empty places")
		}
		tag, err := tx.Exec(ctx, `
			insert into game_room_claims (user_id, claim) values ($1, $2) on conflict do nothing`, user, "bundle:"+b.ID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return refuse("claimed", "that bundle is collected already")
		}
		out.Reward = b.Reward
		claims, err := roomClaims(ctx, tx, user)
		if err != nil {
			return err
		}
		all := true
		for _, other := range room.Bundles {
			all = all && claims["bundle:"+other.ID]
		}
		if all {
			if _, err := tx.Exec(ctx, `
				insert into game_room_claims (user_id, claim) values ($1, $2) on conflict do nothing`, user, "room:"+room.ID); err != nil {
				return err
			}
			out.Reward = addRewards(out.Reward, room.Reward)
			out.Restored = room.ID
			if err := logEvent(ctx, tx, user, "room_done", room.ID, 0); err != nil {
				return err
			}
		}
		return applyReward(ctx, tx, user, p, now, out.Reward)
	})
	return out, state, err
}
