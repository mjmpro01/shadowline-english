-- +goose Up
-- A series' own cover, uploaded in the console. Until now a series had none:
-- the library borrowed the still of its first clip, which is a 9:16 phone
-- frame of whoever happens to speak first, cropped into a 16:9 poster. That
-- still stays the fallback for a series nobody has given a picture to.
alter table playlists add column if not exists cover_key text;

-- +goose Down
alter table playlists drop column if exists cover_key;
