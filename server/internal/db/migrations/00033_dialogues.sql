-- +goose Up
-- Dialogues: short everyday conversations a learner hears, reads along with
-- line by line until they know them, and copies phrases from into their own
-- phrasebook. Written in the console; a few ship with the server.
create table dialogues (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    title       text not null,
    -- The situation, in Vietnamese: where this is and who is talking.
    situation   text not null default '',
    topic       text not null default '',
    level       text not null default 'A2' check (level in ('A1', 'A2', 'B1', 'B2')),
    -- [{speaker: 'A'|'B', name, text, vi}]
    lines       jsonb not null,
    -- [{phrase, note}]: the phrases worth copying down, and why.
    phrases     jsonb not null default '[]',
    published   boolean not null default false,
    position    int not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- How many times a learner has read each line aloud, and the most of it that
-- was heard.
create table dialogue_passes (
    user_id     uuid not null references users (id) on delete cascade,
    dialogue_id uuid not null references dialogues (id) on delete cascade,
    line        int  not null check (line >= 0),
    passes      int  not null default 0 check (passes >= 0),
    best        real not null default 0 check (best between 0 and 1),
    updated_at  timestamptz not null default now(),
    primary key (user_id, dialogue_id, line)
);

-- A learner's phrasebook: two columns, the situation and phrase on one side,
-- the context and how it feels on the other.
create table phrasebook (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users (id) on delete cascade,
    dialogue_id uuid references dialogues (id) on delete set null,
    situation   text not null default '',
    phrase      text not null check (phrase <> ''),
    note        text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index phrasebook_user on phrasebook (user_id, created_at desc);

-- +goose Down
drop table phrasebook;
drop table dialogue_passes;
drop table dialogues;
