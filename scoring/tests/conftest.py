import json
import sys
from pathlib import Path

import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

FIXTURES = Path(__file__).parent / "fixtures"


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
