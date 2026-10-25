from unittest.mock import MagicMock, patch

import pytest
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError
from epub_factory import build_epub

from metadata import handler

_deserialize = TypeDeserializer().deserialize

KEY = "users/u1/books/BOOKID/book.epub"
NOW = "2026-10-25T10:00:00.000Z"


def _event(key=KEY, size=482113):
    return {"detail": {"bucket": {"name": "epub-bucket"}, "object": {"key": key, "size": size}}}


def _client_error(code, **response):
    return ClientError({"Error": {"Code": code, "Message": code}, **response}, "Op")


@pytest.fixture
def clients(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", "readflow")
    monkeypatch.setenv("BUCKET_NAME", "epub-bucket")
    dynamodb, s3 = MagicMock(), MagicMock()
    with (
        patch.object(handler, "_dynamodb", return_value=dynamodb),
        patch.object(handler, "_s3", return_value=s3),
        patch.object(handler, "new_ulid", return_value="EVENTID"),
        patch.object(handler, "_now", return_value=NOW),
    ):
        yield dynamodb, s3


def _upload(s3, data):
    s3.get_object.return_value = {"Body": MagicMock(read=MagicMock(return_value=data))}


def _transaction(dynamodb):
    update, put = dynamodb.transact_write_items.call_args.kwargs["TransactItems"]
    update = update["Update"]
    names = update["ExpressionAttributeNames"]
    values = {k: _deserialize(v) for k, v in update["ExpressionAttributeValues"].items()}
    assignments = update["UpdateExpression"].removeprefix("SET ").split(", ")
    fields = {names[name]: values[value] for name, value in (a.split(" = ") for a in assignments)}
    item = {k: _deserialize(v) for k, v in put["Put"]["Item"].items()}
    return update, fields, item


FICCIONES = build_epub(
    "<dc:title>Ficciones</dc:title>"
    "<dc:creator>Jorge Luis Borges</dc:creator>"
    "<dc:creator>jorge  luis borges</dc:creator>"
    "<dc:creator>¿?</dc:creator>"
    "<dc:date>1944</dc:date>",
    '<item id="c" href="c.jpg" media-type="image/jpeg" properties="cover-image"/>',
    {"OEBPS/c.jpg": b"jpg"},
)


def test_marks_the_book_ready_with_its_metadata(clients):
    dynamodb, s3 = clients
    _upload(s3, FICCIONES)

    handler.handler(_event(), None)

    s3.get_object.assert_called_once_with(Bucket="epub-bucket", Key=KEY)
    update, fields, event = _transaction(dynamodb)
    assert update["TableName"] == "readflow"
    assert {k: _deserialize(v) for k, v in update["Key"].items()} == {
        "PK": "USER#u1",
        "SK": "BOOK#BOOKID",
    }
    assert update["ConditionExpression"] == "#ingest = :pending"
    assert _deserialize(update["ExpressionAttributeValues"][":pending"]) == "pending"
    assert fields == {
        "name": "Ficciones",
        "authors": [{"id": "jorge-luis-borges", "name": "Jorge Luis Borges"}],
        "year": 1944,
        "coverKey": "users/u1/books/BOOKID/cover.jpg",
        "epubSize": 482113,
        "ingest": "ready",
        "updatedAt": NOW,
    }
    assert event == {
        "PK": "BOOK#BOOKID",
        "SK": "EVENT#EVENTID",
        "entity": "EVENT",
        "bookId": "BOOKID",
        "kind": "ingest_ready",
        "data": {},
        "at": NOW,
    }


def test_uploads_the_cover(clients):
    _, s3 = clients
    _upload(s3, FICCIONES)

    handler.handler(_event(), None)

    s3.put_object.assert_called_once_with(
        Bucket="epub-bucket",
        Key="users/u1/books/BOOKID/cover.jpg",
        Body=b"jpg",
        ContentType="image/jpeg",
    )


def test_creates_each_author_once_if_missing(clients):
    dynamodb, s3 = clients
    _upload(s3, FICCIONES)

    handler.handler(_event(), None)

    dynamodb.put_item.assert_called_once()
    call = dynamodb.put_item.call_args.kwargs
    assert call["ConditionExpression"] == "attribute_not_exists(SK)"
    assert {k: _deserialize(v) for k, v in call["Item"].items()} == {
        "PK": "USER#u1",
        "SK": "AUTHOR#jorge-luis-borges",
        "entity": "AUTHOR",
        "id": "jorge-luis-borges",
        "name": "Jorge Luis Borges",
        "createdAt": NOW,
    }


def test_reuses_the_canonical_name_of_an_existing_author(clients):
    dynamodb, s3 = clients
    _upload(s3, FICCIONES)
    dynamodb.put_item.side_effect = _client_error(
        "ConditionalCheckFailedException", Item={"name": {"S": "J. L. Borges"}}
    )

    handler.handler(_event(), None)

    _, fields, _ = _transaction(dynamodb)
    assert fields["authors"] == [{"id": "jorge-luis-borges", "name": "J. L. Borges"}]


def test_propagates_other_author_errors(clients):
    dynamodb, s3 = clients
    _upload(s3, FICCIONES)
    dynamodb.put_item.side_effect = _client_error("ProvisionedThroughputExceededException")

    with pytest.raises(ClientError):
        handler.handler(_event(), None)

    dynamodb.transact_write_items.assert_not_called()


def test_keeps_the_upload_name_without_title_year_or_cover(clients):
    dynamodb, s3 = clients
    _upload(s3, build_epub())

    handler.handler(_event(), None)

    _, fields, _ = _transaction(dynamodb)
    assert fields == {"authors": [], "epubSize": 482113, "ingest": "ready", "updatedAt": NOW}
    s3.put_object.assert_not_called()


def test_marks_invalid_epubs_failed(clients):
    dynamodb, s3 = clients
    _upload(s3, b"not a zip")

    handler.handler(_event(), None)

    update, fields, event = _transaction(dynamodb)
    assert update["ConditionExpression"] == "#ingest = :pending"
    assert fields == {
        "epubSize": 482113,
        "ingest": "failed",
        "ingestError": "not a zip file",
        "updatedAt": NOW,
    }
    assert event["kind"] == "ingest_failed"
    assert event["data"] == {"error": "not a zip file"}
    dynamodb.put_item.assert_not_called()
    s3.put_object.assert_not_called()


def test_skips_books_that_are_no_longer_pending(clients):
    dynamodb, s3 = clients
    _upload(s3, FICCIONES)
    dynamodb.transact_write_items.side_effect = _client_error(
        "TransactionCanceledException",
        CancellationReasons=[{"Code": "ConditionalCheckFailed"}, {"Code": "None"}],
    )

    handler.handler(_event(), None)


def test_propagates_other_transaction_errors(clients):
    dynamodb, s3 = clients
    _upload(s3, FICCIONES)
    dynamodb.transact_write_items.side_effect = _client_error(
        "TransactionCanceledException",
        CancellationReasons=[{"Code": "ThrottlingError"}, {"Code": "None"}],
    )

    with pytest.raises(ClientError):
        handler.handler(_event(), None)


def test_propagates_s3_errors(clients):
    _, s3 = clients
    s3.get_object.side_effect = _client_error("AccessDenied")

    with pytest.raises(ClientError):
        handler.handler(_event(), None)


@pytest.mark.parametrize(
    "key", ["users/u1/books/BOOKID/cover.jpg", "users/u1/books/a/b/book.epub", "book.epub"]
)
def test_ignores_unexpected_keys(clients, key):
    dynamodb, s3 = clients

    handler.handler(_event(key), None)

    s3.get_object.assert_not_called()
    dynamodb.transact_write_items.assert_not_called()
