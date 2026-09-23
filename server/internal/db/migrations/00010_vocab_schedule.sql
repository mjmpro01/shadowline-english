-- +goose Up

-- When to ask about a word again.
--
-- The deck was sorted by status and then by when a card was last seen, which
-- is an order and not a schedule: a word marked known came back the very next
-- session, and one forgotten three weeks ago got no priority over it. Spacing
-- is the whole reason to review vocabulary at all, so the spacing becomes data.
alter table vocab_words add column interval_days int not null default 0;
alter table vocab_words add column due_at timestamptz not null default now();

-- The deck is "what is due for this learner", which is this index.
create index vocab_due_idx on vocab_words (user_id, due_at);

-- Cards already reviewed get an interval that matches what the learner last
-- said about them, dated from that review. Most land in the past, which is
-- correct: they are overdue, and the first session after this migration is
-- where the schedule starts being kept.
--
-- A card nobody has reviewed keeps the default: no interval, due now. That is
-- what a new word is.
update vocab_words
set interval_days = 7, due_at = reviewed_at + interval '7 days'
where reviewed_at is not null and status = 'known';

update vocab_words
set interval_days = 1, due_at = reviewed_at + interval '1 day'
where reviewed_at is not null and status <> 'known';

-- +goose Down
drop index vocab_due_idx;
alter table vocab_words drop column due_at;
alter table vocab_words drop column interval_days;
