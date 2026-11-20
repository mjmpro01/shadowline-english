-- +goose Up
-- Reminders about the weekly race: a medal won, achievements not yet seen,
-- and on the week's last evening, a top-three place close to won or lost.

alter table notifications_sent drop constraint notifications_sent_kind_check;
alter table notifications_sent add constraint notifications_sent_kind_check
    check (kind in ('goal', 'streak', 'new_episode', 'test', 'rank', 'medal', 'achievement'));

-- On for everyone, like the other kinds: a learner who turned reminders on
-- wants to hear when they won something.
alter table reminder_prefs add column competition boolean not null default true;

-- An achievement told of by push, so it is told of once.
alter table learner_achievements add column notified_at timestamptz;

-- +goose Down
alter table learner_achievements drop column notified_at;
alter table reminder_prefs drop column competition;
delete from notifications_sent where kind in ('rank', 'medal', 'achievement');
alter table notifications_sent drop constraint notifications_sent_kind_check;
alter table notifications_sent add constraint notifications_sent_kind_check
    check (kind in ('goal', 'streak', 'new_episode', 'test'));
