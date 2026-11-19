package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Study reminders: the browsers a learner has let us notify, what they want to
// be reminded of and when, and what was sent.

// MaxPushFailures is how many failed sends in a row a subscription survives;
// after that it is left alone until the learner subscribes again.
const MaxPushFailures = 5

// Subscription is one browser a learner has let us notify.
type Subscription struct {
	ID       uuid.UUID
	UserID   uuid.UUID
	Endpoint string
	P256dh   string
	Auth     string
}

// SaveSubscription keeps a browser's subscription. The same browser
// subscribing again, under this account or another, replaces what was there.
func (s *Store) SaveSubscription(ctx context.Context, user uuid.UUID, endpoint, p256dh, auth, userAgent string) error {
	if len(userAgent) > 300 {
		userAgent = userAgent[:300]
	}
	_, err := s.pool.Exec(ctx, `
		insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
		values ($1, $2, $3, $4, $5)
		on conflict (endpoint) do update
		set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
		    user_agent = excluded.user_agent, failures = 0`,
		user, endpoint, p256dh, auth, userAgent)
	return err
}

// DeleteSubscription forgets one of the learner's browsers.
func (s *Store) DeleteSubscription(ctx context.Context, user uuid.UUID, endpoint string) error {
	_, err := s.pool.Exec(ctx, `delete from push_subscriptions where user_id = $1 and endpoint = $2`, user, endpoint)
	return err
}

// Subscriptions is the learner's browsers still worth sending to.
func (s *Store) Subscriptions(ctx context.Context, user uuid.UUID) ([]Subscription, error) {
	rows, err := s.pool.Query(ctx, `
		select id, user_id, endpoint, p256dh, auth from push_subscriptions
		where user_id = $1 and failures < $2 order by created_at`, user, MaxPushFailures)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Subscription, error) {
		var sub Subscription
		err := r.Scan(&sub.ID, &sub.UserID, &sub.Endpoint, &sub.P256dh, &sub.Auth)
		return sub, err
	})
}

// SubscriptionSent records how a send went: delivered, failed, or gone for
// good (the push service no longer knows the browser).
func (s *Store) SubscriptionSent(ctx context.Context, id uuid.UUID, ok, gone bool) error {
	var err error
	switch {
	case gone:
		_, err = s.pool.Exec(ctx, `delete from push_subscriptions where id = $1`, id)
	case ok:
		_, err = s.pool.Exec(ctx, `update push_subscriptions set failures = 0, last_ok_at = now() where id = $1`, id)
	default:
		_, err = s.pool.Exec(ctx, `update push_subscriptions set failures = failures + 1 where id = $1`, id)
	}
	return err
}

// ReminderPrefs is what a learner wants to be reminded of, and when.
type ReminderPrefs struct {
	Enabled bool `json:"enabled"`
	// RemindAt is "HH:MM" in TZ.
	RemindAt        string `json:"remindAt"`
	TZ              string `json:"tz"`
	Locale          string `json:"locale"`
	Streak          bool   `json:"streak"`
	NewEpisodes     bool   `json:"newEpisodes"`
	PromptDismissed bool   `json:"promptDismissed"`
}

// DefaultReminderPrefs is a learner who has not been asked.
var DefaultReminderPrefs = ReminderPrefs{
	RemindAt: "20:00", TZ: "Asia/Ho_Chi_Minh", Locale: "vi", Streak: true, NewEpisodes: true,
}

// ErrBadReminder is a reminder setting that cannot be kept.
var ErrBadReminder = errors.New("bad reminder settings")

// Check says what is wrong with prefs, or nothing.
func (p ReminderPrefs) Check() error {
	if _, err := time.Parse("15:04", p.RemindAt); err != nil {
		return fmt.Errorf("%w: the time is HH:MM", ErrBadReminder)
	}
	if p.Locale != "vi" && p.Locale != "en" {
		return fmt.Errorf("%w: the language is vi or en", ErrBadReminder)
	}
	if _, err := time.LoadLocation(p.TZ); err != nil || p.TZ == "" || p.TZ == "Local" {
		return fmt.Errorf("%w: unknown time zone %q", ErrBadReminder, p.TZ)
	}
	return nil
}

