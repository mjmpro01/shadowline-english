-- +goose Up
-- The new Arena: a 1v1 word duel. The farm, the town, the woods and the Word
-- Hall go; what a player had earned there comes along as coins, the one
-- currency now, paid for every point of practice and spent on gear.

create table wallets (
    user_id    uuid primary key references users (id) on delete cascade,
    coins      int  not null default 0 check (coins >= 0),
    updated_at timestamptz not null default now()
);

-- Every coin in and out: what the balance is the sum of.
create table coin_events (
    id      bigserial primary key,
    user_id uuid not null references users (id) on delete cascade,
    kind    text not null,
    item    text not null default '',
    amount  int  not null,
    at      timestamptz not null default now()
);
create index coin_events_user_idx on coin_events (user_id, id desc);

insert into wallets (user_id, coins)
select user_id, gold from game_profiles where gold > 0;
insert into coin_events (user_id, kind, item, amount)
select user_id, 'migrated', 'arena_gold', gold from game_profiles where gold > 0;

-- A learner's fighter: how they look. Everyone starts as a beggar.
create table fighters (
    user_id    uuid primary key references users (id) on delete cascade,
    name       text not null,
    body       text not null check (body in ('a', 'b')),
    skin       int  not null check (skin between 0 and 3),
    hair       int  not null check (hair between 0 and 3),
    level      int  not null default 1,
    xp         int  not null default 0,
    created_at timestamptz not null default now()
);

-- Gear owned, and what is worn in each slot.
create table fighter_gear (
    user_id  uuid not null references users (id) on delete cascade,
    item     text not null,
    owned_at timestamptz not null default now(),
    primary key (user_id, item)
);
create table fighter_equipped (
    user_id uuid not null references users (id) on delete cascade,
    slot    text not null check (slot in ('head', 'body', 'hands', 'weapon', 'feet', 'charm')),
    item    text not null,
    primary key (user_id, slot)
);

drop table game_room_claims;
drop table game_room_words;
drop table game_letters;
drop table game_library_claims;
drop table game_library;
drop table game_notes;
drop table game_quizzes;
drop table game_friendship;
drop table game_spawns;
drop table game_battles;
drop table game_quest_claims;
drop table game_events;
drop table game_inventory;
drop table game_plots;
drop table game_profiles;

-- +goose Down
-- The old Arena's tables are not brought back: its game is gone from the code.
drop table fighter_equipped;
drop table fighter_gear;
drop table fighters;
drop table coin_events;
drop table wallets;
