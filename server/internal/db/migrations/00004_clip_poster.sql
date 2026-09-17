-- +goose Up

-- A still from the clip, taken by the cutter in the same run that produces the
-- video. The library shows a grid of cards; a frame each is the difference
-- between choosing a clip by its picture and choosing it by its filename.
--
-- A separate column rather than deriving it from video_key: a clip can have a
-- poster before the picture is worth downloading, and the card only ever wants
-- the still.
alter table clips add column poster_key text;

-- +goose Down
alter table clips drop column poster_key;
