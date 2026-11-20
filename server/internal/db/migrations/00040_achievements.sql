-- +goose Up
-- Milestone achievements: a ladder of tiers per track (takes, streak,
-- dictations, …), counted from the tables that already record the learning.
-- A tier reached is kept here for good, with the gold it paid and whether the
-- learner has seen it celebrated.

create table learner_achievements (
    user_id     uuid not null references users (id) on delete cascade,
    id          text not null,
    unlocked_at timestamptz not null default now(),
    seen_at     timestamptz,
    gold        int  not null default 0,
    primary key (user_id, id)
);

-- Learners who were here before achievements were: their first count gives
-- them everything they had already earned without a celebration for each, and
-- takes them off this list. A learner who signs up later is never on it, so
-- their very first take is celebrated.
create table achievement_quiet (
    user_id uuid primary key references users (id) on delete cascade
);
insert into achievement_quiet (user_id) select id from users;

-- +goose Down
drop table achievement_quiet;
drop table learner_achievements;
