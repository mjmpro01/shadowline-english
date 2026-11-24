"""Marking takes scored under older rules again, from what they stored."""

import json
import threading

import psycopg

from shadowline.compare import headline
from shadowline.ease import SCORING_VERSION, ease, ease_scores
from shadowline.rescore import rescore_batch
from shadowline.words import FLOOR
from tests.conftest import admin_dsn

RAW = {"Intonation": 50, "Rhythm": 60, "Stress": 55, "Variation": 45}


def a_take(db, *, scores=RAW, analysis=None, score=None, status="scored", version=1):
    user = db.execute(
        "insert into users (email) values (gen_random_uuid()::text || '@example.com') returning id"
    ).fetchone()[0]
    clip = db.execute(
        "insert into clips (title, duration_seconds) values ('Line', 2) returning id"
    ).fetchone()[0]
    return db.execute(
        """insert into takes (user_id, clip_id, status, score, scores, analysis, scoring_version)
           values (%s, %s, %s, %s, %s, %s, %s) returning id""",
        (user, clip, status, score if score is not None else headline(scores) if scores else None,
         json.dumps(scores) if scores is not None else None,
         json.dumps(analysis) if analysis is not None else None, version),
    ).fetchone()[0]


def row(db, take_id):
    return db.execute(
        "select score, scores, analysis, scoring_version from takes where id = %s", (take_id,)
    ).fetchone()


def test_an_old_take_is_marked_again_from_its_own_metrics(db):
    take = a_take(db, analysis={"user": [], "reference": []})
    assert rescore_batch(db) == 1

    score, scores, analysis, version = row(db, take)
    assert score == ease(headline(RAW))
    assert scores == ease_scores(RAW)
    assert analysis["raw"] == {"score": headline(RAW), "scores": RAW, "version": SCORING_VERSION}
    assert analysis["user"] == [], "the rest of the analysis is kept"
    assert version == SCORING_VERSION


def test_its_words_are_matched_again_with_today_s_rules(db):
    words = {
        "accuracy": 0.5,
        "heard": ["it", "is", "raining"],
        "line": [{"text": "It's", "heard": False}, {"text": "raining", "heard": True}],
    }
    take = a_take(db, analysis={"words": words}, score=40)
    rescore_batch(db)

    score, _, analysis, _ = row(db, take)
    assert analysis["words"]["accuracy"] == 1.0
    assert all(word["heard"] for word in analysis["words"]["line"])
    assert score == ease(headline(RAW))


def test_a_hummed_take_stays_held_down(db):
    words = {"accuracy": 0.0, "heard": [], "line": [{"text": "Hello", "heard": False}]}
    take = a_take(db, analysis={"words": words})
    rescore_batch(db)
    assert row(db, take)[0] == round(ease(headline(RAW)) * FLOOR)


def test_marking_twice_changes_nothing(db):
    take = a_take(db, analysis={})
    assert rescore_batch(db) == 1
    first = row(db, take)
    assert rescore_batch(db) == 0
    assert row(db, take) == first


def test_a_take_with_nothing_measured_is_only_noted(db):
    take = a_take(db, scores=None, analysis=None)
    assert rescore_batch(db) == 1
    score, scores, analysis, version = row(db, take)
    assert (score, scores, analysis) == (None, None, None)
    assert version == SCORING_VERSION


def test_takes_still_being_scored_or_failed_are_left_alone(db):
    pending = a_take(db, status="pending", scores=None)
    failed = a_take(db, status="failed", scores=None)
    assert rescore_batch(db) == 0
    assert row(db, pending)[3] == 1 and row(db, failed)[3] == 1


def test_a_take_already_on_today_s_rules_is_not_touched(db):
    a_take(db, version=SCORING_VERSION, analysis={})
    assert rescore_batch(db) == 0


def test_two_workers_never_mark_the_same_take(db):
    for _ in range(30):
        a_take(db, analysis={})
    # As conftest builds it: info.dsn leaves the password out.
    dsn = admin_dsn().rsplit("/", 1)[0] + "/" + db.info.dbname
    counts = []

    def work():
        with psycopg.connect(dsn, autocommit=True) as conn:
            total = 0
            while (done := rescore_batch(conn, limit=4)) > 0:
                total += done
            counts.append(total)

    threads = [threading.Thread(target=work) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sum(counts) == 30
    left = db.execute("select count(*) from takes where scoring_version < %s", (SCORING_VERSION,))
    assert left.fetchone()[0] == 0
