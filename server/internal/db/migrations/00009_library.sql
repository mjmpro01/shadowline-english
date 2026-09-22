-- +goose Up

-- A playlist is a series — Friends, The Big Bang Theory — not a single upload.
--
-- It was a free-text column on every clip until now, which was enough to group
-- a grid by and nothing else: a name repeated on two hundred rows has nowhere
-- to carry a description, an order, or the fact that it is the one everybody is
-- watching this week. Those belong to the series, so the series becomes a row.
create table playlists (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    title       text not null,
    description text not null default '',
    -- Picked by an admin rather than computed. Which series to push is a
    -- decision about the library, not a measurement of it; the number beside
    -- the badge is the measurement, and it is counted at read time.
    hot         boolean not null default false,
    position    int not null default 0,
    created_at  timestamptz not null default now()
);

create unique index playlists_title_idx on playlists (lower(title));

-- A video is one episode: one upload, many clips. The row already existed as
-- clip_sources — the file the cutter goes back to — and the only thing missing
-- was that no learner could ever see it.
alter table clip_sources add column playlist_id uuid references playlists(id) on delete set null;
alter table clip_sources add column title text not null default '';
alter table clip_sources add column position int not null default 0;
-- An upload is not an episode until somebody publishes clips out of it. Without
-- this the library would show every half-finished cut an admin ever started.
alter table clip_sources add column published boolean not null default false;

-- Denormalised onto the clip as well as the video, because the library filters
-- and the dashboard both ask "which series is this clip from" and neither wants
-- a join through a source row that a starter clip does not have.
alter table clips add column playlist_id uuid references playlists(id) on delete set null;

create index clip_sources_playlist_idx on clip_sources (playlist_id, position, created_at);
create index clips_playlist_id_idx on clips (playlist_id);
create index clips_source_idx on clips (source_id);

-- Search runs across three levels and a learner types fragments of a half
-- remembered line, so trigrams rather than full text: to_tsquery is built for
-- whole words and "what do you me" is not one.
create extension if not exists pg_trgm;
create index playlists_title_trgm on playlists using gin (title gin_trgm_ops);
create index clip_sources_title_trgm on clip_sources using gin (title gin_trgm_ops);
create index clips_title_trgm on clips using gin (title gin_trgm_ops);
create index clips_captions_trgm on clips using gin ((captions::text) gin_trgm_ops);

-- ---------------------------------------------------------------- backfill

-- One playlist per distinct name already in use. The slug is the name reduced
-- to url characters; two names that reduce to the same slug are numbered, which
-- is rare and still has to be right because the column is unique.
with named as (
    select distinct trim(playlist) as title from clips where trim(playlist) <> ''
), slugged as (
    select title,
           coalesce(nullif(trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')), ''),
                    'playlist') as base
    from named
), numbered as (
    select title, base, row_number() over (partition by base order by title) as n from slugged
)
insert into playlists (slug, title)
select case when n = 1 then base else base || '-' || n end, title from numbered;

update clips c set playlist_id = p.id from playlists p where p.title = trim(c.playlist);

-- A video belongs to the series its clips do, and an upload that produced clips
-- has by definition been published.
update clip_sources s set
    playlist_id = (select c.playlist_id from clips c
                   where c.source_id = s.id and c.playlist_id is not null limit 1),
    title       = case when s.name <> '' then s.name else 'Episode' end,
    published   = exists (select 1 from clips c where c.source_id = s.id);

-- Clips published before video existed have no source row, and every clip has
-- to hang somewhere now that the library is a tree. Each series holding such
-- clips gets one video row to keep them in. The key is empty because there is
-- no file: nothing enqueues cutting or transcription for these — both are
-- queued at upload, which never happened — and DeleteUnusedSources takes the
-- row away again once the last clip leaves it. The title is repeated from
-- store.StandaloneEpisodeTitle, which is where new ones get it.
insert into clip_sources (playlist_id, name, title, key, content_type, has_video, published)
select p.id, '', 'Standalone clips', '', '', false, true
from playlists p
where exists (select 1 from clips c where c.playlist_id = p.id and c.source_id is null);

update clips c set source_id = s.id
from clip_sources s
where c.source_id is null and s.key = '' and s.playlist_id = c.playlist_id;

-- +goose Down
delete from clip_sources where key = '';
drop index clips_captions_trgm;
drop index clips_title_trgm;
drop index clip_sources_title_trgm;
drop index playlists_title_trgm;
alter table clips drop column playlist_id;
alter table clip_sources drop column published;
alter table clip_sources drop column position;
alter table clip_sources drop column title;
alter table clip_sources drop column playlist_id;
drop table playlists;
