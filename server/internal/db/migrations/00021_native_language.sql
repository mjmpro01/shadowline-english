-- +goose Up
-- The language the learner grew up speaking, as a language tag ("vi", "en").
-- Asked once, the first time they sign in, and used to pick the language the
-- app talks to them in — on every device, not just the one they answered on.
-- Null until they have answered: that is what makes the app ask.
alter table users add column if not exists native_language text;

-- +goose Down
alter table users drop column if exists native_language;
