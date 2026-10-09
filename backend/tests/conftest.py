import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from social_match import index, service  # noqa: E402


@pytest.fixture()
def conn():
    c = index.connect(":memory:")
    yield c
    c.close()


@pytest.fixture()
def demo(conn):
    service.load_fixture(conn, corpus="demo")
    return conn
