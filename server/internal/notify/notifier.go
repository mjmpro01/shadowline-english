package notify

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/shadowline/server/internal/store"
)

// Service is the name the notifier beats under, for the console's System page.
const Service = "notifier"

// Tick is how often the notifier looks.
const Tick = time.Minute

// AchievementWait is how long an achievement waits for the app's own
// celebration before it is told of by push.
const AchievementWait = 10 * time.Minute

// NewSince is how recent a followed series' episode has to be for the evening
// reminder: since the last one.
const NewSince = 24 * time.Hour

// Notifier decides who to remind of what, and sends it.
type Notifier struct {
	Store *store.Store
	// Send is nil when push is not configured: nothing is sent.
	Send SendFunc
	Now  func() time.Time
	Log  *slog.Logger
}

func (n *Notifier) now() time.Time {
	if n.Now != nil {
		return n.Now()
	}
	return time.Now()
}

// RunOnce looks at every learner with reminders on, and sends each what is due.
func (n *Notifier) RunOnce(ctx context.Context) error {
	if n.Send == nil {
		return nil
	}
	// Weeks are settled here as well as when the board is read, so a medal
	// is given out, and told of, on Monday morning even if nobody looks.
	if err := n.Store.SettleWeeks(ctx, n.now()); err != nil {
		n.Log.Warn("cannot settle the weekly leaderboard", "error", err)
	}
	if err := n.Store.SettleArenaWeeks(ctx, n.now()); err != nil {
		n.Log.Warn("cannot settle the arena board", "error", err)
	}
	learners, err := n.Store.RemindableLearners(ctx)
	if err != nil {
		return err
	}
	for _, user := range learners {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := n.consider(ctx, user); err != nil {
			n.Log.Warn("cannot remind a learner", "user", user, "error", err)
		}
	}
	return nil
}

// location is the learner's time zone, Vietnam's when theirs cannot be found.
func location(tz string) *time.Location {
	if loc, err := time.LoadLocation(tz); err == nil {
		return loc
	}
	return time.FixedZone("ICT", 7*60*60)
}

func minutes(hhmm string) int {
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return 20 * 60
	}
	return t.Hour()*60 + t.Minute()
}

func (n *Notifier) consider(ctx context.Context, user uuid.UUID) error {
	now := n.now()
	prefs, err := n.Store.ReminderPrefs(ctx, user)
	if err != nil {
		return err
	}
	local := now.In(location(prefs.TZ))
	day := local.Format("2006-01-02")

	sent, err := n.Store.SentOn(ctx, user, day)
	if err != nil {
		return err
	}
	in := Input{
		Local: local, RemindAt: minutes(prefs.RemindAt),
		StreakOn: prefs.Streak, NewEpisodesOn: prefs.NewEpisodes,
		Sent: map[Kind]time.Time{},
	}
	for kind, at := range sent {
		in.Sent[Kind(kind)] = at.In(local.Location())
	}
	// Cheap enough to work out before asking whether anything is due: a few
	// queries for each learner with reminders on, once a minute.
	today, err := n.Store.Today(ctx, user, now)
	if err != nil {
		return err
	}
	in.Reached = today.Reached
	in.StreakCount = today.Streak.Count
	in.LearnedToday = today.Streak.Today

	var fresh []store.NewEpisode
	if prefs.NewEpisodes {
		all, err := n.Store.NewFor(ctx, user, now)
		if err != nil {
			return err
		}
		for _, e := range all.Episodes {
			if e.Followed && now.Sub(e.PublishedAt) < NewSince {
				fresh = append(fresh, e)
			}
		}
		in.NewEpisodes = len(fresh)
	}

	var race *store.Race
	var medalGold int
	var untold []store.UnlockedAchievement
	if prefs.Competition {
		in.CompetitionOn = true
		_, end := store.WeekOf(now)
		in.WeekEndsToday = end.Sub(now) <= 24*time.Hour
		if in.WeekEndsToday {
			if race, err = n.Store.WeeklyRace(ctx, user, now); err != nil {
				return err
			}
			in.Racing = race != nil
		}
		if in.Medal, medalGold, err = n.Store.LastWeekPlace(ctx, user, now); err != nil {
			return err
		}
		if in.Medal > 0 {
			start, _ := store.WeekOf(now)
			if in.MedalSent, err = n.Store.SentSince(ctx, user, string(Medal), start.AddDate(0, 0, -1).Format("2006-01-02")); err != nil {
				return err
			}
		}
		if untold, err = n.Store.UnnotifiedAchievements(ctx, user, now, AchievementWait); err != nil {
			return err
		}
		in.Achievements = len(untold)
	}

	kind, due := Next(in)
	if !due {
		return nil
	}
	facts := Facts{
		PointsLeft: max(0, today.Goal-today.Points), Streak: today.Streak.Count,
		Episodes: len(fresh), RemindAt: prefs.RemindAt,
	}
	url := "/dashboard"
	switch kind {
	case Streak:
		if today.NextClip != nil {
			url = "/library/" + today.NextClip.ID.String() + "/practice"
		}
	case Rank:
		facts.Rank, facts.Gap = race.Rank, race.Gap
	case Medal:
		facts.Place, facts.Gold = in.Medal, medalGold
		url = "/profile"
	case Achievement:
		facts.AchTrack, facts.AchTarget, facts.AchCount = untold[0].Track, untold[0].Target, len(untold)
		url = "/achievements"
	case NewEpisode:
		series := map[string]bool{}
		for _, e := range fresh {
			series[e.PlaylistTitle] = true
		}
		facts.Series, facts.SeriesCount = fresh[0].PlaylistTitle, len(series)
		if len(fresh) == 1 {
			url = "/library/e/" + fresh[0].ID.String()
		}
	}
	if _, err = n.send(ctx, user, kind, prefs.Locale, day, facts, url); err != nil {
		return err
	}
	if kind == Achievement {
		ids := make([]string, len(untold))
		for i, a := range untold {
			ids[i] = a.ID
		}
		return n.Store.MarkAchievementsNotified(ctx, user, ids, now)
	}
	return nil
}

