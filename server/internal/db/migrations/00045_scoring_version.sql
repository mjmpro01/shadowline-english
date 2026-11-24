-- +goose Up
-- Which rules marked a take. The scoring worker writes its own version on every
-- take it scores, and marks older takes again from what they stored whenever
-- its queue is empty, so a change to the marking reaches the whole history
-- (scoring/shadowline/rescore.py). Every take before this column existed was
-- marked by version 1.

alter table takes add column scoring_version smallint not null default 1;

create index takes_rescore_idx on takes (recorded_at)
    where status = 'scored' and scoring_version < 2;

-- +goose Down
drop index takes_rescore_idx;
alter table takes drop column scoring_version;
