from unittest.mock import patch

from api import ulid


def test_is_26_crockford_chars():
    value = ulid.new_ulid()

    assert len(value) == 26
    assert set(value) <= set(ulid.ALPHABET)


def test_encodes_the_timestamp_first():
    with (
        patch.object(ulid.time, "time_ns", return_value=1_469_918_176_385 * 1_000_000),
        patch.object(ulid.os, "urandom", return_value=bytes(10)),
    ):
        assert ulid.new_ulid() == "01ARYZ6S41" + "0" * 16


def test_sorts_by_time():
    with patch.object(ulid.time, "time_ns", return_value=1_000_000):
        first = ulid.new_ulid()
    with patch.object(ulid.time, "time_ns", return_value=2_000_000):
        second = ulid.new_ulid()

    assert first < second
