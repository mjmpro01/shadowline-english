-- +goose Up

-- One row per question put to the tutor.
--
-- Every question is paid for at the router, so this is two things at once: the
-- record of what the tutor costs — per day, per learner — and the count the
-- limit is taken from. The limit used to live in the API's memory, which gave
-- each replica its own allowance and forgot everything on a restart; counted
-- here, every instance sees the same number.
--
-- The question itself is not kept. What a learner asked is theirs, and the
-- cost of asking needs only when, who and how much.
create table tutor_questions (
    id                bigserial primary key,
    user_id           uuid not null references users (id) on delete cascade,
    asked_at          timestamptz not null default now(),
    model             text not null,
    -- The clip on screen when it was asked, if any. Kept when the clip goes,
    -- as a question that was asked and paid for.
    clip_id           uuid references clips (id) on delete set null,
    -- 'asked' until the answer ends; then how it ended. A stopped answer was
    -- still paid for up to where it stopped.
    outcome           text not null default 'asked'
        check (outcome in ('asked', 'answered', 'stopped', 'failed')),
    -- What the router reported. Null when it reported nothing — a stopped
    -- stream never reaches the chunk that carries them.
    prompt_tokens     integer,
    completion_tokens integer,
    answered_at       timestamptz
);

-- The limit counts one learner's recent questions; the console reads by day.
create index tutor_questions_user_idx on tutor_questions (user_id, asked_at desc);
create index tutor_questions_day_idx on tutor_questions (asked_at desc);

-- +goose Down
drop table tutor_questions;
