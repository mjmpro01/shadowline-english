package db_test

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shadowline/server/internal/db"
)

// 00046 turns fighters dressed in gear into fighters playing characters: coins
// spent on gear come back, everyone owns the two free characters, and a
// female fighter becomes the street kid.
func TestGearIsRefundedWhenFightersBecomeCharacters(t *testing.T) {
	adminURL := os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" {
		t.Skip("set TEST_DATABASE_URL to run db tests against Postgres")
	}
	ctx := context.Background()
	name := "sl_ch_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	admin, err := pgxpool.New(ctx, adminURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "drop database if exists "+name+" with (force)")
		admin.Close()
	})
	if _, err := admin.Exec(ctx, "create database "+name); err != nil {
		t.Fatalf("create database: %v", err)
	}
	pool, err := db.Open(ctx, replaceDatabase(adminURL, name))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	// Back to before 00046, by its own Down section.
	raw, err := os.ReadFile("migrations/00046_characters.sql")
	if err != nil {
		t.Fatal(err)
	}
	_, down, ok := strings.Cut(string(raw), "-- +goose Down")
	if !ok {
		t.Fatal("no Down section")
	}
	if _, err := pool.Exec(ctx, down); err != nil {
		t.Fatalf("down: %v", err)
	}
	if _, err := pool.Exec(ctx, `delete from schema_migrations where name = '00046_characters.sql'`); err != nil {
		t.Fatalf("forget 00046: %v", err)
	}

	// Three fighters: one who bought a hat and a staff, a woman in rags, and
	// one who already had coins and bought a feather.
	user := func(email string) uuid.UUID {
		var id uuid.UUID
		if err := pool.QueryRow(ctx, `insert into users (email) values ($1) returning id`, email).Scan(&id); err != nil {
			t.Fatalf("user: %v", err)
		}
		return id
	}
	buyer, woman, rich := user("buyer@example.com"), user("woman@example.com"), user("rich@example.com")
	for _, f := range []struct {
		id   uuid.UUID
		body string
		gear []string
	}{
		{buyer, "a", []string{"rags", "straw_hat", "bo_staff"}},
		{woman, "b", []string{"rags"}},
		{rich, "a", []string{"phoenix_feather"}},
	} {
		if _, err := pool.Exec(ctx, `insert into fighters (user_id, name, body) values ($1, 'F', $2)`, f.id, f.body); err != nil {
			t.Fatalf("fighter: %v", err)
		}
		for _, item := range f.gear {
			if _, err := pool.Exec(ctx, `insert into fighter_gear (user_id, item) values ($1, $2)`, f.id, item); err != nil {
				t.Fatalf("gear: %v", err)
			}
		}
	}
	if _, err := pool.Exec(ctx, `insert into wallets (user_id, coins) values ($1, 40)`, rich); err != nil {
		t.Fatalf("wallet: %v", err)
	}

	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatalf("migrate again: %v", err)
	}
	for _, want := range []struct {
		id        uuid.UUID
		character string
		coins     int
	}{
		{buyer, "beggar", 60 + 450},
		{woman, "street_kid", 0},
		{rich, "beggar", 40 + 1500},
	} {
		var character string
		var coins, owned int
		if err := pool.QueryRow(ctx, `
			select f.character, coalesce(w.coins, 0),
			       (select count(*) from fighter_characters c where c.user_id = f.user_id)
			from fighters f left join wallets w on w.user_id = f.user_id where f.user_id = $1`, want.id).
			Scan(&character, &coins, &owned); err != nil {
			t.Fatalf("after: %v", err)
		}
		if character != want.character || coins != want.coins || owned != 2 {
			t.Errorf("%s: %s, %d coins, %d owned", want.character, character, coins, owned)
		}
	}
	var refunds int
	if err := pool.QueryRow(ctx, `select count(*) from coin_events where kind = 'refund'`).Scan(&refunds); err != nil || refunds != 2 {
		t.Fatalf("%d refunds (%v)", refunds, err)
	}
	var gone bool
	if err := pool.QueryRow(ctx, `select to_regclass('fighter_gear') is null`).Scan(&gone); err != nil || !gone {
		t.Fatalf("the gear table is still there (%v)", err)
	}
}
