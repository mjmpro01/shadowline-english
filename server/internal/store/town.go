package store

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/shadowline/server/internal/game"
)

// Echo Town: chatting with its people and giving them gifts, once a day each,
// and what they share as a friendship grows. The day's chat is worked out
// again from (player, day, person) on every request, so the right reply is
// never written down nor sent to the browser.

func (p profileRow) townOpen() bool { return p.reached(game.TownStep) }

// FriendView is how well the player knows someone, as the town draws it.
type FriendView struct {
	ID          string    `json:"id"`
	Name        game.Text `json:"name"`
	Role        game.Text `json:"role"`
	Points      int       `json:"points"`
	Hearts      int       `json:"hearts"`
	TalkedToday bool      `json:"talkedToday"`
	GiftedToday bool      `json:"giftedToday"`
	// Event is a heart event reached and not yet opened, if any.
	Event *game.HeartEvent `json:"event"`
}

// ChatView is the day's chat with someone, without which reply is right.
type ChatView struct {
	NPC     string      `json:"npc"`
	Line    game.Text   `json:"line"`
	Replies []game.Text `json:"replies"`
	// Talked: today's chat is had already.
	Talked bool `json:"talked"`
	// GiftWords are the day's three ways of handing over a gift.
	GiftWords []game.Text `json:"giftWords"`
}

// TalkResult is what a reply did.
type TalkResult struct {
	Right bool `json:"right"`
	// Why the reply picked was right or not, and the one that was.
	Why    game.Text  `json:"why"`
	Answer game.Text  `json:"answer"`
	Points int        `json:"points"`
	Friend FriendView `json:"friend"`
}

// GiftResult is how a gift was taken.
type GiftResult struct {
	Taste      string     `json:"taste"`
	RightWords bool       `json:"rightWords"`
	Why        game.Text  `json:"why"`
	Points     int        `json:"points"`
	Friend     FriendView `json:"friend"`
}

type friendRow struct {
	points     int
	talkedOn   *time.Time
	giftedOn   *time.Time
	heartClaim []int32
}

func sameDay(d *time.Time, day string) bool {
	return d != nil && d.Format("2006-01-02") == day
}

