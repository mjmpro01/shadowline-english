-- +goose Up

-- What a word means and how it is said, so tapping one in a caption answers
-- with something real instead of the fifteen-word table the app shipped with.
--
-- Keyed by the word alone, not by the line it was tapped in. A word tapped in
-- a caption goes into a personal vocabulary list, and a list wants one settled
-- meaning per word rather than one per sentence it was met in. The line is
-- still used — it steers which sense gets written down the first time anybody
-- taps the word — but it is not part of the key, so the second learner to tap
-- "really" pays nothing and waits for nothing.
--
-- The two halves are filled by different things and either can be empty:
-- `ipa` comes from CMUdict and is free, `meaning` comes from a model and costs
-- money. A worker running without an API key still fills the IPA.
create table glosses (
    word       text primary key,
    ipa        text not null default '',
    meaning    text not null default '',
    created_at timestamptz not null default now()
);

create table gloss_jobs (
    id         bigserial primary key,
    word       text not null unique,
    -- The caption the word was tapped in. Empty when it was tapped outside
    -- one, which is not a failure: the word alone still has a definition.
    context    text not null default '',
    state      text not null default 'queued',
    attempts   int not null default 0,
    locked_at  timestamptz,
    error      text,
    created_at timestamptz not null default now()
);

create index gloss_jobs_queued_idx on gloss_jobs (created_at) where state = 'queued';

-- +goose Down
drop table gloss_jobs;
drop table glosses;
