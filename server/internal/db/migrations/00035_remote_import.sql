-- +goose Up
-- Importing videos from a file server: an admin sets the server up in the
-- console, and the importer picks up what is dropped in its inbox, one folder
-- per series, and makes clips of it with nobody cutting by hand.

-- The server, one of it: there is one inbox.
create table remote_import_settings (
    id              int primary key default 1 check (id = 1),
    protocol        text not null check (protocol in ('sftp', 'ftps')),
    host            text not null,
    port            int  not null check (port between 1 and 65535),
    username        text not null default '',
    -- The password, or for SFTP a private key, sealed with a key derived from
    -- SESSION_SECRET (internal/secretbox): never stored or sent back as it is.
    secret_kind     text not null default 'password' check (secret_kind in ('password', 'key')),
    secret          bytea,
    -- FTPS: STARTTLS on the usual port, or TLS from the first byte.
    tls_mode        text not null default 'explicit' check (tls_mode in ('explicit', 'implicit')),
    tls_skip_verify boolean not null default false,
    -- SFTP: the host key's fingerprint an admin has checked and trusted.
    host_key        text not null default '',
    inbox           text not null default '/inbox',
    processing      text not null default '/processing',
    done            text not null default '/done',
    failed          text not null default '/failed',
    default_series  text not null default 'Imported',
    poll_seconds    int  not null default 300 check (poll_seconds >= 60),
    updated_at      timestamptz not null default now(),
    updated_by      uuid references users (id) on delete set null
);

-- Each file taken from the inbox, and how far it has got.
create table remote_imports (
    id              uuid primary key default gen_random_uuid(),
    -- Where it was dropped, and where it waits while it is worked on.
    remote_path     text not null,
    processing_path text not null,
    series          text not null,
    episode         text not null,
    source_id       uuid references clip_sources (id) on delete set null,
    bytes           bigint not null default 0,
    state           text not null default 'downloading'
        check (state in ('downloading', 'transcribing', 'cutting', 'done', 'failed')),
    error           text not null default '',
    clips           int  not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
-- One import at a time of whatever waits at a path.
create unique index remote_imports_working on remote_imports (processing_path)
    where state not in ('done', 'failed');

-- Where a recording came from, when it was not uploaded in the console.
alter table clip_sources add column imported_from text not null default '';

-- +goose Down
alter table clip_sources drop column imported_from;
drop table remote_imports;
drop table remote_import_settings;
