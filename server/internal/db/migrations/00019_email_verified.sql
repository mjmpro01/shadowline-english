-- +goose Up
-- When this account's address was last proven to belong to whoever signs in
-- to it: a Google login (Google verifies addresses) or a Keycloak account
-- whose email is marked verified. Null for an account only ever reached by an
-- unverified identity — a password registration nobody has confirmed.
--
-- An unverified identity may not sign in to an account that has this set:
-- registering somebody else's address used to sign the registrant straight
-- into that person's account, admin rights included.
alter table users add column if not exists email_verified_at timestamptz;

-- Every account that exists now is treated as proven. Accounts registered by
-- password before this were created verified in Keycloak, so their owners
-- keep signing in as before; leaving these null would instead leave all of
-- them open to the takeover this closes.
update users set email_verified_at = created_at where email_verified_at is null;

-- +goose Down
alter table users drop column if exists email_verified_at;
