-- +goose Up
-- Dictations: a passage of an episode listened to, written down a phrase at a
-- time and checked against what was said. How it went is kept, by kind of
-- mistake, and the day it is to be listened to again.
create table dictations (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references users (id) on delete cascade,
    episode_id    uuid not null references clip_sources (id) on delete cascade,
    first_clip_id uuid references clips (id) on delete set null,
    clip_ids      uuid[] not null,
    total         int  not null check (total >= 0),
    "right"       int  not null check ("right" between 0 and total),
    errors        jsonb not null default '{}',
    created_at    timestamptz not null default now(),
    review_on     date not null,
    reviewed_at   timestamptz
);
create index dictations_user_review on dictations (user_id, review_on);

-- +goose Down
drop table dictations;
