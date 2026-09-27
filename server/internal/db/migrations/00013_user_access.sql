-- +goose Up

-- Who is an admin, written down rather than recomputed.
--
-- is_admin used to be set from ADMIN_EMAILS on every sign-in, which made the
-- environment variable the only way to make somebody an admin — and meant any
-- admin rights given another way were taken back the next time that person
-- signed in. ADMIN_EMAILS stays, as the owners: always admins, whatever the
-- console says, so a deployment can never lock itself out. admin_granted is
-- everybody else an admin has made one. is_admin is still the column every
-- request reads, kept equal to "an owner, or granted".
alter table users add column admin_granted boolean not null default false;

-- A suspended account cannot sign in, and its sessions stop working the moment
-- it is suspended. Null is an account in good standing. Suspension, not
-- deletion: the takes and the history stay, and it can be undone.
alter table users add column suspended_at timestamptz;

-- When they last signed in, for the console's list. Null until the next one.
alter table users add column last_signed_in_at timestamptz;

create index users_created_idx on users (created_at desc);

-- +goose Down
drop index users_created_idx;
alter table users drop column last_signed_in_at;
alter table users drop column suspended_at;
alter table users drop column admin_granted;
