-- +goose Up
-- The Arena: a farm the learner tends, where every harvest is a word.
--
-- The server holds all of it and decides every outcome — how long a crop takes,
-- what it yields, what a thing costs — so the game cannot be won from the
-- browser's console, and it is the same game on every device.

-- How common each English word is, from the 12,000-word frequency list the
-- glosser was seeded from: rank 1 is "the". A crop's word is drawn from a band
-- of these, so a cheap seed grows an everyday word and a rare one grows a rare
-- word. Filled by the API on start-up from a file it embeds.
create table word_ranks (
    word text primary key,
    rank int  not null
);
create index word_ranks_rank_idx on word_ranks (rank);

-- One row per player. Stamina is stored as a value at a moment and worked out
-- forward from it, so it refills without anything running in the background.
create table game_profiles (
    user_id      uuid primary key references users(id) on delete cascade,
    gold         int  not null check (gold >= 0),
    stamina      int  not null check (stamina >= 0),
    stamina_at   timestamptz not null default now(),
    slept_at     timestamptz,
    map          text not null default 'farm',
    x            int  not null default 0,
    y            int  not null default 0,
    -- The story: which step of the main quest line the player is on, and when
    -- they reached it. A step counts only what was done after it began.
    main_step    int  not null default 0,
    main_step_at timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

create table game_plots (
    user_id    uuid not null references users(id) on delete cascade,
    idx        int  not null,
    unlocked   boolean not null default false,
    level      int  not null default 0 check (level between 0 and 3),
    crop       text,
    planted_at timestamptz,
    primary key (user_id, idx)
);

create table game_inventory (
    user_id uuid not null references users(id) on delete cascade,
    item    text not null,
    qty     int  not null check (qty >= 0),
    primary key (user_id, item)
);

-- Everything the player did, as it happened. Quest progress is counted from
-- here (and from takes and vocabulary) when it is asked for, rather than kept
-- in counters that every action would have to remember to bump.
create table game_events (
    id      bigserial primary key,
    user_id uuid not null references users(id) on delete cascade,
    kind    text not null,
    -- What it was about: the crop planted, the item bought, the word harvested.
    item    text not null default '',
    -- Gold gained (positive) or spent (negative).
    gold    int  not null default 0,
    at      timestamptz not null default now()
);
create index game_events_user_idx on game_events (user_id, kind, at);

-- Daily rewards already taken, so none is taken twice.
create table game_quest_claims (
    user_id uuid not null references users(id) on delete cascade,
    quest   text not null,
    day     date not null,
    at      timestamptz not null default now(),
    primary key (user_id, quest, day)
);

-- +goose Down
drop table game_quest_claims;
drop table game_events;
drop table game_inventory;
drop table game_plots;
drop table game_profiles;
drop table word_ranks;
