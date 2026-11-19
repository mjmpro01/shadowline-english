# Auto import from a file server

Videos dropped on a file server become published clips with nobody cutting
them by hand. The **importer** (`server/cmd/importer`, the `importer` service
in compose) looks at the server's inbox every few minutes. For each new video
it:

1. **Takes it**: moves it to the processing folder and copies it into storage
   as an upload of its own.
2. **Has it transcribed** by the transcriber worker, like any upload from the
   console.
3. **Cuts it**: one clip per line (`server/internal/autocut`), at sentence ends
   and pauses, never longer than 30 seconds. Captions and IPA come from the
   transcript, and the clips are published straight away in the series named
   by the folder.
4. **Waits for the cutter** to make each clip's sound and picture.
5. **Moves the file to done**, or to failed with a note saying why.

## Setting it up

In the console, open **Auto import**.

1. Choose **SFTP** (over SSH, usually port 22) or **FTPS** (FTP over TLS:
   explicit on port 21, or implicit on port 990). Enter the host, the port and
   the username.
   - SFTP signs in with a password or a private key (OpenSSH or PEM, without a
     passphrase).
   - FTPS signs in with a password.
2. Press **Test the connection**. The test reaches the server, signs in, reads
   the inbox and writes a probe file in each of the other three folders,
   making any folder that is missing. It shows each step and any videos
   waiting. Nothing is moved.
3. **SFTP only:** the first test stops at the server's host key and shows its
   fingerprint. Compare it with the one the server's administrator gives you
   (on the server: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`), then
   press **Trust this server** and test again. From then on the importer only
   connects while the key is the same.
4. Press **Save**. The importer picks the settings up on its next look; it
   does not need restarting.

The password or key is sealed in the database with AES-256-GCM, under a key
derived from `SESSION_SECRET`. It is never shown again or sent back to the
browser: leaving the field empty keeps it. If `SESSION_SECRET` changes, enter
the secret again.

## Folders

```
/inbox/<Series>/<Episode>.mp4       drop videos here, one folder per series
/inbox/<Episode>.mp4                straight in the inbox: the default series
/processing/<Series>/<Episode>.mp4  taken, being transcribed and cut
/done/<Series>/<Episode>.mp4        published
/failed/<Series>/<Episode>.mp4      gave up; <Episode>.mp4.txt says why
```

The folder names can be changed in the console. Processing, done and failed
cannot be inside the inbox, where they would be read as series.

- **Series:** the folder's name, created if there is none by that name.
- **Episode:** the file's name without its extension, with underscores read as
  spaces (`Episode_01.mp4` becomes "Episode 01").
- **Clips:** numbered "Clip N", following any already in the series.
- **File types:** `.mp4`, `.m4v`, `.mov`, `.webm`, `.mkv`, `.mp3`, `.m4a` and
  `.wav`, up to 2 GB.
- **Uploads still in progress:** a file whose size is still changing is left
  for the next look.

To try a failed file again, move it from `failed` back into the inbox and
delete its `.txt`.

## When the file server is down

Cutting needs only the database, so the importer cuts and publishes whatever
is already transcribed even while the file server refuses connections. What
needs the server waits for it: taking new files, and moving files to `done` or
to `failed` (a recording that cannot be transcribed is failed only once its
file can be moved and its note written).

In the console, **Uploads** offers **Cut automatically** on an imported
recording whose words are in and which has no clips yet: it does the
importer's cut straight away. A video with no sound track fails transcription
saying so; download it again with its audio.

## Running it

The importer runs from the API's image, with the same `.env` and the same
storage volume:

```sh
docker compose up -d importer          # with everything else, normally
docker compose logs -f importer        # what it is doing
docker compose run --rm importer --once  # one pass by hand
```

It beats like the workers, so the console's **System** page shows whether it
is running. Until a server is set up in the console, it waits and says so in
its log.

- **Firewall:** the API host must be able to reach the file server.
  - SFTP needs only port 22.
  - FTPS also needs the server's passive data ports, a range the server's
    configuration sets.
- **TLS certificate:** FTPS checks the server's certificate. Tick **Skip the
  certificate check** only for a server with a self-signed certificate on a
  network you trust.

## Trying it locally

`go run ./cmd/sftp-fixture` (in `server/`) runs an SFTP server in memory on
`127.0.0.1:2222`. Its user is `shadow` with the password `line-of-sight`, and
it has two videos in its inbox. The browser tests use the same server.

Tests:

- **Go:**
  - `internal/remote`: SFTP over a real SSH handshake. FTPS runs only when
    `FTPS_TEST_ADDR` points at a server.
  - `internal/importer`: the whole flow, against an in-memory server and over
    SFTP.
  - `internal/api/remoteimport_test.go`: the settings and the connection test.
- **Browser:** `app/e2e/console/import.spec.ts`.
