"""Seeding the gloss cache.

The two things worth pinning: that running it twice does not undo the first
run, and that the free half really is free — twelve thousand pronunciations
land with no key of any kind.
"""

from shadowline.seedwords import (
    export_glosses,
    fill_pronunciations,
    import_glosses,
    load_words,
    pending_meanings,
    queue_meanings,
)


def glosses(conn):
    return {
        row[0]: (row[1], row[2])
        for row in conn.execute("select word, ipa, meaning from glosses").fetchall()
    }


def jobs(conn):
    return {row[0] for row in conn.execute("select word from gloss_jobs").fetchall()}


def test_pronunciations_land_with_no_key_at_all(db):
    words = ["brilliant", "question", "really"]

    assert fill_pronunciations(db, words) == 3

    stored = glosses(db)
    assert stored["brilliant"] == ("ˈbɹɪljənt", "")
    assert stored["question"][0] == "ˈkwɛstʃən"


def test_a_meaning_already_written_is_not_overwritten(db):
    """Seeding runs again after the glosser has been working. It must not undo
    what the glosser paid for."""
    db.execute(
        "insert into glosses (word, ipa, meaning, source) "
        "values ('brilliant', 'ˈbɹɪljənt', 'very bright', 'merriam-webster-learners')"
    )

    fill_pronunciations(db, ["brilliant"])

    assert glosses(db)["brilliant"] == ("ˈbɹɪljənt", "very bright")


def test_a_word_with_a_meaning_is_not_queued_again(db):
    """The expensive half is the one that must never be paid for twice."""
    db.execute(
        "insert into glosses (word, ipa, meaning) values ('brilliant', 'ˈbɹɪljənt', 'very bright')"
    )
    fill_pronunciations(db, ["brilliant", "question"])

    queue_meanings(db, ["brilliant", "question"])

    assert jobs(db) == {"question"}


def test_a_word_with_a_pronunciation_and_no_meaning_is_queued(db):
    """Which is every word the free half just wrote."""
    fill_pronunciations(db, ["brilliant"])

    queue_meanings(db, ["brilliant"])

    assert jobs(db) == {"brilliant"}


def test_seeding_twice_queues_one_job_per_word(db):
    queue_meanings(db, ["brilliant", "question"])
    queue_meanings(db, ["brilliant", "question"])

    assert jobs(db) == {"brilliant", "question"}


def test_what_is_left_to_pay_for_is_counted_honestly(db):
    db.execute("insert into glosses (word, ipa, meaning) values ('brilliant', 'x', 'very bright')")
    fill_pronunciations(db, ["question"])

    assert pending_meanings(db, ["brilliant", "question", "really"]) == 2


def test_the_checked_in_list_is_twelve_thousand_usable_words():
    """Checked in rather than generated, so seeding needs nothing but this
    repository and two deployments a year apart hold the same words."""
    from shadowline import ipa

    words = load_words()

    assert len(words) == 12_000
    assert len(set(words)) == 12_000, "the list repeats itself"
    # The whole list was filtered through CMUdict, which is what makes the free
    # half of seeding worth running on its own.
    assert all(ipa.for_word(word) for word in words[:500])
    # The words that sent us looking for a real dictionary in the first place.
    for word in ("brilliant", "gonna", "okay", "kidding", "guys", "consistency"):
        assert word in set(words), word


def test_the_list_starts_with_the_commonest_words():
    """Ordered by frequency, because that is the order a lookup budget is worth
    spending in: --limit 2000 has to mean the 2,000 words most likely to be
    tapped, not 2,000 arbitrary ones."""
    assert load_words(limit=10)[:5] == ["the", "to", "and", "of", "a"]


def test_a_seed_survives_being_written_out_and_read_back(db, tmp_path):
    """The whole reason for the file: meanings are produced once, by anybody,
    and every deployment afterwards starts with them."""
    db.execute(
        "insert into glosses (word, ipa, meaning, source) values "
        "('brilliant', 'ˈbɹɪljənt', 'very bright', 'merriam-webster-learners'), "
        "('gonna', 'ˈɡɑnə', 'going to', 'claude')"
    )
    dest = tmp_path / "glosses.tsv"

    assert export_glosses(db, dest) == 2

    db.execute("delete from glosses")
    assert import_glosses(db, dest) == 2

    stored = {
        row[0]: row[1:]
        for row in db.execute("select word, ipa, meaning, source from glosses").fetchall()
    }
    assert stored["brilliant"] == ("ˈbɹɪljənt", "very bright", "merriam-webster-learners")
    assert stored["gonna"] == ("ˈɡɑnə", "going to", "claude")


def test_a_word_with_no_meaning_is_not_exported(db, tmp_path):
    """Exporting the empty ones would hand the next deployment a file that
    settles words nothing has ever looked up."""
    db.execute("insert into glosses (word, ipa, meaning) values ('brilliant', 'x', '')")
    dest = tmp_path / "glosses.tsv"

    assert export_glosses(db, dest) == 0


def test_a_meaning_already_in_the_database_beats_the_file(db, tmp_path):
    """The file is a starting point for an empty cache, not an authority over a
    running one: a meaning written with a learner's own sentence in front of it
    is better than one generated without."""
    dest = tmp_path / "glosses.tsv"
    dest.write_text(
        "# word\tipa\tmeaning\tsource\nreally\tˈɹɪli\tin actual fact\tclaude\n",
        encoding="utf-8",
    )
    db.execute(
        "insert into glosses (word, ipa, meaning, source) "
        "values ('really', 'ˈɹɪli', 'used to add emphasis', 'claude')"
    )

    import_glosses(db, dest)

    assert db.execute("select meaning from glosses where word = 'really'").fetchone()[0] == (
        "used to add emphasis"
    )


def test_a_tab_inside_a_definition_cannot_shift_the_columns(db, tmp_path):
    """One stray tab would silently move every field after it, and a learner
    would read a source name as a definition."""
    db.execute(
        "insert into glosses (word, ipa, meaning, source) "
        "values ('brilliant', 'x', e'very\tbright\nindeed', 'claude')"
    )
    dest = tmp_path / "glosses.tsv"
    export_glosses(db, dest)

    db.execute("delete from glosses")
    import_glosses(db, dest)

    row = db.execute("select ipa, meaning, source from glosses").fetchone()
    assert row == ("x", "very bright indeed", "claude")
