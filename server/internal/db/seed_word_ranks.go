package db

import (
	"context"
	_ "embed"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The 12,000 most common English words in frequency order, copied from
// scoring/shadowline/data/common_words.txt so the API does not depend on the
// scoring image to seed them.
//
//go:embed data/common_words.txt
var commonWords string

const wordRanksMigration = "00026_word_ranks"

// seedWordRanksOnce fills word_ranks once, recorded in schema_migrations like a
// SQL migration, the same way the FreeTalk glosses are.
func seedWordRanksOnce(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`insert into schema_migrations (name) values ($1) on conflict do nothing`, wordRanksMigration)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Rollback(ctx)
	}

	rows := parseWordRanks(commonWords)
	if len(rows) == 0 {
		return fmt.Errorf("data/common_words.txt has no words")
	}
	if _, err := tx.CopyFrom(ctx, pgx.Identifier{"word_ranks"}, []string{"word", "rank"},
		pgx.CopyFromRows(rows)); err != nil {
		return fmt.Errorf("copy word_ranks: %w", err)
	}
	return tx.Commit(ctx)
}

// parseWordRanks numbers the words from 1 in the order the file lists them,
// keeping the first of any repeat.
func parseWordRanks(raw string) [][]any {
	seen := map[string]bool{}
	var rows [][]any
	for _, line := range strings.Split(raw, "\n") {
		word := strings.ToLower(strings.TrimSpace(line))
		if word == "" || strings.HasPrefix(word, "#") || seen[word] {
			continue
		}
		seen[word] = true
		rows = append(rows, []any{word, len(rows) + 1})
	}
	return rows
}
