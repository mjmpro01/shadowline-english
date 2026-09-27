-- +goose Up

-- What the library's front screen reads, per series: its cover (the first clip
-- with a still) and its takes of the last week.
--
-- Measured on 42 series, 12,650 clips and 2,400 takes: the list took 37–48 ms
-- and read 26,100 buffers, most of it finding each series' cover by walking
-- every one of its clips, and counting recent takes by scanning all of them
-- once per series. With these two indexes and the list rewritten to count
-- each thing once (store.ListPlaylists), 3.1 ms and 740 buffers.
create index clips_playlist_cover_idx on clips (playlist_id, start_seconds, created_at)
    where poster_key is not null;
create index takes_recorded_idx on takes (recorded_at);

-- +goose Down
drop index takes_recorded_idx;
drop index clips_playlist_cover_idx;
