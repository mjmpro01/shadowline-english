-- +goose Up
-- Bram's hammer: with it back from the troll, soil goes one level richer.
alter table game_plots drop constraint game_plots_level_check;
alter table game_plots add constraint game_plots_level_check check (level between 0 and 4);

-- +goose Down
update game_plots set level = 3 where level > 3;
alter table game_plots drop constraint game_plots_level_check;
alter table game_plots add constraint game_plots_level_check check (level between 0 and 3);
