-- +goose Up

-- Where a word's meaning came from, so the app can credit it.
--
-- Not bookkeeping: Merriam-Webster's free tier requires their name to appear
-- wherever their definitions do, and a learner is owed the difference anyway
-- between a lexicographer's sentence and a model's. Empty means no meaning, or
-- one written before the sources were named.
alter table glosses add column source text not null default '';

-- +goose Down
alter table glosses drop column source;
