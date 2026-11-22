-- +goose Up
-- Word duels against the tower. A fighter has energy for duels, comes back an
-- hour at a time and with practice, and climbs a floor at a time.

alter table fighters
    add column energy    int not null default 5 check (energy >= 0),
    add column energy_at timestamptz not null default now(),
    add column floor     int not null default 1 check (floor >= 1);

create table duels (
    id            bigserial primary key,
    user_id       uuid not null references users (id) on delete cascade,
    floor         int  not null,
    state         text not null default 'active' check (state in ('active', 'won', 'lost', 'fled')),
    -- The fighter as they came in: gear changed mid-duel changes nothing.
    hp            int  not null,
    hp_max        int  not null,
    atk           int  not null,
    def           int  not null,
    answer_time   int  not null,
    rage_stat     int  not null,
    opp_hp        int  not null,
    opp_max       int  not null,
    rage          int  not null default 0,
    combo         int  not null default 0,
    turn          int  not null default 1,
    -- The question being asked; the answer never leaves the server.
    question      jsonb not null,
    q_word        text not null,
    q_answer      text not null,
    q_block       boolean not null default false,
    issued_at     timestamptz not null,
    deadline      timestamptz not null,
    asked         text[] not null default '{}',
    reviewed      text[] not null default '{}',
    right_count   int  not null default 0,
    wrong_count   int  not null default 0,
    coins         int  not null default 0,
    xp            int  not null default 0,
    drop_item     text not null default '',
    level_up      boolean not null default false,
    first_clear   boolean not null default false,
    started_at    timestamptz not null default now(),
    ended_at      timestamptz
);
create unique index duels_one_active_idx on duels (user_id) where state = 'active';
create index duels_user_idx on duels (user_id, id desc);

-- The floors a fighter has beaten, and when first.
create table duel_clears (
    user_id  uuid not null references users (id) on delete cascade,
    floor    int  not null,
    first_at timestamptz not null default now(),
    primary key (user_id, floor)
);

-- +goose Down
drop table duel_clears;
drop table duels;
alter table fighters drop column floor, drop column energy_at, drop column energy;
