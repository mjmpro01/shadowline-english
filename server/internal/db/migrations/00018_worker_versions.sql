-- +goose Up

-- Which code each worker is running, and since when. A worker left running
-- from before a pull is the most common reason something new "does not work":
-- the cutter that cut only pictures was one. With these, the console can show
-- every part's version side by side and point at the one that is behind.
alter table worker_heartbeats add column version text not null default '';
alter table worker_heartbeats add column started_at timestamptz;

-- +goose Down
alter table worker_heartbeats drop column started_at;
alter table worker_heartbeats drop column version;
