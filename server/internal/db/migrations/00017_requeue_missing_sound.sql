-- +goose Up

-- Clips cut from a stored recording that have a picture but no sound.
--
-- Since the studio stopped uploading each clip's sound and left it to the
-- cutter, a clip's sound is cut on the server with its picture. A cutter
-- started before that change cut only the picture and then deleted the job,
-- so a clip published against it has a picture and no sound, for good: the
-- practice screen says there is no original recording, and takes against it
-- are never scored.
--
-- Queued once more here, for every such clip that has no job waiting. A
-- current cutter cuts only what is missing (audio_key is null), so a clip
-- whose picture is already there keeps it. One whose recording truly has no
-- sound gets its three attempts again and gives up again, as before.
insert into cut_jobs (clip_id)
select c.id
from clips c
join clip_sources s on s.id = c.source_id
where c.audio_key is null
  and s.upload_state = 'stored'
  and not exists (select 1 from cut_jobs j where j.clip_id = c.id)
on conflict (clip_id) do nothing;

-- +goose Down
-- Nothing to undo: the jobs either ran or are still owed.
