-- +goose Up
-- What is new to a learner, and the series they keep up with.

-- When an episode first went on the shelf: "new" is measured from this, not
-- from the upload, which can be days earlier.
alter table clip_sources add column published_at timestamptz;
update clip_sources set published_at = created_at where published;
create index clip_sources_published_at_idx on clip_sources (published_at desc) where published;

-- The series a learner follows. A row with following false is a series they
-- left: practising in it again does not follow it again by itself.
create table series_follows (
    user_id     uuid not null references users (id) on delete cascade,
    playlist_id uuid not null references playlists (id) on delete cascade,
    following   boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    primary key (user_id, playlist_id)
);

-- An episode a learner has opened: no longer new to them.
create table episode_seen (
    user_id   uuid not null references users (id) on delete cascade,
    source_id uuid not null references clip_sources (id) on delete cascade,
    seen_at   timestamptz not null default now(),
    primary key (user_id, source_id)
);

-- +goose Down
drop table episode_seen;
drop table series_follows;
drop index clip_sources_published_at_idx;
alter table clip_sources drop column published_at;
