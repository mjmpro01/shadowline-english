-- +goose Up
-- Undoes 00024: recordings no longer arrive from a link. A recording that was
-- fetched before this stays an ordinary upload, file and clips intact; only
-- where it came from is forgotten. One still waiting for its download never
-- will be, and says so.
update clip_sources
set upload_state = 'failed', error = 'downloading from a link is no longer supported'
where upload_state = 'fetching';

drop table if exists fetch_jobs;
alter table clip_sources drop column if exists source_credit;
alter table clip_sources drop column if exists source_url;
alter table clip_sources drop constraint if exists clip_sources_upload_state_check;
alter table clip_sources add constraint clip_sources_upload_state_check
    check (upload_state in ('uploading', 'stored', 'failed'));

-- +goose Down
alter table clip_sources drop constraint if exists clip_sources_upload_state_check;
alter table clip_sources add constraint clip_sources_upload_state_check
    check (upload_state in ('uploading', 'fetching', 'stored', 'failed'));
alter table clip_sources add column if not exists source_url text not null default '';
alter table clip_sources add column if not exists source_credit text not null default '';
create table if not exists fetch_jobs (
    id         bigserial primary key,
    source_id  uuid not null unique references clip_sources(id) on delete cascade,
    url        text not null,
    state      text not null default 'queued' check (state in ('queued', 'running', 'failed')),
    attempts   int not null default 0,
    locked_at  timestamptz,
    error      text,
    created_at timestamptz not null default now()
);
create index if not exists fetch_jobs_claim_idx on fetch_jobs (state, created_at);
