-- +goose Up

-- Giving up used to delete the job, which took the reason with it: the studio
-- could only say "could not be transcribed" and nobody could tell a missing
-- file from a missing model from a worker that was never started. A job the
-- transcriber has given up on now stays, as 'failed', with its error. It is
-- never claimed again (the worker only takes 'queued' and stale 'running'), and
-- a retry from the console puts it back to 'queued'.
--
-- Which workers are alive, one row per service: the worker writes it every few
-- seconds, idle or busy, so "queued for ten minutes" can be told apart from
-- "queued for ten minutes because nothing is running to take it".
create table worker_heartbeats (
    service  text primary key,
    seen_at  timestamptz not null default now(),
    -- Working on something right now, rather than waiting for work.
    busy     boolean not null default false
);

-- +goose Down
drop table worker_heartbeats;
delete from transcribe_jobs where state = 'failed';
