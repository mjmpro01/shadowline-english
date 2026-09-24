package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Banner placements: the screens a banner can be shown on.
const (
	PlaceDashboard = "dashboard"
	PlaceLibrary   = "library"
)

// Banner is one announcement. ImageURL is filled in by the API, signed.
type Banner struct {
	ID        uuid.UUID  `json:"id"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	LinkURL   string     `json:"linkUrl"`
	LinkLabel string     `json:"linkLabel"`
	ImageKey  *string    `json:"-"`
	ImageURL  string     `json:"imageUrl"`
	Placement string     `json:"placement"`
	Locale    string     `json:"locale"`
	StartsAt  *time.Time `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt"`
	Enabled   bool       `json:"enabled"`
	Position  int        `json:"position"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// BannerInput is everything an admin writes about a banner. The same shape
// creates one and replaces one: the form always has every field.
type BannerInput struct {
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	LinkURL   string     `json:"linkUrl"`
	LinkLabel string     `json:"linkLabel"`
	Placement string     `json:"placement"`
	Locale    string     `json:"locale"`
	StartsAt  *time.Time `json:"startsAt"`
	EndsAt    *time.Time `json:"endsAt"`
	Enabled   bool       `json:"enabled"`
	Position  int        `json:"position"`
}

const bannerColumns = `id, title, body, link_url, link_label, image_key, placement, locale,
	starts_at, ends_at, enabled, position, created_at, updated_at`

func scanBanner(row pgx.CollectableRow) (Banner, error) {
	var b Banner
	err := row.Scan(&b.ID, &b.Title, &b.Body, &b.LinkURL, &b.LinkLabel, &b.ImageKey, &b.Placement,
		&b.Locale, &b.StartsAt, &b.EndsAt, &b.Enabled, &b.Position, &b.CreatedAt, &b.UpdatedAt)
	return b, err
}

func (s *Store) banners(ctx context.Context, sql string, args ...any) ([]Banner, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanBanner)
}

// LiveBanners is what a learner sees in one place: enabled, inside its window,
// and for their language or for everybody. The window is judged by the
// database's clock, so every API instance agrees on when a banner starts.
func (s *Store) LiveBanners(ctx context.Context, placement, locale string) ([]Banner, error) {
	return s.banners(ctx, `
		select `+bannerColumns+` from banners
		where enabled and placement = $1 and (locale = '' or locale = $2)
		  and (starts_at is null or starts_at <= now())
		  and (ends_at is null or ends_at > now())
		order by position, created_at desc`, placement, locale)
}

// AllBanners is every banner, for the console: the ones showing, the ones
// waiting to start, the ones that have ended and the ones turned off.
func (s *Store) AllBanners(ctx context.Context) ([]Banner, error) {
	return s.banners(ctx, `select `+bannerColumns+` from banners order by placement, position, created_at desc`)
}

func (s *Store) BannerByID(ctx context.Context, id uuid.UUID) (Banner, error) {
	rows, err := s.pool.Query(ctx, `select `+bannerColumns+` from banners where id = $1`, id)
	if err != nil {
		return Banner{}, err
	}
	b, err := pgx.CollectExactlyOneRow(rows, scanBanner)
	return b, mapErr(err)
}

func (s *Store) CreateBanner(ctx context.Context, in BannerInput) (Banner, error) {
	rows, err := s.pool.Query(ctx, `
		insert into banners (title, body, link_url, link_label, placement, locale,
		                     starts_at, ends_at, enabled, position)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		returning `+bannerColumns,
		in.Title, in.Body, in.LinkURL, in.LinkLabel, in.Placement, in.Locale,
		in.StartsAt, in.EndsAt, in.Enabled, in.Position)
	if err != nil {
		return Banner{}, err
	}
	b, err := pgx.CollectExactlyOneRow(rows, scanBanner)
	return b, mapErr(err)
}

func (s *Store) UpdateBanner(ctx context.Context, id uuid.UUID, in BannerInput) (Banner, error) {
	rows, err := s.pool.Query(ctx, `
		update banners set title = $2, body = $3, link_url = $4, link_label = $5,
		       placement = $6, locale = $7, starts_at = $8, ends_at = $9,
		       enabled = $10, position = $11, updated_at = now()
		where id = $1
		returning `+bannerColumns,
		id, in.Title, in.Body, in.LinkURL, in.LinkLabel, in.Placement, in.Locale,
		in.StartsAt, in.EndsAt, in.Enabled, in.Position)
	if err != nil {
		return Banner{}, err
	}
	b, err := pgx.CollectExactlyOneRow(rows, scanBanner)
	return b, mapErr(err)
}

// SetBannerImage records a banner's picture and answers with the one it
// replaced, for the caller to delete.
func (s *Store) SetBannerImage(ctx context.Context, id uuid.UUID, key *string) (old *string, err error) {
	err = s.pool.QueryRow(ctx, `
		update banners b set image_key = $2, updated_at = now()
		from (select image_key from banners where id = $1 for update) prev
		where b.id = $1
		returning prev.image_key`, id, key).Scan(&old)
	return old, mapErr(err)
}

// DeleteBanner removes a banner and answers with its picture's key, if any.
func (s *Store) DeleteBanner(ctx context.Context, id uuid.UUID) (imageKey *string, err error) {
	err = s.pool.QueryRow(ctx, `delete from banners where id = $1 returning image_key`, id).Scan(&imageKey)
	return imageKey, mapErr(err)
}
