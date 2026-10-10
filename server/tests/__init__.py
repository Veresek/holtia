"""Test package.

`conftest.py` is imported twice otherwise: pytest loads it as `conftest` while
the test modules import `tests.conftest`, giving each copy its own fixtures and
its own `SENT_EMAILS`. Packaging the directory makes the module pytest registers
and the module the tests import one and the same.
"""
