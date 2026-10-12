package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Section is one shelf of the library's front screen: "For children",
// "Anime". An admin makes it, names it and fills it with series; a series can
// be on several.
type Section struct {
	ID          uuid.UUID `json:"id"`
	Slug        string    `json:"slug"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Icon        string    `json:"icon"`
	Position    int       `json:"position"`
	// Series is how many series are on the shelf.
	Series    int       `json:"series"`
	CreatedAt time.Time `json:"createdAt"`
}

// SectionInput is what the console writes about a section. Nil leaves a field
// alone on an update; a create needs a title.
type SectionInput struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Icon        *string `json:"icon"`
	Position    *int    `json:"position"`
}

// ErrUnknownSeries is a shelf asked to hold a series that does not exist.
var ErrUnknownSeries = errors.New("unknown series")

const sectionColumns = `s.id, s.slug, s.title, s.description, s.icon, s.position,
	(select count(*) from library_section_series m where m.section_id = s.id),
	s.created_at`

func scanSection(row pgx.Row) (Section, error) {
	var out Section
	err := row.Scan(&out.ID, &out.Slug, &out.Title, &out.Description, &out.Icon, &out.Position,
		&out.Series, &out.CreatedAt)
	return out, mapErr(err)
}

func (s *Store) sections(ctx context.Context, where string, args ...any) ([]Section, error) {
	rows, err := s.pool.Query(ctx, `select `+sectionColumns+` from library_sections s `+where+`
		order by s.position, s.title, s.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Section{}
	for rows.Next() {
		section, err := scanSection(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, section)
	}
	return out, rows.Err()
}

// AllSections is every shelf, empty ones too, for the console.
func (s *Store) AllSections(ctx context.Context) ([]Section, error) {
	return s.sections(ctx, "")
}

// FilledSections is the shelves a learner sees: an empty one is a heading
// with nothing under it.
func (s *Store) FilledSections(ctx context.Context) ([]Section, error) {
	return s.sections(ctx, `where exists (select 1 from library_section_series m where m.section_id = s.id)`)
}

func (s *Store) SectionBySlug(ctx context.Context, slug string) (Section, error) {
	return scanSection(s.pool.QueryRow(ctx,
		`select `+sectionColumns+` from library_sections s where s.slug = $1`, slug))
}

func (s *Store) SectionByID(ctx context.Context, id uuid.UUID) (Section, error) {
	return scanSection(s.pool.QueryRow(ctx,
		`select `+sectionColumns+` from library_sections s where s.id = $1`, id))
}

// SectionPlaylistIDs is the series on a shelf, in its order: what the console
// edits.
func (s *Store) SectionPlaylistIDs(ctx context.Context, id uuid.UUID) ([]uuid.UUID, error) {
	rows, err := s.pool.Query(ctx, `
		select playlist_id from library_section_series
		where section_id = $1 order by position, playlist_id`, id)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if ids == nil {
		ids = []uuid.UUID{}
	}
	return ids, err
}

// CreateSection makes a shelf at the end of the list. Its address comes from
// its title once and then stays, so renaming it later breaks no link.
func (s *Store) CreateSection(ctx context.Context, in SectionInput) (Section, error) {
	title := strings.TrimSpace(deref(in.Title))
	base := sectionSlug(title)
	for _, slug := range append([]string{base}, numbered(base)...) {
		var id uuid.UUID
		err := s.pool.QueryRow(ctx, `
			insert into library_sections (slug, title, description, icon, position)
			values ($1, $2, $3, $4,
			        coalesce($5, (select coalesce(max(position), -1) + 1 from library_sections)))
			on conflict (slug) do nothing
			returning id`,
			slug, title, deref(in.Description), deref(in.Icon), in.Position).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return Section{}, err
		}
		return s.SectionByID(ctx, id)
	}
	return Section{}, errors.New("could not find a free slug for " + title)
}

func (s *Store) UpdateSection(ctx context.Context, id uuid.UUID, in SectionInput) (Section, error) {
	tag, err := s.pool.Exec(ctx, `
		update library_sections set
			title       = coalesce($2, title),
			description = coalesce($3, description),
			icon        = coalesce($4, icon),
			position    = coalesce($5, position)
		where id = $1`, id, in.Title, in.Description, in.Icon, in.Position)
	if err != nil {
		return Section{}, err
	}
	if tag.RowsAffected() == 0 {
		return Section{}, ErrNotFound
	}
	return s.SectionByID(ctx, id)
}

// DeleteSection removes a shelf. The series on it stay in the library.
func (s *Store) DeleteSection(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `delete from library_sections where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetSectionSeries replaces what is on a shelf with these series, in this
// order. One write rather than add, remove and move: the console holds the
// whole list on screen, and sending it whole cannot leave the shelf half
// rearranged. A series listed twice is kept at its first place.
func (s *Store) SetSectionSeries(ctx context.Context, id uuid.UUID, playlists []uuid.UUID) error {
	return s.inTx(ctx, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx,
			`select exists (select 1 from library_sections where id = $1)`, id).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx, `delete from library_section_series where section_id = $1`, id); err != nil {
			return err
		}
		seen := map[uuid.UUID]bool{}
		position := 0
		for _, playlist := range playlists {
			if seen[playlist] {
				continue
			}
			seen[playlist] = true
			if _, err := tx.Exec(ctx, `
				insert into library_section_series (section_id, playlist_id, position)
				values ($1, $2, $3)`, id, playlist, position); err != nil {
				var pgErr *pgconn.PgError
				if errors.As(err, &pgErr) && pgErr.Code == "23503" {
					return ErrUnknownSeries
				}
				return err
			}
			position++
		}
		return nil
	})
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}

// sectionSlug is slugify for a title most likely written in Vietnamese:
// "Dành cho trẻ em" is tre-em's sibling danh-cho-tre-em, not d-nh-cho-tr-em,
// which is what dropping every accented letter would make of it.
func sectionSlug(title string) string {
	slug := slugify(vietnameseFold.Replace(strings.ToLower(title)))
	if slug == "playlist" {
		return "section"
	}
	return slug
}

var vietnameseFold = strings.NewReplacer(foldPairs()...)

func foldPairs() []string {
	groups := map[string]string{
		"a": "àáảãạăằắẳẵặâầấẩẫậ",
		"e": "èéẻẽẹêềếểễệ",
		"i": "ìíỉĩị",
		"o": "òóỏõọôồốổỗộơờớởỡợ",
		"u": "ùúủũụưừứửữự",
		"y": "ỳýỷỹỵ",
		"d": "đ",
	}
	var pairs []string
	for base, letters := range groups {
		for _, r := range letters {
			pairs = append(pairs, string(r), base)
		}
	}
	return pairs
}
