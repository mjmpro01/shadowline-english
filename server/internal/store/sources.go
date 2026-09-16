package store

import (
	"context"

	"github.com/google/uuid"
)

// Source is a file an admin cut a batch of clips out of, kept whole.
//
// It exists because cutting video happens after publishing, on a worker that
// was not there when the boundaries were chosen. One row per upload, shared by
// every clip taken from it: a fifty-minute recording is stored once, not once
// per line.
type Source struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Key         string    `json:"-"`
	ContentType string    `json:"-"`
}

func (s *Store) CreateSource(ctx context.Context, name, key, contentType string, createdBy uuid.UUID) (Source, error) {
	var author *uuid.UUID
	if createdBy != uuid.Nil {
		author = &createdBy
	}
	var out Source
	err := s.pool.QueryRow(ctx, `
		insert into clip_sources (name, key, content_type, created_by)
		values ($1, $2, $3, $4)
		returning id, name, key, content_type`,
		name, key, contentType, author).Scan(&out.ID, &out.Name, &out.Key, &out.ContentType)
	return out, mapErr(err)
}

func (s *Store) SourceByID(ctx context.Context, id uuid.UUID) (Source, error) {
	var out Source
	err := s.pool.QueryRow(ctx,
		`select id, name, key, content_type from clip_sources where id = $1`, id).
		Scan(&out.ID, &out.Name, &out.Key, &out.ContentType)
	return out, mapErr(err)
}

// DeleteUnusedSources removes sources no clip refers to any more, returning
// their keys so the caller can drop the objects.
//
// Without this a source outlives every clip cut from it, and the biggest file
// in the system is the one nothing ever deletes.
func (s *Store) DeleteUnusedSources(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		delete from clip_sources
		where not exists (select 1 from clips where clips.source_id = clip_sources.id)
		returning key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}
