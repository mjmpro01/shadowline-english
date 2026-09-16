-- +goose Up
create extension if not exists "pgcrypto";

create table users (
    id          uuid primary key default gen_random_uuid(),
    email       text not null unique,
    name        text not null default '',
    avatar_key  text,
    is_admin    boolean not null default false,
    created_at  timestamptz not null default now()
);

create table clips (
    id               uuid primary key default gen_random_uuid(),
    title            text not null,
    source           text not null default '',
    playlist         text not null default '',
    categories       text[] not null default '{}',
    featured         boolean not null default false,
    timestamp_label  text not null default '',
    duration_seconds double precision not null default 0,
    summary          text not null default '',
    captions         jsonb not null default '[]'::jsonb,
    audio_key        text,
    created_by       uuid references users(id) on delete set null,
    created_at       timestamptz not null default now()
);

create index clips_featured_idx on clips (featured) where featured;
create index clips_playlist_idx on clips (playlist);

create type take_status as enum ('pending', 'scored', 'failed');

create table takes (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users(id) on delete cascade,
    clip_id     uuid not null references clips(id) on delete cascade,
    score       double precision,
    scores      jsonb,
    analysis    jsonb,
    audio_key   text,
    status      take_status not null default 'pending',
    error       text,
    recorded_at timestamptz not null default now()
);

create index takes_user_recorded_idx on takes (user_id, recorded_at desc);
create index takes_clip_idx on takes (clip_id);

create table vocab_words (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users(id) on delete cascade,
    word        text not null,
    ipa         text not null default '',
    meaning     text not null default '',
    status      text not null default 'new',
    clip_id     uuid references clips(id) on delete set null,
    reviewed_at timestamptz,
    created_at  timestamptz not null default now(),
    unique (user_id, word)
);

create table scoring_jobs (
    id         bigserial primary key,
    take_id    uuid not null unique references takes(id) on delete cascade,
    state      text not null default 'queued',
    attempts   int not null default 0,
    locked_at  timestamptz,
    error      text,
    created_at timestamptz not null default now()
);

-- Workers claim with `where state = 'queued' ... for update skip locked`, so the
-- index only needs to cover the rows still waiting.
create index scoring_jobs_queued_idx on scoring_jobs (created_at) where state = 'queued';

create table sessions (
    id         text primary key,
    user_id    uuid not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index sessions_user_idx on sessions (user_id);

-- +goose Down
drop table sessions;
drop table scoring_jobs;
drop table vocab_words;
drop table takes;
drop type take_status;
drop table clips;
drop table users;
