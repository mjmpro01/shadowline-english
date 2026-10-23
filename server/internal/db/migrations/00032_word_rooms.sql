-- +goose Up
-- Chapter 4: the Word Hall's rooms. A word put back in a room is kept here,
-- as is the day a wrong answer leaves it to wait for the next.
create table game_room_words (
    user_id   uuid not null references users (id) on delete cascade,
    word      text not null,
    room      text not null,
    filled_at timestamptz,
    tried_on  date,
    primary key (user_id, word)
);
-- What has been collected for: a bundle ('bundle:<id>') or a whole room
-- ('room:<id>'), each once.
create table game_room_claims (
    user_id uuid not null references users (id) on delete cascade,
    claim   text not null,
    at      timestamptz not null default now(),
    primary key (user_id, claim)
);

-- A room asks its question as the hall's notes and the library do.
alter table game_quizzes drop constraint game_quizzes_kind_check;
alter table game_quizzes add constraint game_quizzes_kind_check check (kind in ('note', 'donate', 'room'));

-- +goose Down
delete from game_quizzes where kind = 'room';
alter table game_quizzes drop constraint game_quizzes_kind_check;
alter table game_quizzes add constraint game_quizzes_kind_check check (kind in ('note', 'donate'));
drop table game_room_claims;
drop table game_room_words;
