from unittest.mock import MagicMock, patch

import pytest
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.exceptions import ClientError

from kindle import handler

_serialize = TypeSerializer().serialize
_deserialize = TypeDeserializer().deserialize

REQ = "2026-11-02T10:00:00.000Z"
NOW = "2026-11-02T10:00:05.000Z"
EPUB_KEY = "users/u1/books/BOOKID/book.epub"
BOOK = {
    "PK": "USER#u1",
    "SK": "BOOK#BOOKID",
    "entity": "BOOK",
    "id": "BOOKID",
    "name": "Ficciones",
    "epubKey": EPUB_KEY,
    "ingest": "ready",
}


def _image(item):
    return {k: _serialize(v) for k, v in item.items()}


def _event(new, old):
    return {"Records": [{"dynamodb": {"NewImage": _image(new), "OldImage": _image(old)}}]}


def _request(old_kindle=None, old_ingest="ready"):
    new = {**BOOK, "kindle": {"requestedAt": REQ, "status": "sending"}}
    old = {**BOOK, "ingest": old_ingest}
    if old_kindle:
        old["kindle"] = old_kindle
    return _event(new, old)


def _client_error(code, **response):
    return ClientError({"Error": {"Code": code, "Message": "boom"}, **response}, "Op")


@pytest.fixture
def clients(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", "readflow")
    monkeypatch.setenv("BUCKET_NAME", "epub-bucket")
    monkeypatch.setenv("SENDER_ADDRESS", "kindle@example.com")
    dynamodb, s3, ses = MagicMock(), MagicMock(), MagicMock()
    dynamodb.get_item.return_value = {"Item": {"kindleEmail": {"S": "me@kindle.com"}}}
    s3.get_object.return_value = {
        "ContentLength": 3,
        "Body": MagicMock(read=MagicMock(return_value=b"zip")),
    }
    with (
        patch.object(handler, "_dynamodb", return_value=dynamodb),
        patch.object(handler, "_s3", return_value=s3),
        patch.object(handler, "_sesv2", return_value=ses),
        patch.object(handler, "new_ulid", return_value="EVENTID"),
        patch.object(handler, "_now", return_value=NOW),
    ):
        yield dynamodb, s3, ses


def _result(dynamodb):
    update, put = dynamodb.transact_write_items.call_args.kwargs["TransactItems"]
    update = update["Update"]
    names = update["ExpressionAttributeNames"]
    values = {k: _deserialize(v) for k, v in update["ExpressionAttributeValues"].items()}
    fields = {}
    for assignment in update["UpdateExpression"].removeprefix("SET ").split(", "):
        path, value = assignment.split(" = ")
        fields[".".join(names[part] for part in path.split("."))] = values[value]
    item = {k: _deserialize(v) for k, v in put["Put"]["Item"].items()}
    return update, values, fields, item


def test_sends_the_epub_and_marks_it_sent(clients):
    dynamodb, s3, ses = clients

    handler.handler(_request(), None)

    claim = dynamodb.update_item.call_args.kwargs
    assert claim["UpdateExpression"] == "SET #kindle.#processedFor = :req, #updatedAt = :now"
    assert _deserialize(claim["ExpressionAttributeValues"][":req"]) == REQ
    assert "#kindle.#requestedAt = :req" in claim["ConditionExpression"]
    s3.get_object.assert_called_once_with(Bucket="epub-bucket", Key=EPUB_KEY)
    send = ses.send_email.call_args.kwargs
    assert send["FromEmailAddress"] == "kindle@example.com"
    assert send["Destination"] == {"ToAddresses": ["me@kindle.com"]}
    raw = send["Content"]["Raw"]["Data"]
    assert b"Subject: Ficciones" in raw
    assert b'filename="ficciones.epub"' in raw
    assert b"Content-Type: application/epub+zip" in raw
    update, values, fields, event = _result(dynamodb)
    assert update["ConditionExpression"] == "#kindle.#requestedAt = :req"
    assert values[":req"] == REQ
    assert fields == {"kindle.status": "sent", "kindle.at": NOW, "updatedAt": NOW}
    assert event == {
        "PK": "BOOK#BOOKID",
        "SK": "EVENT#EVENTID",
        "entity": "EVENT",
        "bookId": "BOOKID",
        "kind": "kindle_sent",
        "data": {},
        "at": NOW,
    }


def test_sends_a_request_made_while_ingest_was_pending(clients):
    _, _, ses = clients

    handler.handler(_request({"requestedAt": REQ, "status": "sending"}, old_ingest="pending"), None)

    ses.send_email.assert_called_once()


def test_ignores_writes_that_are_not_a_new_request(clients):
    dynamodb, _, ses = clients

    handler.handler(_request({"requestedAt": REQ, "status": "sending"}), None)

    dynamodb.update_item.assert_not_called()
    ses.send_email.assert_not_called()
    dynamodb.transact_write_items.assert_not_called()


def test_skips_a_request_already_taken(clients):
    dynamodb, _, ses = clients
    dynamodb.update_item.side_effect = _client_error("ConditionalCheckFailedException")

    handler.handler(_request(), None)

    ses.send_email.assert_not_called()
    dynamodb.transact_write_items.assert_not_called()


@pytest.mark.parametrize(
    "setup, error",
    [
        (lambda d, s, e: d.get_item.configure_mock(return_value={}), "kindle_email_missing"),
        (
            lambda d, s, e: s.get_object.return_value.update(ContentLength=28 * 1024 * 1024 + 1),
            "too_large",
        ),
        (
            lambda d, s, e: setattr(e.send_email, "side_effect", _client_error("MessageRejected")),
            "ses_error",
        ),
    ],
)
def test_marks_failures_as_failed(clients, setup, error):
    dynamodb, s3, ses = clients
    setup(dynamodb, s3, ses)

    handler.handler(_request(), None)

    _, _, fields, event = _result(dynamodb)
    assert fields == {
        "kindle.status": "failed",
        "kindle.at": NOW,
        "kindle.error": error,
        "updatedAt": NOW,
    }
    assert event["kind"] == "kindle_failed"
    assert event["data"] == {"error": error}
    if error != "ses_error":
        ses.send_email.assert_not_called()


def test_does_not_overwrite_a_newer_request(clients):
    dynamodb, _, _ = clients
    dynamodb.transact_write_items.side_effect = _client_error(
        "TransactionCanceledException",
        CancellationReasons=[{"Code": "ConditionalCheckFailed"}, {"Code": "None"}],
    )

    handler.handler(_request(), None)


def test_releases_the_claim_when_the_lambda_crashes(clients):
    dynamodb, s3, _ = clients
    s3.get_object.side_effect = _client_error("InternalError")

    with pytest.raises(ClientError):
        handler.handler(_request(), None)

    release = dynamodb.update_item.call_args.kwargs
    assert release["UpdateExpression"] == "REMOVE #kindle.#processedFor"
    dynamodb.transact_write_items.assert_not_called()


def test_releases_the_claim_when_the_result_cannot_be_written(clients):
    dynamodb, _, _ = clients
    dynamodb.transact_write_items.side_effect = _client_error("ThrottlingException")

    with pytest.raises(ClientError):
        handler.handler(_request(), None)

    release = dynamodb.update_item.call_args.kwargs
    assert release["UpdateExpression"] == "REMOVE #kindle.#processedFor"


def test_flattens_line_breaks_in_the_subject(clients):
    _, _, ses = clients
    event = _request()
    event["Records"][0]["dynamodb"]["NewImage"]["name"] = {"S": "Fic\nciones"}

    handler.handler(event, None)

    assert b"Subject: Fic ciones" in ses.send_email.call_args.kwargs["Content"]["Raw"]["Data"]
