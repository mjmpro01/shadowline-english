-- +goose Up

-- What only the upload itself knows.
--
-- Everything else about a recording's progress is already written down: whether
-- transcription is still queued, whether its clips still owe a cut, whether it
-- has been published. The one thing nothing recorded was the upload — the row
-- was inserted after the bytes landed, so a transfer still running had nothing
-- to show and one that failed left nothing behind at all. An admin whose film
-- did not arrive had no way to tell a slow upload from a dead one.
--
-- So the row is written first and filled in second, and this column says which
-- of the two has happened.
alter table clip_sources add column upload_state text not null default 'stored'
    check (upload_state in ('uploading', 'stored', 'failed'));

-- How big it is and how long it runs. Both for the history to show: a recording
-- is identified in practice by being the two-hour one, not by its uuid.
-- `bytes` is what the browser said to expect, so it is right for a transfer in
-- flight as well as a finished one. Duration comes from the browser too — it has
-- decoded the file by the time it starts sending it, and this server has not.
alter table clip_sources add column bytes bigint not null default 0;
alter table clip_sources add column duration_seconds double precision not null default 0;

-- Why a failed upload failed, in the admin's own words on screen.
alter table clip_sources add column error text not null default '';

-- Every row that exists now is a stored one, which the default already says.
-- The history is listed newest first and filtered by state, so both.
create index clip_sources_recent_idx on clip_sources (created_at desc);
create index clip_sources_state_idx on clip_sources (upload_state)
    where upload_state <> 'stored';

-- +goose Down
drop index clip_sources_state_idx;
drop index clip_sources_recent_idx;
alter table clip_sources drop column error;
alter table clip_sources drop column duration_seconds;
alter table clip_sources drop column bytes;
alter table clip_sources drop column upload_state;
