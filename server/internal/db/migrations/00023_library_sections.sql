-- +goose Up
-- Shelves on the library's front screen: "For children", "Films", "Anime",
-- "IPA practice". A section is an admin's grouping of series, made for a
-- learner to browse by, and a series can stand on more than one shelf — a
-- cartoon is for children and is also an anime.
--
-- Not the clips' categories: those are tags on a clip, typed in the studio and
-- searched across series. A shelf is a decision about what to put in front of
-- people, in an order somebody chose.
create table library_sections (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    title       text not null,
    description text not null default '',
    -- One emoji drawn beside the title, the way the topic chips have one.
    icon        text not null default '',
    position    int not null default 0,
    created_at  timestamptz not null default now()
);

create table library_section_series (
    section_id  uuid not null references library_sections(id) on delete cascade,
    playlist_id uuid not null references playlists(id) on delete cascade,
    position    int not null default 0,
    primary key (section_id, playlist_id)
);

create index library_section_series_order_idx on library_section_series (section_id, position);
create index library_section_series_playlist_idx on library_section_series (playlist_id);

-- The shelves asked for when sections were made. Empty, so none shows to a
-- learner until a series is put on it; renamed or deleted in the console.
insert into library_sections (slug, title, icon, position) values
    ('tre-em', 'Dành cho trẻ em', '🧸', 0),
    ('phim-anh', 'Phim ảnh', '🎬', 1),
    ('anime', 'Anime', '🌸', 2),
    ('luyen-ipa', 'Luyện IPA', '🔤', 3);

-- +goose Down
drop table library_section_series;
drop table library_sections;