// SendTest sends a learner a reminder now, so they can see what one looks
// like. It answers how many of their browsers took it.
func (n *Notifier) SendTest(ctx context.Context, user uuid.UUID) (int, error) {
	if n.Send == nil {
		return 0, ErrOff
	}
	prefs, err := n.Store.ReminderPrefs(ctx, user)
	if err != nil {
		return 0, err
	}
	day := n.now().In(location(prefs.TZ)).Format("2006-01-02")
	return n.send(ctx, user, Test, prefs.Locale, day, Facts{RemindAt: prefs.RemindAt}, "/dashboard")
}

// ErrOff is push not configured on this server.
var ErrOff = errors.New("push is not configured")

// send records a reminder, then delivers it to each of the learner's browsers.
// Recorded first: if it cannot be recorded, it was already sent today.
func (n *Notifier) send(ctx context.Context, user uuid.UUID, kind Kind, locale, day string, facts Facts, url string) (int, error) {
	id := uuid.New()
	title, body := Words(kind, locale, facts)
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	note := store.Notification{
		ID: id, Kind: string(kind), Title: title, Body: body,
		URL: url + sep + "from=push&n=" + id.String(),
	}
	recorded, err := n.Store.RecordNotification(ctx, user, day, note)
	if err != nil || !recorded {
		return 0, err
	}
	payload, err := json.Marshal(note)
	if err != nil {
		return 0, err
	}
	subs, err := n.Store.Subscriptions(ctx, user)
	if err != nil {
		return 0, err
	}
	delivered := 0
	for _, sub := range subs {
		status, err := n.Send(ctx, sub, payload)
		gone := status == http.StatusNotFound || status == http.StatusGone
		ok := err == nil && status >= 200 && status < 300
		if ok {
			delivered++
		}
		if !ok && !gone {
			n.Log.Warn("a reminder was not delivered", "user", user, "kind", kind, "status", status, "error", err)
		}
		if err := n.Store.SubscriptionSent(ctx, sub.ID, ok, gone); err != nil {
			n.Log.Warn("cannot record a reminder's delivery", "user", user, "error", err)
		}
	}
	n.Log.Info("reminder sent", "user", user, "kind", kind, "browsers", delivered)
	return delivered, nil
}

// Run reminds every Tick until the context ends, beating for the console.
func (n *Notifier) Run(ctx context.Context, beat func(busy bool)) {
	for {
		beat(true)
		if err := n.RunOnce(ctx); err != nil && ctx.Err() == nil {
			n.Log.Warn("reminder pass failed", "error", err)
		}
		beat(false)
		select {
		case <-ctx.Done():
			return
		case <-time.After(Tick):
		}
	}
}
