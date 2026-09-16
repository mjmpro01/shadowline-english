-- +goose Up

-- The file an admin cut a batch of clips out of, kept whole so the cutter can
-- go back to it. One row per upload, shared by every clip taken from it: a
-- fifty-minute lecture is stored once, not once per line.
create table clip_sources (
    id           uuid primary key default gen_random_uuid(),
    name         text not null default '',
    key          text not null,
    content_type text not null default '',
    created_by   uuid references users(id) on delete set null,
    created_at   timestamptz not null default now()
);

alter table clips add column video_key text;
alter table clips add column source_id uuid references clip_sources(id) on delete set null;
-- Where in the source this clip was cut from. The browser already knew these;
-- they are recorded because the cut happens later, on a machine that was not
-- there when the boundaries were chosen.
alter table clips add column start_seconds double precision not null default 0;
alter table clips add column end_seconds double precision not null default 0;

-- Cutting is its own queue rather than a kind of scoring job. The two have
-- nothing in common but the pattern: a learner waits on a score in seconds and
-- nobody waits on a cut, so they are claimed by different workers and scaled
-- against different pressures.
create table cut_jobs (
    id         bigserial primary key,
    clip_id    uuid not null unique references clips(id) on delete cascade,
    state      text not null default 'queued',
    attempts   int not null default 0,
    locked_at  timestamptz,
    error      text,
    created_at timestamptz not null default now()
);

-- Claimed with `where state = 'queued' ... for update skip locked`, so the index
-- only has to cover the rows still waiting.
create index cut_jobs_queued_idx on cut_jobs (created_at) where state = 'queued';

-- +goose Down
drop table cut_jobs;
alter table clips drop column end_seconds;
alter table clips drop column start_seconds;
alter table clips drop column source_id;
alter table clips drop column video_key;
drop table clip_sources;
