-- +goose Up
-- Duels against shadows: another learner's fighter, played by the machine.
-- A result moves the attacker's rating, and the week's wins make a board of
-- their own with medals, settled like the practice board.

alter table fighters
    add column rating     int not null default 1000 check (rating >= 100),
    add column pvp_wins   int not null default 0,
    add column pvp_losses int not null default 0;

-- What kind of duel, and the opponent as fought: a snapshot, so their gear
-- changing mid-duel changes nothing. Older tower duels have none and are
-- read by their floor.
alter table duels
    add column kind          text not null default 'tower' check (kind in ('tower', 'pvp')),
    add column opponent      jsonb,
    add column opponent_user uuid references users (id) on delete set null,
    add column rating_delta  int not null default 0;
create index duels_pvp_recent_idx on duels (user_id, opponent_user, started_at) where kind = 'pvp';

-- A learner's week in the Arena: wins against shadows, and the points they
-- earned (more for beating someone rated higher).
create table arena_week_points (
    user_id uuid not null references users (id) on delete cascade,
    week    date not null,
    wins    int  not null default 0,
    points  int  not null default 0,
    primary key (user_id, week)
);
create index arena_week_points_week_idx on arena_week_points (week, points desc);

create table arena_awards (
    week    date not null,
    place   int  not null check (place between 1 and 3),
    user_id uuid not null references users (id) on delete cascade,
    points  int  not null,
    coins   int  not null default 0,
    primary key (week, place)
);
create index arena_awards_user_idx on arena_awards (user_id);

create table arena_settled (
    week       date primary key,
    settled_at timestamptz not null default now()
);

-- +goose Down
drop table arena_settled;
drop table arena_awards;
drop table arena_week_points;
drop index duels_pvp_recent_idx;
alter table duels drop column rating_delta, drop column opponent_user, drop column opponent, drop column kind;
alter table fighters drop column pvp_losses, drop column pvp_wins, drop column rating;
