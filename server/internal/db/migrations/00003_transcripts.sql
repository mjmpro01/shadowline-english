-- +goose Up

-- Whether the source has a picture, decided from what the browser said it was
-- uploading. Cutting is queued only for the ones that do: an audio upload now
-- has a source row too, because transcription wants the file whether or not
-- there is anything to see, and queueing a cut for it would hand the cutter a
-- job it can only fail.
alter table clip_sources add column has_video boolean not null default true;

-- One transcript per source, not per clip. A recording is transcribed once and
-- every clip cut from it reads the words falling inside its own boundaries.
create table transcripts (
    source_id  uuid primary key references clip_sources(id) on delete cascade,
    -- [{"start": 1.2, "end": 1.5, "text": "hello", "ipa": "həˈloʊ"}, ...]
    words      jsonb not null default '[]'::jsonb,
    language   text not null default '',
    created_at timestamptz not null default now()
);

create table transcribe_jobs (
    id         bigserial primary key,
    source_id  uuid not null unique references clip_sources(id) on delete cascade,
    state      text not null default 'queued',
    attempts   int not null default 0,
    locked_at  timestamptz,
    error      text,
    created_at timestamptz not null default now()
);

create index transcribe_jobs_queued_idx on transcribe_jobs (created_at) where state = 'queued';

-- +goose Down
drop table transcribe_jobs;
drop table transcripts;
alter table clip_sources drop column has_video;
