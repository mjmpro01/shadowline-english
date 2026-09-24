-- +goose Up

-- Announcements an admin puts at the top of a learner's screen: a new series,
-- an exam season, a maintenance window.
--
-- Shown while enabled and inside its window — both ends optional — so an admin
-- can write one a week ahead and have it appear and go on its own. `locale`
-- is the app language it is for, or '' for everybody: the app speaks more than
-- one language, and a banner in the wrong one is noise.
create table banners (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    body        text not null default '',
    -- Where the button goes: a path inside the app ("/library/s/…") or an
    -- https address. Empty for a banner with nothing to click.
    link_url    text not null default '',
    link_label  text not null default '',
    image_key   text,
    placement   text not null default 'dashboard'
        check (placement in ('dashboard', 'library')),
    locale      text not null default '',
    starts_at   timestamptz,
    ends_at     timestamptz,
    enabled     boolean not null default true,
    -- Lower first, among the banners showing in one place at once.
    position    integer not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index banners_live_idx on banners (placement, position) where enabled;

-- +goose Down
drop table banners;