// ReminderPrefs is the learner's settings, or the defaults.
func (s *Store) ReminderPrefs(ctx context.Context, user uuid.UUID) (ReminderPrefs, error) {
	p := DefaultReminderPrefs
	err := s.pool.QueryRow(ctx, `
		select enabled, to_char(remind_at, 'HH24:MI'), tz, locale, streak, new_episodes, prompt_dismissed
		from reminder_prefs where user_id = $1`, user).
		Scan(&p.Enabled, &p.RemindAt, &p.TZ, &p.Locale, &p.Streak, &p.NewEpisodes, &p.PromptDismissed)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultReminderPrefs, nil
	}
	return p, err
}

// SaveReminderPrefs keeps the learner's settings. ErrBadReminder when they
// cannot be kept.
func (s *Store) SaveReminderPrefs(ctx context.Context, user uuid.UUID, p ReminderPrefs) error {
	if err := p.Check(); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		insert into reminder_prefs (user_id, enabled, remind_at, tz, locale, streak, new_episodes)
		values ($1, $2, $3::time, $4, $5, $6, $7)
		on conflict (user_id) do update
		set enabled = excluded.enabled, remind_at = excluded.remind_at, tz = excluded.tz,
		    locale = excluded.locale, streak = excluded.streak, new_episodes = excluded.new_episodes,
		    updated_at = now()`,
		user, p.Enabled, p.RemindAt, p.TZ, p.Locale, p.Streak, p.NewEpisodes)
	return err
}

// DismissReminderPrompt records that the learner said "later" to turning
// reminders on: the dashboard does not ask again.
func (s *Store) DismissReminderPrompt(ctx context.Context, user uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		insert into reminder_prefs (user_id, prompt_dismissed) values ($1, true)
		on conflict (user_id) do update set prompt_dismissed = true, updated_at = now()`, user)
	return err
}

// Subscribed is whether the learner has a browser worth sending to.
func (s *Store) Subscribed(ctx context.Context, user uuid.UUID) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `
		select exists (select 1 from push_subscriptions where user_id = $1 and failures < $2)`,
		user, MaxPushFailures).Scan(&ok)
	return ok, err
}

// RemindableLearners is everyone with reminders on and a browser to send to.
func (s *Store) RemindableLearners(ctx context.Context) ([]uuid.UUID, error) {
	rows, err := s.pool.Query(ctx, `
		select p.user_id from reminder_prefs p
		where p.enabled and exists (
		  select 1 from push_subscriptions s where s.user_id = p.user_id and s.failures < $1
		)`, MaxPushFailures)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
}

// Notification is one reminder, as it is kept and as the browser shows it.
type Notification struct {
	ID    uuid.UUID `json:"id"`
	Kind  string    `json:"kind"`
	Title string    `json:"title"`
	Body  string    `json:"body"`
	URL   string    `json:"url"`
}

// RecordNotification keeps a reminder before it goes out, on the learner's own
// day. False when one of that kind was already sent that day: it is not sent
// twice. A test is always kept.
func (s *Store) RecordNotification(ctx context.Context, user uuid.UUID, day string, n Notification) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		insert into notifications_sent (id, user_id, kind, day, title, body, url)
		values ($1, $2, $3, $4, $5, $6, $7)
		on conflict (user_id, kind, day) where kind <> 'test' do nothing`,
		n.ID, user, n.Kind, day, n.Title, n.Body, n.URL)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// SentOn is what was sent to a learner on their day, by kind, tests left out.
func (s *Store) SentOn(ctx context.Context, user uuid.UUID, day string) (map[string]time.Time, error) {
	rows, err := s.pool.Query(ctx, `
		select kind, sent_at from notifications_sent
		where user_id = $1 and day = $2 and kind <> 'test'`, user, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]time.Time{}
	for rows.Next() {
		var kind string
		var at time.Time
		if err := rows.Scan(&kind, &at); err != nil {
			return nil, err
		}
		out[kind] = at
	}
	return out, rows.Err()
}

// NotificationOpened records that the learner tapped one of their reminders.
func (s *Store) NotificationOpened(ctx context.Context, user, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `
		update notifications_sent set opened_at = coalesce(opened_at, now())
		where id = $1 and user_id = $2`, id, user)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
