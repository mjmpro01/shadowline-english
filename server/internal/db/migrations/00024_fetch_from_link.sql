-- +goose Up
-- A recording can arrive from a link as well as from a file: an admin pastes a
-- video's address, a worker downloads it, and from there it is an upload like
-- any other — transcribed, cut, published.
--
-- 'fetching' is the state between: the row exists and says where the video is
-- coming from, and nothing has been stored yet.
alter table clip_sources drop constraint if exists clip_sources_upload_state_check;
alter table clip_sources add constraint clip_sources_upload_state_check
    check (upload_state in ('uploading', 'fetching', 'stored', 'failed'));

-- Where it came from, and whose it is: the page it was downloaded from, and the
-- channel or account that published it, kept so every clip cut from it can
-- say so to the learner. Empty for a recording uploaded as a file.
alter table clip_sources add column if not exists source_url text not null default '';
alter table clip_sources add column if not exists source_credit text not null default '';

-- The downloads waiting to happen. The fourth queue, worked by the transcribing
-- worker: a downloaded video is transcribed next anyway, and downloading is a
-- few seconds of network for a short, against minutes of Whisper.
create table fetch_jobs (
    id         bigserial primary key,
    source_id  uuid not null unique references clip_sources(id) on delete cascade,
    url        text not null,
    state      text not null default 'queued' check (state in ('queued', 'running', 'failed')),
    attempts   int not null default 0,
    locked_at  timestamptz,
    error      text,
    created_at timestamptz not null default now()
);

create index fetch_jobs_claim_idx on fetch_jobs (state, created_at);

-- +goose Down
drop table fetch_jobs;
alter table clip_sources drop column if exists source_credit;
alter table clip_sources drop column if exists source_url;
alter table clip_sources drop constraint if exists clip_sources_upload_state_check;
alter table clip_sources add constraint clip_sources_upload_state_check
    check (upload_state in ('uploading', 'stored', 'failed'));
