package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Importing videos from a file server: the server's settings, kept by the
// console, and each file the importer has taken from its inbox.

// ImportSettings is how to reach the file server, and its folders. The secret
// itself stays sealed: Secret is its sealed bytes, never sent anywhere, and
// HasSecret says whether there is one.
type ImportSettings struct {
	Protocol      string    `json:"protocol"`
	Host          string    `json:"host"`
	Port          int       `json:"port"`
	Username      string    `json:"username"`
	SecretKind    string    `json:"secretKind"`
	HasSecret     bool      `json:"hasSecret"`
	TLSMode       string    `json:"tlsMode"`
	TLSSkipVerify bool      `json:"tlsSkipVerify"`
	HostKey       string    `json:"hostKey"`
	Inbox         string    `json:"inbox"`
	Processing    string    `json:"processing"`
	Done          string    `json:"done"`
	Failed        string    `json:"failed"`
	DefaultSeries string    `json:"defaultSeries"`
	PollSeconds   int       `json:"pollSeconds"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Secret        []byte    `json:"-"`
}

// ImportSettings is the file server as set up, or nil before anyone has.
func (s *Store) ImportSettings(ctx context.Context) (*ImportSettings, error) {
	var out ImportSettings
	err := s.pool.QueryRow(ctx, `
		select protocol, host, port, username, secret_kind, secret, tls_mode, tls_skip_verify, host_key,
		       inbox, processing, done, failed, default_series, poll_seconds, updated_at
		from remote_import_settings where id = 1`).Scan(
		&out.Protocol, &out.Host, &out.Port, &out.Username, &out.SecretKind, &out.Secret, &out.TLSMode,
		&out.TLSSkipVerify, &out.HostKey, &out.Inbox, &out.Processing, &out.Done, &out.Failed,
		&out.DefaultSeries, &out.PollSeconds, &out.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	out.HasSecret = len(out.Secret) > 0
	return &out, nil
}

// SaveImportSettings keeps the settings. A nil sealed secret keeps the one
// stored, so an admin need not type the password again to change a folder.
func (s *Store) SaveImportSettings(ctx context.Context, in ImportSettings, sealed []byte, by uuid.UUID) error {
	var author *uuid.UUID
	if by != uuid.Nil {
		author = &by
	}
	_, err := s.pool.Exec(ctx, `
		insert into remote_import_settings (id, protocol, host, port, username, secret_kind, secret, tls_mode,
		    tls_skip_verify, host_key, inbox, processing, done, failed, default_series, poll_seconds, updated_by)
		values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		on conflict (id) do update set
		    protocol = excluded.protocol, host = excluded.host, port = excluded.port,
		    username = excluded.username, secret_kind = excluded.secret_kind,
		    secret = coalesce(excluded.secret, remote_import_settings.secret),
		    tls_mode = excluded.tls_mode, tls_skip_verify = excluded.tls_skip_verify,
		    host_key = excluded.host_key, inbox = excluded.inbox, processing = excluded.processing,
		    done = excluded.done, failed = excluded.failed, default_series = excluded.default_series,
		    poll_seconds = excluded.poll_seconds, updated_at = now(), updated_by = excluded.updated_by`,
		in.Protocol, in.Host, in.Port, in.Username, in.SecretKind, sealed, in.TLSMode, in.TLSSkipVerify,
		in.HostKey, in.Inbox, in.Processing, in.Done, in.Failed, in.DefaultSeries, in.PollSeconds, author)
	return err
}

// ErrImporting is a file already being imported from where it waits.
var ErrImporting = errors.New("that file is already being imported")

// Import states.
const (
	ImportDownloading  = "downloading"
	ImportTranscribing = "transcribing"
	ImportCutting      = "cutting"
	ImportDone         = "done"
	ImportFailed       = "failed"
)

// RemoteImport is one file taken from the inbox.
type RemoteImport struct {
	ID             uuid.UUID  `json:"id"`
	RemotePath     string     `json:"remotePath"`
	ProcessingPath string     `json:"processingPath"`
	Series         string     `json:"series"`
	Episode        string     `json:"episode"`
	SourceID       *uuid.UUID `json:"sourceId"`
	Bytes          int64      `json:"bytes"`
	State          string     `json:"state"`
	Error          string     `json:"error"`
	Clips          int        `json:"clips"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

const remoteImportColumns = `id, remote_path, processing_path, series, episode, source_id, bytes, state, error, clips, created_at, updated_at`

func scanRemoteImport(row pgx.CollectableRow) (RemoteImport, error) {
	var r RemoteImport
	err := row.Scan(&r.ID, &r.RemotePath, &r.ProcessingPath, &r.Series, &r.Episode, &r.SourceID, &r.Bytes,
		&r.State, &r.Error, &r.Clips, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

// StartRemoteImport records a file taken from the inbox, about to download.
// ErrImporting when something is already being imported from that path.
func (s *Store) StartRemoteImport(ctx context.Context, in RemoteImport) (RemoteImport, error) {
	rows, err := s.pool.Query(ctx, `
		insert into remote_imports (remote_path, processing_path, series, episode, bytes)
		values ($1, $2, $3, $4, $5)
		on conflict do nothing
		returning `+remoteImportColumns, in.RemotePath, in.ProcessingPath, in.Series, in.Episode, in.Bytes)
	if err != nil {
		return RemoteImport{}, err
	}
	got, err := pgx.CollectRows(rows, scanRemoteImport)
	if err != nil {
		return RemoteImport{}, err
	}
	if len(got) == 0 {
		return RemoteImport{}, ErrImporting
	}
	return got[0], nil
}

// ImportingAt is whether a file waiting at a processing path has an import
// still working on it: one without was dropped there by an importer that
// stopped before it could say so.
func (s *Store) ImportingAt(ctx context.Context, processingPath string) (bool, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		select count(*)::int from remote_imports
		where processing_path = $1 and state not in ('done', 'failed')`, processingPath).Scan(&n)
	return n > 0, err
}

// RemoteImportsWorking is every import not yet done or failed, oldest first.
func (s *Store) RemoteImportsWorking(ctx context.Context) ([]RemoteImport, error) {
	rows, err := s.pool.Query(ctx, `select `+remoteImportColumns+` from remote_imports
		where state not in ('done', 'failed') order by created_at`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanRemoteImport)
}

// MoveRemoteImport records an import's next state: its recording once there
// is one, how many clips were made, and why it failed.
func (s *Store) MoveRemoteImport(ctx context.Context, id uuid.UUID, state string, source *uuid.UUID, clips int, reason string) error {
	if len(reason) > 1000 {
		reason = reason[:1000]
	}
	_, err := s.pool.Exec(ctx, `
		update remote_imports set state = $2, source_id = coalesce($3, source_id),
		    clips = greatest(clips, $4), error = $5, updated_at = now()
		where id = $1`, id, state, source, clips, reason)
	return err
}

// ClaimImportForCutting moves a transcribed import on to cutting, and says
// whether this caller did: the importer and the console's "Cut automatically"
// both cut, and only the one that claims an import makes its clips.
func (s *Store) ClaimImportForCutting(ctx context.Context, id uuid.UUID) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		update remote_imports set state = 'cutting', updated_at = now()
		where id = $1 and state = 'transcribing'`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

// ReleaseImportClaim hands a claimed import back to transcribing, when it was
// claimed and nothing was cut: the importer decides what becomes of it next.
func (s *Store) ReleaseImportClaim(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		update remote_imports set state = 'transcribing', updated_at = now()
		where id = $1 and state = 'cutting' and clips = 0`, id)
	return err
}

// RemoteImportBySource is the newest import of a recording; ErrNotFound when
// it did not come from the file server.
func (s *Store) RemoteImportBySource(ctx context.Context, source uuid.UUID) (RemoteImport, error) {
	rows, err := s.pool.Query(ctx, `select `+remoteImportColumns+` from remote_imports
		where source_id = $1 order by created_at desc limit 1`, source)
	if err != nil {
		return RemoteImport{}, err
	}
	got, err := pgx.CollectRows(rows, scanRemoteImport)
	if err != nil {
		return RemoteImport{}, err
	}
	if len(got) == 0 {
		return RemoteImport{}, ErrNotFound
	}
	return got[0], nil
}

// MarkImported says where a recording came from, for the console, and names
// the episode it will be.
func (s *Store) MarkImported(ctx context.Context, source uuid.UUID, from, title string) error {
	_, err := s.pool.Exec(ctx, `update clip_sources set imported_from = $2, title = $3 where id = $1`, source, from, title)
	return err
}

// Beat records that a service is alive, and whether it is working right now,
// as the Python workers do: the console's System page reads these.
func (s *Store) Beat(ctx context.Context, service string, busy bool, version string, started time.Time) error {
	_, err := s.pool.Exec(ctx, `
		insert into worker_heartbeats (service, seen_at, busy, version, started_at)
		values ($1, now(), $2, $3, $4)
		on conflict (service) do update
		set seen_at = now(), busy = excluded.busy, version = excluded.version, started_at = excluded.started_at`,
		service, busy, version, started)
	return err
}
