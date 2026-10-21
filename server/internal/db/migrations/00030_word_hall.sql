-- +goose Up
-- The rest of Echo Town: the Lexi's notes on the Word Hall's door, Lina's
-- library of words, and the letters the townsfolk send.
--
-- game_quizzes holds a question the player has been asked and not answered —
-- a note, or what a word given to the library means — with its answer, which
-- stays here and is never sent to the browser. One of each kind at a time.
create table game_quizzes (
    user_id    uuid not null references users (id) on delete cascade,
    kind       text not null check (kind in ('note', 'donate')),
    question   jsonb not null,
    created_at timestamptz not null default now(),
    primary key (user_id, kind)
);

-- How many of the day's notes have been read.
create table game_notes (
    user_id uuid not null references users (id) on delete cascade,
    day     date not null,
    read    int  not null default 0,
    primary key (user_id, day)
);

-- Words given to the library (donated_at), and words whose meaning was missed
-- on a day (tried_on): those wait for another day.
create table game_library (
    user_id    uuid not null references users (id) on delete cascade,
    word       text not null,
    donated_at timestamptz,
    tried_on   date,
    primary key (user_id, word)
);

-- The library's milestones already thanked for.
create table game_library_claims (
    user_id   uuid not null references users (id) on delete cascade,
    milestone int  not null,
    primary key (user_id, milestone)
);

-- The days whose letter has been done. The letter itself is worked out again
-- from (player, day), so only that it was done is kept.
create table game_letters (
    user_id uuid not null references users (id) on delete cascade,
    day     date not null,
    done_at timestamptz not null default now(),
    primary key (user_id, day)
);

-- +goose Down
drop table game_letters;
drop table game_library_claims;
drop table game_library;
drop table game_notes;
drop table game_quizzes;
