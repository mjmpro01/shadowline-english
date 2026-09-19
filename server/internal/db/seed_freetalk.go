package db

import (
	"context"
	"embed"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FreeTalk definitions checked in beside the API binary. Built offline from
// https://github.com/freetalk-fun/freetalk-dictionary-v1 (CC BY-NC 4.0) via
// scoring/tools/build_seed_glosses.py, then copied here so migrate does not
// depend on the scoring image or the network.
//
//go:embed data/glosses.tsv
var freetalkGlosses embed.FS

const freetalkMigration = "00008_freetalk_glosses"

// seedFreetalkOnce loads the FreeTalk seed file into glosses exactly once,
// recorded in schema_migrations like a SQL migration. Empty ipa/meaning rows
// are filled; a meaning already written by the glosser is left alone.
func seedFreetalkOnce(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`insert into schema_migrations (name) values ($1) on conflict do nothing`,
		freetalkMigration)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Rollback(ctx)
	}

	rows, err := parseGlossTSV()
	if err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		create temporary table gloss_seed (
			word    text not null,
			ipa     text not null,
			meaning text not null,
			source  text not null
		) on commit drop`); err != nil {
		return fmt.Errorf("temp gloss_seed: %w", err)
	}

	if _, err := tx.CopyFrom(ctx,
		pgx.Identifier{"gloss_seed"},
		[]string{"word", "ipa", "meaning", "source"},
		pgx.CopyFromRows(rows),
	); err != nil {
		return fmt.Errorf("copy gloss_seed: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		insert into glosses (word, ipa, meaning, source)
		select word, ipa, meaning, source from gloss_seed
		on conflict (word) do update
		set ipa     = case when glosses.ipa = '' then excluded.ipa else glosses.ipa end,
		    meaning = case when glosses.meaning = '' then excluded.meaning else glosses.meaning end,
		    source  = case when glosses.meaning = '' then excluded.source else glosses.source end`); err != nil {
		return fmt.Errorf("merge gloss_seed: %w", err)
	}

	return tx.Commit(ctx)
}

func parseGlossTSV() ([][]any, error) {
	raw, err := freetalkGlosses.ReadFile("data/glosses.tsv")
	if err != nil {
		return nil, err
	}
	var rows [][]any
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) != 4 {
			continue
		}
		rows = append(rows, []any{parts[0], parts[1], parts[2], parts[3]})
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("data/glosses.tsv has no gloss rows")
	}
	return rows, nil
}
