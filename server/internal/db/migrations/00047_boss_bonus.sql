-- +goose Up
-- A boss beaten for the first time pays a bonus on top of the floor's coins;
-- the duel keeps it, to say so when it ends.
alter table duels add column bonus int not null default 0;

-- +goose Down
alter table duels drop column bonus;
