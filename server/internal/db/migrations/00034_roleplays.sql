-- +goose Up
-- Role-play with the tutor: a job interview, a talk to give, or one side of a
-- dialogue, played out a turn at a time. Each thing the learner says comes
-- back corrected when it could be said better, and the session ends in
-- feedback on the whole of it. Kept, to be read again.
create table roleplays (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users (id) on delete cascade,
    scenario    text not null check (scenario in ('interview', 'presentation', 'dialogue')),
    -- The dialogue played, for scenario 'dialogue'. Kept when the dialogue
    -- goes: the session still happened, under its title.
    dialogue_id uuid references dialogues (id) on delete set null,
    -- What the list calls it: the scenario's name or the dialogue's title.
    title       text not null,
    -- The job applied for, or what the talk is about; the learner's choice.
    topic       text not null default '',
    -- In a dialogue, the side the learner plays, 'A' or 'B'; the tutor plays
    -- the other.
    own_side    text not null default '' check (own_side in ('', 'A', 'B')),
    -- {summary, strengths, fixes, phrases}, once the learner ends it.
    feedback    jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    ended_at    timestamptz
);
create index roleplays_user on roleplays (user_id, updated_at desc);

create table roleplay_turns (
    id          bigserial primary key,
    roleplay_id uuid not null references roleplays (id) on delete cascade,
    role        text not null check (role in ('user', 'assistant')),
    content     text not null,
    -- On the learner's turns: how it would sound more natural, and why, in
    -- Vietnamese. Empty when it was fine as it was.
    better      text not null default '',
    why         text not null default '',
    created_at  timestamptz not null default now()
);
create index roleplay_turns_roleplay on roleplay_turns (roleplay_id, id);

-- +goose Down
drop table roleplay_turns;
drop table roleplays;
