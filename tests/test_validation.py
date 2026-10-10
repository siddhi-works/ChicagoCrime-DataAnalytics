"""pytest wrapper: run `pytest tests` after `python run_all.py`."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import validate  # noqa: E402

_ck = validate.run_checks()


@pytest.mark.parametrize("name,ok,detail", _ck.results, ids=[r[0] for r in _ck.results])
def test_check(name, ok, detail):
    assert ok, detail
