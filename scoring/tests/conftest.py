import json
import os
import sys
import uuid
from pathlib import Path

import psycopg
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FIXTURES = Path(__file__).parent / "fixtures"
MIGRATIONS = Path(__file__).resolve().parents[2] / "server/internal/db/migrations"


def admin_dsn() -> str:
    dsn = os.environ.get("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("set TEST_DATABASE_URL to run these tests against Postgres")
    return dsn


def schema() -> str:
    """The server's own migrations, in order.

    Read from the Go server rather than copied here. A copy would drift, and the
    first thing to break would be the queue semantics these tests exist to
    check — so every migration is applied, not just the first.
    """
    parts = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        body = path.read_text().split("-- +goose Up", 1)[1]
        parts.append(body.split("-- +goose Down", 1)[0])
    return "\n".join(parts)


@pytest.fixture
def db():
    """A database of this test's own, with the server's real schema applied."""
    admin = admin_dsn()
    name = f"shadowline_worker_{uuid.uuid4().hex[:12]}"

    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f"create database {name}")

    dsn = admin.rsplit("/", 1)[0] + "/" + name
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(schema())
        yield conn

    with psycopg.connect(admin, autocommit=True) as conn:
        conn.execute(f"drop database {name} with (force)")


@pytest.fixture
def blobs(tmp_path):
    from shadowline.storage import DiskStorage

    root = tmp_path / "blobs"
    (root / "clips").mkdir(parents=True)
    (root / "takes").mkdir(parents=True)
    return DiskStorage(root), root


@pytest.fixture(scope="session")
def expected() -> dict:
    """Scores the TypeScript implementation produced, frozen to a file.

    Regenerate with `npx vitest run test/fixtures.gen.test.ts` in ../app.
    """
    return json.loads((FIXTURES / "expected.json").read_text())


def read_case(name: str) -> tuple:
    reference, rate = sf.read(FIXTURES / f"{name}.reference.wav", dtype="float32")
    take, _ = sf.read(FIXTURES / f"{name}.take.wav", dtype="float32")
    return reference, take, rate
