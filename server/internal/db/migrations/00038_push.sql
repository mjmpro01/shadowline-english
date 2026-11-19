-- +goose Up
-- Study reminders by Web Push: the browsers a learner has let us notify, what
-- they want to be reminded of and when, and what was sent.

-- One row per browser that subscribed. The endpoint is the push service's
-- address for that browser; the keys encrypt what is sent to it. A browser
-- that subscribes again under another account moves to that account.
create table push_subscriptions (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    endpoint   text not null unique,
    p256dh     text not null,
    auth       text not null,
    user_agent text not null default '',
    created_at timestamptz not null default now(),
    last_ok_at timestamptz,
    failures   int not null default 0
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

-- What a learner wants: reminders on or off, when, in which time zone and
-- language (the app's language lives in the browser, so it is sent here).
create table reminder_prefs (
    user_id          uuid primary key references users (id) on delete cascade,
    enabled          boolean not null default false,
    remind_at        time not null default '20:00',
    tz               text not null default 'Asia/Ho_Chi_Minh',
    locale           text not null default 'vi' check (locale in ('vi', 'en')),
    streak           boolean not null default true,
    new_episodes     boolean not null default true,
    prompt_dismissed boolean not null default false,
    updated_at       timestamptz not null default now()
);

-- Every notification sent, once per kind and learner's day: the record that
-- stops a second one, and what opened counts are read from.
create table notifications_sent (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null references users (id) on delete cascade,
    kind      text not null check (kind in ('goal', 'streak', 'new_episode', 'test')),
    day       date not null,
    title     text not null,
    body      text not null,
    url       text not null,
    sent_at   timestamptz not null default now(),
    opened_at timestamptz
);
create unique index notifications_sent_once_idx on notifications_sent (user_id, kind, day) where kind <> 'test';
create index notifications_sent_sent_idx on notifications_sent (sent_at);

-- +goose Down
drop table notifications_sent;
drop table reminder_prefs;
drop table push_subscriptions;
