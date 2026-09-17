-- +goose Up

-- The learner's voice muxed onto the clip's picture, so a dub is a file they
-- can keep and send rather than only something the Dub Review screen can play.
-- Produced on request: most takes are one of a dozen attempts at the same line
-- and nobody wants a file for each.
alter table takes add column dub_key text;

create table dub_jobs (
    id         bigserial primary key,
    take_id    uuid not null unique references takes(id) on delete cascade,
    state      text not null default 'queued',
    attempts   int not null default 0,
    locked_at  timestamptz,
    error      text,
    created_at timestamptz not null default now()
);

create index dub_jobs_queued_idx on dub_jobs (created_at) where state = 'queued';

-- +goose Down
drop table dub_jobs;
alter table takes drop column dub_key;