// friends is every townsperson as the player knows them.
func friends(ctx context.Context, tx pgx.Tx, user uuid.UUID, now time.Time) ([]FriendView, error) {
	rows, err := tx.Query(ctx, `
		select npc, points, talked_on, gifted_on, heart_claims from game_friendship where user_id = $1`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	known := map[string]friendRow{}
	for rows.Next() {
		var npc string
		var f friendRow
		if err := rows.Scan(&npc, &f.points, &f.talkedOn, &f.giftedOn, &f.heartClaim); err != nil {
			return nil, err
		}
		known[npc] = f
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	day, _, _ := game.Day(now)
	out := make([]FriendView, 0, len(game.Townsfolk))
	for _, t := range game.Townsfolk {
		out = append(out, friendView(t, known[t.ID], day))
	}
	return out, nil
}

func friendView(t game.Townsperson, f friendRow, day string) FriendView {
	v := FriendView{
		ID: t.ID, Name: t.Name, Role: t.Role, Points: f.points, Hearts: game.Hearts(f.points),
		TalkedToday: sameDay(f.talkedOn, day), GiftedToday: sameDay(f.giftedOn, day),
	}
	for _, ev := range t.Events {
		if v.Hearts >= ev.Hearts && !slices.Contains(f.heartClaim, int32(ev.Hearts)) {
			ev := ev
			v.Event = &ev
			break
		}
	}
	return v
}

// lockFriend is a friendship, made at nothing if new, locked for a change.
func lockFriend(ctx context.Context, tx pgx.Tx, user uuid.UUID, npc string) (friendRow, error) {
	if _, err := tx.Exec(ctx, `
		insert into game_friendship (user_id, npc) values ($1, $2) on conflict do nothing`, user, npc); err != nil {
		return friendRow{}, err
	}
	var f friendRow
	err := tx.QueryRow(ctx, `
		select points, talked_on, gifted_on, heart_claims from game_friendship
		where user_id = $1 and npc = $2 for update`, user, npc).Scan(&f.points, &f.talkedOn, &f.giftedOn, &f.heartClaim)
	return f, err
}

// townsperson is someone in town the player can reach: the town must be open.
func townsperson(p profileRow, npc string) (game.Townsperson, error) {
	if !p.townOpen() {
		return game.Townsperson{}, refuse("town_locked", "the town is not open yet")
	}
	t, ok := game.TownspersonByID(npc)
	if !ok {
		return game.Townsperson{}, badMove("no_npc", "nobody by that name lives here")
	}
	return t, nil
}

func texts(replies [3]game.Reply) []game.Text {
	out := make([]game.Text, len(replies))
	for i, r := range replies {
		out[i] = r.Text
	}
	return out
}

// TalkExchange is the day's chat with someone, to show before they reply.
func (s *Store) TalkExchange(ctx context.Context, user uuid.UUID, npc string) (ChatView, error) {
	var out ChatView
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		p, now, err := lockGame(ctx, tx, user)
		if err != nil {
			return err
		}
		t, err := townsperson(p, npc)
		if err != nil {
			return err
		}
		day, _, _ := game.Day(now)
		chat := game.ChatFor(user.String(), day, t)
		var talked bool
		err = tx.QueryRow(ctx, `
			select coalesce((select talked_on = $3::date from game_friendship where user_id = $1 and npc = $2), false)`,
			user, npc, day).Scan(&talked)
		if err != nil {
			return err
		}
		out = ChatView{
			NPC: npc, Line: chat.Exchange.Line, Replies: texts(chat.Shown()), Talked: talked,
			GiftWords: texts(game.GiftWordsFor(user.String(), day, t)),
		}
		return nil
	})
	return out, err
}

// Talk is the player's reply to the day's chat: friendship for it, more for
// the right one, and why either way.
func (s *Store) Talk(ctx context.Context, user uuid.UUID, npc string, reply int) (TalkResult, GameState, error) {
	var res TalkResult
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		t, err := townsperson(*p, npc)
		if err != nil {
			return err
		}
		if reply < 0 || reply > 2 {
			return badMove("no_reply", "pick one of the three replies")
		}
		f, err := lockFriend(ctx, tx, user, npc)
		if err != nil {
			return err
		}
		day, _, _ := game.Day(now)
		if sameDay(f.talkedOn, day) {
			return refuse("talked_today", "you have talked today already")
		}
		shown := game.ChatFor(user.String(), day, t).Shown()
		picked := shown[reply]
		res.Right, res.Why = picked.Right, picked.Why
		for _, r := range shown {
			if r.Right {
				res.Answer = r.Text
			}
		}
		res.Points = game.TalkWrong
		if picked.Right {
			res.Points = game.TalkRight
		}
		var points int
		var talkedOn *time.Time
		if err := tx.QueryRow(ctx, `
			update game_friendship set points = least(1000, points + $3), talked_on = $4::date
			where user_id = $1 and npc = $2
			returning points, talked_on`, user, npc, res.Points, day).Scan(&points, &talkedOn); err != nil {
			return err
		}
		f.points, f.talkedOn = points, talkedOn
		res.Friend = friendView(t, f, day)
		return logEvent(ctx, tx, user, "talk", npc, 0)
	})
	return res, state, err
}

