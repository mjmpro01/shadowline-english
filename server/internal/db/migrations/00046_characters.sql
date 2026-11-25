-- +goose Up
-- The Arena's fighters stop being dressed in gear and become characters: 24
-- of them, each drawn whole with their own weapon and skill, bought with coins
-- and kept. Everyone owns the two free ones; a female fighter becomes the
-- street kid, the rest the beggar. Coins spent on gear come back.

alter table fighters add column character text not null default 'beggar';
update fighters set character = 'street_kid' where body = 'b';

create table fighter_characters (
    user_id   uuid not null references users (id) on delete cascade,
    character text not null,
    owned_at  timestamptz not null default now(),
    primary key (user_id, character)
);
insert into fighter_characters (user_id, character)
select user_id, c from fighters, (values ('beggar'), ('street_kid')) as starters (c);

-- What each piece of gear cost, when it was sold.
create temporary table gear_prices (item text primary key, price int not null) on commit drop;
insert into gear_prices (item, price) values
    ('straw_hat', 60), ('leather_cap', 250), ('iron_helm', 900),
    ('patched_tunic', 80), ('leather_vest', 350), ('scale_mail', 1200),
    ('cloth_wraps', 60), ('leather_gloves', 280), ('iron_knuckles', 950),
    ('walking_stick', 100), ('bo_staff', 450), ('twin_blades', 1500),
    ('straw_sandals', 60), ('swift_boots', 400),
    ('lucky_coin', 120), ('jade_charm', 500), ('phoenix_feather', 1500);

create temporary table gear_refunds on commit drop as
select g.user_id, sum(p.price)::int as coins
from fighter_gear g join gear_prices p on p.item = g.item
group by g.user_id;

insert into coin_events (user_id, kind, item, amount)
select user_id, 'refund', 'gear', coins from gear_refunds where coins > 0;
insert into wallets (user_id, coins)
select user_id, coins from gear_refunds where coins > 0
on conflict (user_id) do update set coins = wallets.coins + excluded.coins, updated_at = now();

drop table fighter_equipped;
drop table fighter_gear;
alter table fighters drop column body, drop column skin, drop column hair;

-- A duel keeps the skill of the character fought with, the stun still to
-- shrug off a hit, and the questions still to get a focus skill's time.
alter table duels
    add column skill  text not null default '',
    add column tier   int  not null default 0,
    add column shield int  not null default 0,
    add column focus  int  not null default 0,
    drop column drop_item;

-- +goose Down
-- The gear tables come back empty; refunds are not taken back.
alter table duels
    drop column skill, drop column tier, drop column shield, drop column focus,
    add column drop_item text not null default '';
alter table fighters
    add column body text not null default 'a' check (body in ('a', 'b')),
    add column skin int  not null default 0 check (skin between 0 and 3),
    add column hair int  not null default 0 check (hair between 0 and 3);
update fighters set body = 'b' where character = 'street_kid';
create table fighter_gear (
    user_id  uuid not null references users (id) on delete cascade,
    item     text not null,
    owned_at timestamptz not null default now(),
    primary key (user_id, item)
);
create table fighter_equipped (
    user_id uuid not null references users (id) on delete cascade,
    slot    text not null check (slot in ('head', 'body', 'hands', 'weapon', 'feet', 'charm')),
    item    text not null,
    primary key (user_id, slot)
);
drop table fighter_characters;
alter table fighters drop column character;
