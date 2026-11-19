-- +goose Up
-- What a learner did each day, so the server can say how today is going, keep
-- a streak worth trusting, and tell an admin who comes back.

-- Every piece of learning, with what it is worth toward the day's goal. The
-- day is Vietnam's, as for the Arena's quests and dictation reviews.
create table learning_events (
    id      bigserial primary key,
    user_id uuid not null references users (id) on delete cascade,
    kind    text not null,
    points  int  not null check (points >= 0),
    at      timestamptz not null default now(),
    day     date not null
);
create index learning_events_user_day_idx on learning_events (user_id, day);
create index learning_events_day_idx on learning_events (day);

-- A day the learner opened the app, whether or not they learned anything: what
-- daily actives and retention are measured in.
create table user_days (
    user_id uuid not null references users (id) on delete cascade,
    day     date not null,
    primary key (user_id, day)
);
create index user_days_day_idx on user_days (day);

-- The learner's daily goal and streak. The streak counts days with any
-- learning in them; a freeze covers a day missed.
create table learner_goals (
    user_id      uuid primary key references users (id) on delete cascade,
    daily_points int  not null default 20 check (daily_points in (10, 20, 40)),
    streak       int  not null default 0 check (streak >= 0),
    best         int  not null default 0 check (best >= 0),
    last_day     date,
    freezes      int  not null default 0 check (freezes between 0 and 2),
    goal_chosen  boolean not null default false
);

-- The goal reached, once a day: its reward is given once.
create table goal_days (
    user_id uuid not null references users (id) on delete cascade,
    day     date not null,
    primary key (user_id, day)
);

-- What was already done counts: takes and dictations from before.
insert into learning_events (user_id, kind, points, at, day)
select user_id, 'take', 2, recorded_at, (recorded_at at time zone 'Asia/Ho_Chi_Minh')::date from takes;
insert into learning_events (user_id, kind, points, at, day)
select user_id, 'dictation', 5, created_at, (created_at at time zone 'Asia/Ho_Chi_Minh')::date from dictations;

insert into user_days (user_id, day)
select distinct user_id, day from learning_events
on conflict do nothing;
insert into user_days (user_id, day)
select id, (last_signed_in_at at time zone 'Asia/Ho_Chi_Minh')::date from users
where last_signed_in_at is not null
on conflict do nothing;
insert into user_days (user_id, day)
select id, (created_at at time zone 'Asia/Ho_Chi_Minh')::date from users
on conflict do nothing;

-- +goose Down
drop table goal_days;
drop table learner_goals;
drop table user_days;
drop table learning_events;
