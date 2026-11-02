import json
from unittest.mock import MagicMock, patch

import pytest
from boto3.dynamodb.types import TypeSerializer
from botocore.credentials import Credentials

from notify import handler

_serialize = TypeSerializer().serialize

ENDPOINT = "https://abc.appsync-api.us-east-1.amazonaws.com/event"
BOOK = {"PK": "USER#u1", "SK": "BOOK#BOOKID", "entity": "BOOK", "id": "BOOKID", "ingest": "ready"}


def _image(item):
    return {k: _serialize(v) for k, v in item.items()}


def _record(new, old, event_name="MODIFY"):
    return {"eventName": event_name, "dynamodb": {"NewImage": _image(new), "OldImage": _image(old)}}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("EVENTS_ENDPOINT", ENDPOINT)
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    with patch.object(handler, "_credentials", return_value=Credentials("AKID", "SECRET")):
        yield


@pytest.fixture
def urlopen():
    response = MagicMock()
    response.__enter__.return_value.read.return_value = b'{"successful": [], "failed": []}'
    with patch.object(handler.urllib.request, "urlopen", return_value=response) as mock:
        yield mock


def _sent(urlopen):
    request = urlopen.call_args.args[0]
    return request, json.loads(request.data)


def test_publishes_when_ingest_changes(urlopen):
    handler.handler({"Records": [_record(BOOK, {**BOOK, "ingest": "pending"})]}, None)

    request, body = _sent(urlopen)
    assert request.full_url == ENDPOINT
    assert request.get_method() == "POST"
    assert request.headers["Authorization"].startswith("AWS4-HMAC-SHA256")
    assert body == {"channel": "/readflow/users/u1", "events": ['{"bookId": "BOOKID"}']}


def test_publishes_when_kindle_status_changes(urlopen):
    new = {**BOOK, "kindle": {"status": "sent"}}
    old = {**BOOK, "kindle": {"status": "sending"}}

    handler.handler({"Records": [_record(new, old)]}, None)

    assert urlopen.call_count == 1


def test_skips_when_watched_fields_do_not_change(urlopen):
    new = {**BOOK, "status": "reading", "kindle": {"status": "sent"}}
    old = {**BOOK, "status": "unread", "kindle": {"status": "sent"}}

    handler.handler({"Records": [_record(new, old)]}, None)

    urlopen.assert_not_called()


@pytest.mark.parametrize("event_name", ["INSERT", "REMOVE"])
def test_ignores_non_modify_records(urlopen, event_name):
    handler.handler({"Records": [_record(BOOK, {}, event_name)]}, None)

    urlopen.assert_not_called()


def test_ignores_non_book_items(urlopen):
    new = {"PK": "USER#u1", "SK": "SETTINGS", "entity": "SETTINGS", "ingest": "ready"}

    handler.handler({"Records": [_record(new, {**new, "ingest": "pending"})]}, None)

    urlopen.assert_not_called()


def test_raises_when_publish_reports_failures(urlopen):
    urlopen.return_value.__enter__.return_value.read.return_value = (
        b'{"successful": [], "failed": [{"identifier": "x", "index": 0}]}'
    )

    with pytest.raises(RuntimeError):
        handler.handler({"Records": [_record(BOOK, {**BOOK, "ingest": "pending"})]}, None)
