-- +goose Up
-- The weekly leaderboard's medals. A week runs Monday to Sunday on Vietnam's
-- clock and is ranked by practice points (learning_events); when it is over
-- the top three keep a medal for good.

create table weekly_awards (
    week       date not null,
    place      int  not null check (place between 1 and 3),
    user_id    uuid not null references users (id) on delete cascade,
    points     int  not null,
    gold       int  not null default 0,
    created_at timestamptz not null default now(),
    primary key (week, place)
);
create index weekly_awards_user_idx on weekly_awards (user_id);

-- A week whose medals have been given out — with or without anybody to give
-- them to — so it is never given out twice.
create table weekly_settled (
    week       date primary key,
    settled_at timestamptz not null default now()
);

-- +goose Down
drop table weekly_settled;
drop table weekly_awards;
