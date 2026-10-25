from unittest.mock import MagicMock, patch

import pytest

from api import db
from api.errors import InvalidRequest
from api.routes import settings

NOW = "2026-10-25T10:00:00.000Z"


@pytest.fixture
def table():
    table = MagicMock()
    table.get_item.return_value = {}
    with (
        patch.object(db, "table", return_value=table),
        patch.object(db, "now", return_value=NOW),
    ):
        yield table


def test_get_settings_without_item_is_empty(table):
    assert settings.get_settings("u1") == {}
    table.get_item.assert_called_once_with(Key={"PK": "USER#u1", "SK": "SETTINGS"})


def test_get_settings_returns_the_kindle_email(table):
    table.get_item.return_value = {
        "Item": {"PK": "USER#u1", "SK": "SETTINGS", "kindleEmail": "me@kindle.com"}
    }

    assert settings.get_settings("u1") == {"kindleEmail": "me@kindle.com"}


@pytest.mark.parametrize("email", ["me@kindle.com", "Me.Reader_1@Kindle.COM"])
def test_put_settings_saves_the_kindle_email(table, email):
    assert settings.put_settings("u1", {"kindleEmail": email}) == {"kindleEmail": email}

    table.put_item.assert_called_once_with(
        Item={
            "PK": "USER#u1",
            "SK": "SETTINGS",
            "entity": "SETTINGS",
            "kindleEmail": email,
            "updatedAt": NOW,
        }
    )


def test_put_settings_null_removes_the_kindle_email(table):
    assert settings.put_settings("u1", {"kindleEmail": None}) == {}

    table.put_item.assert_called_once_with(
        Item={"PK": "USER#u1", "SK": "SETTINGS", "entity": "SETTINGS", "updatedAt": NOW}
    )


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"kindleEmail": "me@kindle.com", "other": 1},
        {"kindleEmail": "me@gmail.com"},
        {"kindleEmail": "me@kindle.com.evil"},
        {"kindleEmail": "@kindle.com"},
        {"kindleEmail": "a b@kindle.com"},
        {"kindleEmail": "me@kindle.com\n"},
        {"kindleEmail": "a" * 245 + "@kindle.com"},
        {"kindleEmail": 3},
    ],
)
def test_put_settings_rejects_invalid_bodies(table, body):
    with pytest.raises(InvalidRequest):
        settings.put_settings("u1", body)

    table.put_item.assert_not_called()
