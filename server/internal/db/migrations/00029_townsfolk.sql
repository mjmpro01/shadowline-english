-- +goose Up
-- Echo Town: how well the player knows each of its people.
--
-- Friendship is points (a heart every hundred). Chatting and giving a gift
-- are once a day each, so the day of the last of each is kept; heart_claims
-- is which heart events have been opened.
create table game_friendship (
    user_id      uuid not null references users (id) on delete cascade,
    npc          text not null,
    points       int  not null default 0 check (points between 0 and 1000),
    talked_on    date,
    gifted_on    date,
    heart_claims int[] not null default '{}',
    primary key (user_id, npc)
);

-- +goose Down
drop table game_friendship;
