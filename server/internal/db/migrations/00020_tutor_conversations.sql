-- +goose Up
-- The learner's conversations with the tutor, so they can be read again and
-- carried on from another device. The history the model is sent is read from
-- here, not taken from the browser: what the tutor "said before" is what it
-- said.
create table tutor_conversations (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users (id) on delete cascade,
    -- The clip on screen when it started, for the list. Not a constraint on
    -- what the tutor is told: that is whatever is on screen at each question.
    clip_id     uuid references clips (id) on delete set null,
    -- The first question, cut short: what the list shows.
    title       text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index tutor_conversations_user_idx on tutor_conversations (user_id, updated_at desc);

create table tutor_messages (
    id               bigserial primary key,
    conversation_id  uuid not null references tutor_conversations (id) on delete cascade,
    role             text not null check (role in ('user', 'assistant')),
    content          text not null,
    created_at       timestamptz not null default now()
);
create index tutor_messages_conversation_idx on tutor_messages (conversation_id, id);

-- +goose Down
drop table if exists tutor_messages;
drop table if exists tutor_conversations;
