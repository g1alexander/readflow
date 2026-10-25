from unittest.mock import MagicMock, patch

import pytest
from boto3.dynamodb.types import TypeDeserializer

from api.errors import InvalidRequest
from api.routes import uploads

_deserialize = TypeDeserializer().deserialize


@pytest.fixture
def clients(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", "readflow")
    monkeypatch.setenv("BUCKET_NAME", "epub-bucket")
    dynamodb, s3 = MagicMock(), MagicMock()
    s3.generate_presigned_url.return_value = "https://signed"
    with (
        patch.object(uploads, "_dynamodb", return_value=dynamodb),
        patch.object(uploads, "_s3", return_value=s3),
        patch.object(uploads, "new_ulid", side_effect=["BOOKID", "EVENTID"]),
        patch.object(uploads, "_now", return_value="2026-10-25T10:00:00.000Z"),
    ):
        yield dynamodb, s3


def _puts(dynamodb):
    items = dynamodb.transact_write_items.call_args.kwargs["TransactItems"]
    return [
        {
            **item["Put"],
            "Item": {k: _deserialize(v) for k, v in item["Put"]["Item"].items()},
        }
        for item in items
    ]


def test_creates_a_pending_book_in_toread(clients):
    dynamodb, _ = clients
    result = uploads.create_upload("u1", {"fileName": "Ficciones.EPUB", "size": 482113})

    book = {
        "id": "BOOKID",
        "name": "Ficciones",
        "authors": [],
        "status": "toread",
        "ingest": "pending",
        "epubKey": "users/u1/books/BOOKID/book.epub",
        "epubFileName": "Ficciones.EPUB",
        "createdAt": "2026-10-25T10:00:00.000Z",
        "updatedAt": "2026-10-25T10:00:00.000Z",
    }
    assert result["book"] == book
    book_put, _ = _puts(dynamodb)
    assert book_put["TableName"] == "readflow"
    assert book_put["ConditionExpression"] == "attribute_not_exists(PK)"
    assert book_put["Item"] == {"PK": "USER#u1", "SK": "BOOK#BOOKID", "entity": "BOOK", **book}


def test_writes_the_uploaded_event_in_the_same_transaction(clients):
    dynamodb, _ = clients
    uploads.create_upload("u1", {"fileName": "ficciones.epub", "size": 482113})

    _, event_put = _puts(dynamodb)
    assert event_put["TableName"] == "readflow"
    assert event_put["Item"] == {
        "PK": "BOOK#BOOKID",
        "SK": "EVENT#EVENTID",
        "entity": "EVENT",
        "bookId": "BOOKID",
        "kind": "uploaded",
        "data": {"fileName": "ficciones.epub", "size": 482113},
        "at": "2026-10-25T10:00:00.000Z",
    }


def test_returns_a_signed_put_with_the_epub_content_type(clients):
    _, s3 = clients
    result = uploads.create_upload("u1", {"fileName": "ficciones.epub", "size": 1})

    s3.generate_presigned_url.assert_called_once_with(
        "put_object",
        Params={
            "Bucket": "epub-bucket",
            "Key": "users/u1/books/BOOKID/book.epub",
            "ContentType": "application/epub+zip",
        },
        ExpiresIn=900,
    )
    assert result["upload"] == {
        "url": "https://signed",
        "method": "PUT",
        "headers": {"content-type": "application/epub+zip"},
        "expiresIn": 900,
    }


@pytest.mark.parametrize(
    "body",
    [
        {"size": 1},
        {"fileName": 3, "size": 1},
        {"fileName": "libro.pdf", "size": 1},
        {"fileName": ".epub", "size": 1},
        {"fileName": "a" * 251 + ".epub", "size": 1},
        {"fileName": "libro.epub"},
        {"fileName": "libro.epub", "size": "1"},
        {"fileName": "libro.epub", "size": True},
        {"fileName": "libro.epub", "size": 1.5},
        {"fileName": "libro.epub", "size": 0},
        {"fileName": "libro.epub", "size": 100 * 1024 * 1024 + 1},
    ],
)
def test_rejects_invalid_bodies_without_writing(clients, body):
    dynamodb, s3 = clients
    with pytest.raises(InvalidRequest):
        uploads.create_upload("u1", body)

    dynamodb.transact_write_items.assert_not_called()
    s3.generate_presigned_url.assert_not_called()


def test_accepts_the_max_size(clients):
    result = uploads.create_upload("u1", {"fileName": "a.epub", "size": 100 * 1024 * 1024})

    assert result["book"]["id"] == "BOOKID"
