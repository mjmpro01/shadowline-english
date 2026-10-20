-- +goose Up
-- The Arena's woods: health, monsters, and fights won with words.
--
-- A fight is turns of single-word questions. The server asks, keeps the answer
-- to itself, and decides each turn; the browser only shows the question and
-- says what was picked.

-- Health, stored like stamina: a value at a moment, worked out forward from it.
alter table game_profiles
    add column hp    int not null default 30 check (hp >= 0),
    add column hp_at timestamptz not null default now();

create table game_battles (
    id          bigserial primary key,
    user_id     uuid not null references users(id) on delete cascade,
    -- Where in the woods, and what lives there (game.Spawns, game.Monsters).
    spawn       text not null,
    monster     text not null,
    monster_hp  int  not null,
    round       int  not null default 1,
    hits_taken  int  not null default 0,
    right_count int  not null default 0,
    wrong_count int  not null default 0,
    -- The question in play, as the browser sees it; its answer and the word it
    -- is about are kept apart and never sent.
    question    jsonb not null,
    q_word      text not null,
    q_answer    text not null,
    issued_at   timestamptz not null,
    deadline    timestamptz not null,
    -- Words asked so far, and the ones whose flashcard schedule this fight has
    -- already moved (once a word, however often it comes up).
    asked       text[] not null default '{}',
    reviewed    text[] not null default '{}',
    state       text not null default 'active' check (state in ('active', 'won', 'lost', 'fled')),
    gold        int  not null default 0,
    drop_item   text not null default '',
    fine        int  not null default 0,
    started_at  timestamptz not null default now(),
    ended_at    timestamptz
);
-- One fight at a time.
create unique index game_battles_active_idx on game_battles (user_id) where state = 'active';

-- Which monsters a player has beaten, and when: each comes back a while later.
create table game_spawns (
    user_id     uuid not null references users(id) on delete cascade,
    spawn       text not null,
    defeated_at timestamptz not null,
    primary key (user_id, spawn)
);

-- +goose Down
drop table game_spawns;
drop table game_battles;
alter table game_profiles drop column hp_at, drop column hp;