// Gift hands someone something from the bag, with one of the day's three ways
// of saying so.
func (s *Store) Gift(ctx context.Context, user uuid.UUID, npc, item string, words int) (GiftResult, GameState, error) {
	var res GiftResult
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		t, err := townsperson(*p, npc)
		if err != nil {
			return err
		}
		if it, ok := game.ItemByID(item); !ok || it.Kind != "gift" {
			return badMove("not_gift", "that is not something to give")
		}
		if words < 0 || words > 2 {
			return badMove("no_reply", "pick one of the three ways to say it")
		}
		f, err := lockFriend(ctx, tx, user, npc)
		if err != nil {
			return err
		}
		day, _, _ := game.Day(now)
		if sameDay(f.giftedOn, day) {
			return refuse("gifted_today", "you have given them something today already")
		}
		had, err := takeItem(ctx, tx, user, item)
		if err != nil {
			return err
		}
		if !had {
			return refuse("no_item", "none left")
		}
		said := game.GiftWordsFor(user.String(), day, t)[words]
		res.Taste, res.RightWords, res.Why = game.Taste(t, item), said.Right, said.Why
		res.Points = game.GiftPoints(res.Taste, said.Right)
		var points int
		var giftedOn *time.Time
		if err := tx.QueryRow(ctx, `
			update game_friendship set points = greatest(0, least(1000, points + $3)), gifted_on = $4::date
			where user_id = $1 and npc = $2
			returning points, gifted_on`, user, npc, res.Points, day).Scan(&points, &giftedOn); err != nil {
			return err
		}
		f.points, f.giftedOn = points, giftedOn
		res.Friend = friendView(t, f, day)
		if err := logEvent(ctx, tx, user, "gift", npc, 0); err != nil {
			return err
		}
		if res.Taste == "loved" {
			return logEvent(ctx, tx, user, "gift_loved", npc, 0)
		}
		return nil
	})
	return res, state, err
}

// ClaimHeart opens a heart event reached with someone: their story, and a
// present, once.
func (s *Store) ClaimHeart(ctx context.Context, user uuid.UUID, npc string, hearts int) (game.HeartEvent, GameState, error) {
	var ev game.HeartEvent
	state, err := s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		t, err := townsperson(*p, npc)
		if err != nil {
			return err
		}
		i := slices.IndexFunc(t.Events, func(e game.HeartEvent) bool { return e.Hearts == hearts })
		if i < 0 {
			return badMove("no_event", "nothing to share at that many hearts")
		}
		f, err := lockFriend(ctx, tx, user, npc)
		if err != nil {
			return err
		}
		if game.Hearts(f.points) < hearts {
			return refuse("not_done", "not close enough friends yet")
		}
		if slices.Contains(f.heartClaim, int32(hearts)) {
			return refuse("claimed", "already shared")
		}
		if _, err := tx.Exec(ctx, `
			update game_friendship set heart_claims = array_append(heart_claims, $3)
			where user_id = $1 and npc = $2`, user, npc, hearts); err != nil {
			return err
		}
		ev = t.Events[i]
		return applyReward(ctx, tx, user, p, now, ev.Reward)
	})
	return ev, state, err
}

// Clinic is Dr. Vy making the player well again, for a little gold.
func (s *Store) Clinic(ctx context.Context, user uuid.UUID) (GameState, error) {
	return s.gameAction(ctx, user, func(tx pgx.Tx, p *profileRow, now time.Time) error {
		if !p.townOpen() {
			return refuse("town_locked", "the town is not open yet")
		}
		if hp, _ := game.HP(p.hp, p.hpAt, now); hp >= game.HPMax {
			return refuse("full", "already well")
		}
		if err := spendGold(p, game.ClinicCost); err != nil {
			return err
		}
		p.hp, p.hpAt = game.HPMax, now
		return logEvent(ctx, tx, user, "clinic", "", -game.ClinicCost)
	})
}

// TalkAnswerKey is which of today's replies is right, for a browser test.
func (s *Store) TalkAnswerKey(ctx context.Context, user uuid.UUID, npc string) (int, error) {
	t, ok := game.TownspersonByID(npc)
	if !ok {
		return 0, errors.New("no such townsperson")
	}
	day, _, _ := game.Day(time.Now())
	for i, r := range game.ChatFor(user.String(), day, t).Shown() {
		if r.Right {
			return i, nil
		}
	}
	return 0, errors.New("no right reply")
}
