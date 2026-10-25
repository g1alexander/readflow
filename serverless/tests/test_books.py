from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

from api import db
from api.errors import Conflict, InvalidRequest, NotFound
from api.routes import books

NOW = "2026-10-25T10:00:00.000Z"

_deserialize = TypeDeserializer().deserialize


def _book(book_id="a", **attributes):
    return {
        "PK": "USER#u1",
        "SK": f"BOOK#{book_id}",
        "entity": "BOOK",
        "id": book_id,
        "status": "toread",
        "ingest": "ready",
        **attributes,
    }


def _plain(item):
    return {k: _deserialize(v) for k, v in item.items()}


def _client_error(code, **response):
    return ClientError({"Error": {"Code": code}, **response}, "Operation")


@pytest.fixture
def aws(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", "readflow")
    monkeypatch.setenv("BUCKET_NAME", "epub-bucket")
    table, dynamodb, s3 = MagicMock(), MagicMock(), MagicMock()
    table.query.return_value = {"Items": []}
    table.get_item.return_value = {}
    s3.generate_presigned_url.side_effect = lambda op, Params, ExpiresIn: f"https://{Params['Key']}"
    with (
        patch.object(db, "table", return_value=table),
        patch.object(db, "now", return_value=NOW),
        patch.object(books, "_dynamodb", return_value=dynamodb),
        patch.object(books, "_s3", return_value=s3),
        patch.object(books, "new_ulid", side_effect=["EV1", "EV2"]),
    ):
        yield table, dynamodb, s3


def _items(table, book=None, settings=None):
    def get_item(Key):
        if Key["SK"] == "SETTINGS":
            return {"Item": settings} if settings else {}
        return {"Item": book} if book else {}

    table.get_item.side_effect = get_item


def _transaction(dynamodb):
    items = dynamodb.transact_write_items.call_args.kwargs["TransactItems"]
    update = items[0]["Update"]
    puts = [_plain(item["Put"]["Item"]) for item in items[1:]]
    return update, puts


def test_queries_the_user_board_partition(aws):
    table, _, _ = aws
    assert books.list_books("u1") == []

    condition = table.query.call_args.kwargs["KeyConditionExpression"]
    expression = condition.get_expression()
    assert expression["operator"] == "AND"
    pk, sk = expression["values"]
    assert pk.get_expression()["values"][1] == "USER#u1"
    assert sk.get_expression()["operator"] == "begins_with"
    assert sk.get_expression()["values"][1] == "BOOK#"


def test_reads_every_page(aws):
    table, _, _ = aws
    table.query.side_effect = [
        {"Items": [_book("a")], "LastEvaluatedKey": {"PK": "USER#u1", "SK": "BOOK#a"}},
        {"Items": [_book("b")]},
    ]
    result = books.list_books("u1")

    assert [b["id"] for b in result] == ["a", "b"]
    assert "ExclusiveStartKey" not in table.query.call_args_list[0].kwargs
    assert table.query.call_args_list[1].kwargs["ExclusiveStartKey"] == {
        "PK": "USER#u1",
        "SK": "BOOK#a",
    }


def test_strips_storage_keys(aws):
    table, _, s3 = aws
    table.query.return_value = {"Items": [_book("a")]}

    assert books.list_books("u1") == [{"id": "a", "status": "toread", "ingest": "ready"}]
    s3.generate_presigned_url.assert_not_called()


def test_signs_a_cover_url_when_there_is_a_cover_key(aws):
    table, _, s3 = aws
    table.query.return_value = {"Items": [_book("a", coverKey="users/u1/books/a/cover.jpg")]}

    [book] = books.list_books("u1")

    assert book["coverUrl"] == "https://users/u1/books/a/cover.jpg"
    s3.generate_presigned_url.assert_called_once_with(
        "get_object",
        Params={"Bucket": "epub-bucket", "Key": "users/u1/books/a/cover.jpg"},
        ExpiresIn=3600,
    )


def test_get_book_returns_the_book_and_its_events_newest_first(aws):
    table, _, _ = aws
    _items(table, book=_book("a"))
    table.query.return_value = {
        "Items": [
            {
                "PK": "BOOK#a",
                "SK": "EVENT#E2",
                "entity": "EVENT",
                "bookId": "a",
                "kind": "status_changed",
                "data": {"from": "toread", "to": "upnext"},
                "at": NOW,
            }
        ]
    }

    result = books.get_book("u1", "a")

    assert result == {
        "book": {"id": "a", "status": "toread", "ingest": "ready"},
        "events": [
            {
                "id": "E2",
                "kind": "status_changed",
                "data": {"from": "toread", "to": "upnext"},
                "at": NOW,
            }
        ],
    }
    table.get_item.assert_called_once_with(Key={"PK": "USER#u1", "SK": "BOOK#a"})
    query = table.query.call_args.kwargs
    assert query["ScanIndexForward"] is False
    pk, _ = query["KeyConditionExpression"].get_expression()["values"]
    assert pk.get_expression()["values"][1] == "BOOK#a"


def test_get_missing_book_is_not_found_without_reading_events(aws):
    table, _, _ = aws
    with pytest.raises(NotFound):
        books.get_book("u1", "a")

    table.query.assert_not_called()


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"color": "red"},
        {"status": "nope"},
        {"status": ["reading"]},
        {"status": None},
        {"name": ""},
        {"name": "   "},
        {"name": "a" * 301},
        {"name": None},
        {"authors": []},
        {"authors": "Borges"},
        {"authors": ["a"] * 11},
        {"authors": ["¿?"]},
        {"authors": [3]},
        {"authors": None},
        {"type": "poetry"},
        {"score": 0},
        {"score": 6},
        {"score": 4.5},
        {"score": True},
        {"year": -1},
        {"year": datetime.now(UTC).year + 1},
        {"year": "1944"},
    ],
)
def test_patch_rejects_invalid_bodies_without_reading_or_writing(aws, body):
    table, dynamodb, _ = aws
    with pytest.raises(InvalidRequest):
        books.patch_book("u1", "a", body)

    table.get_item.assert_not_called()
    table.update_item.assert_not_called()
    dynamodb.transact_write_items.assert_not_called()


def test_patch_missing_book_is_not_found(aws):
    table, dynamodb, _ = aws
    with pytest.raises(NotFound):
        books.patch_book("u1", "a", {"score": 4})

    table.update_item.assert_not_called()
    dynamodb.put_item.assert_not_called()


def test_patch_fields_updates_the_book_in_place(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a"))
    table.update_item.return_value = {"Attributes": _book("a", score=4, year=1944)}

    result = books.patch_book("u1", "a", {"score": 4, "year": 1944, "type": None})

    assert result == {"id": "a", "status": "toread", "ingest": "ready", "score": 4, "year": 1944}
    table.update_item.assert_called_once_with(
        Key={"PK": "USER#u1", "SK": "BOOK#a"},
        ConditionExpression="attribute_exists(PK)",
        ReturnValues="ALL_NEW",
        UpdateExpression="SET #score = :score, #year = :year, #updatedAt = :updatedAt REMOVE #type",
        ExpressionAttributeNames={
            "#score": "score",
            "#year": "year",
            "#type": "type",
            "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues={":score": 4, ":year": 1944, ":updatedAt": NOW},
    )
    dynamodb.transact_write_items.assert_not_called()


def test_patch_book_deleted_meanwhile_is_not_found(aws):
    table, _, _ = aws
    _items(table, book=_book("a"))
    table.update_item.side_effect = _client_error("ConditionalCheckFailedException")

    with pytest.raises(NotFound):
        books.patch_book("u1", "a", {"score": 4})


def test_patch_authors_creates_missing_authors_and_reuses_canonical_names(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a"))
    table.update_item.return_value = {"Attributes": _book("a")}
    dynamodb.put_item.side_effect = [
        _client_error(
            "ConditionalCheckFailedException",
            Item={"name": {"S": "Jorge Luis Borges"}},
        ),
        None,
    ]

    books.patch_book(
        "u1", "a", {"authors": [" jorge  luis borges ", "Adolfo Bioy Casares", "JORGE LUIS BORGES"]}
    )

    puts = [_plain(call.kwargs["Item"]) for call in dynamodb.put_item.call_args_list]
    assert [put["SK"] for put in puts] == [
        "AUTHOR#jorge-luis-borges",
        "AUTHOR#adolfo-bioy-casares",
    ]
    assert puts[1] == {
        "PK": "USER#u1",
        "SK": "AUTHOR#adolfo-bioy-casares",
        "entity": "AUTHOR",
        "id": "adolfo-bioy-casares",
        "name": "Adolfo Bioy Casares",
        "createdAt": NOW,
    }
    assert dynamodb.put_item.call_args.kwargs["ConditionExpression"] == ("attribute_not_exists(SK)")
    assert table.update_item.call_args.kwargs["ExpressionAttributeValues"][":authors"] == [
        {"id": "jorge-luis-borges", "name": "Jorge Luis Borges"},
        {"id": "adolfo-bioy-casares", "name": "Adolfo Bioy Casares"},
    ]


def test_patch_status_writes_the_change_and_its_event_in_one_transaction(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a"))

    books.patch_book("u1", "a", {"status": "finished", "score": 5})

    update, puts = _transaction(dynamodb)
    assert update["TableName"] == "readflow"
    assert update["Key"] == {"PK": {"S": "USER#u1"}, "SK": {"S": "BOOK#a"}}
    assert update["ConditionExpression"] == "attribute_exists(PK)"
    assert update["UpdateExpression"] == (
        "SET #status = :status, #score = :score, #updatedAt = :updatedAt"
    )
    assert _plain(update["ExpressionAttributeValues"]) == {
        ":status": "finished",
        ":score": 5,
        ":updatedAt": NOW,
    }
    assert puts == [
        {
            "PK": "BOOK#a",
            "SK": "EVENT#EV1",
            "entity": "EVENT",
            "bookId": "a",
            "kind": "status_changed",
            "data": {"from": "toread", "to": "finished"},
            "at": NOW,
        }
    ]
    table.update_item.assert_not_called()


@pytest.mark.parametrize("ingest", ["ready", "pending"])
def test_patch_to_reading_requests_a_kindle_delivery(aws, ingest):
    table, dynamodb, _ = aws
    _items(table, book=_book("a", ingest=ingest), settings={"kindleEmail": "me@kindle.com"})

    books.patch_book("u1", "a", {"status": "reading"})

    update, puts = _transaction(dynamodb)
    assert _plain(update["ExpressionAttributeValues"])[":kindle"] == {
        "requestedAt": NOW,
        "status": "sending",
    }
    assert [put["kind"] for put in puts] == ["status_changed", "kindle_requested"]
    assert puts[1]["data"] == {}


def test_patch_to_reading_without_kindle_email_is_a_conflict(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a"))

    with pytest.raises(Conflict) as error:
        books.patch_book("u1", "a", {"status": "reading", "authors": ["Borges"]})

    assert error.value.code == "kindle_email_missing"
    dynamodb.put_item.assert_not_called()
    dynamodb.transact_write_items.assert_not_called()


def test_patch_to_reading_with_failed_ingest_is_a_conflict(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a", ingest="failed"), settings={"kindleEmail": "me@kindle.com"})

    with pytest.raises(Conflict) as error:
        books.patch_book("u1", "a", {"status": "reading"})

    assert error.value.code == "ingest_failed"
    dynamodb.transact_write_items.assert_not_called()


def test_patch_to_the_current_status_writes_nothing(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a", status="reading"))

    result = books.patch_book("u1", "a", {"status": "reading"})

    assert result["status"] == "reading"
    table.update_item.assert_not_called()
    dynamodb.transact_write_items.assert_not_called()


def test_transaction_cancelled_by_the_condition_is_not_found(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a"))
    dynamodb.transact_write_items.side_effect = _client_error(
        "TransactionCanceledException",
        CancellationReasons=[{"Code": "ConditionalCheckFailed"}, {"Code": "None"}],
    )

    with pytest.raises(NotFound):
        books.patch_book("u1", "a", {"status": "finished"})


def test_resend_kindle_requests_a_new_delivery(aws):
    table, dynamodb, _ = aws
    _items(table, book=_book("a", status="finished"), settings={"kindleEmail": "me@kindle.com"})

    result = books.resend_kindle("u1", "a")

    assert result["id"] == "a"
    update, puts = _transaction(dynamodb)
    assert update["UpdateExpression"] == "SET #kindle = :kindle, #updatedAt = :updatedAt"
    assert [put["kind"] for put in puts] == ["kindle_requested"]


@pytest.mark.parametrize(
    ("book", "settings", "code"),
    [
        (_book("a"), None, "kindle_email_missing"),
        (_book("a", ingest="failed"), {"kindleEmail": "me@kindle.com"}, "ingest_failed"),
    ],
)
def test_resend_kindle_conflicts(aws, book, settings, code):
    table, dynamodb, _ = aws
    _items(table, book=book, settings=settings)

    with pytest.raises(Conflict) as error:
        books.resend_kindle("u1", "a")

    assert error.value.code == code
    dynamodb.transact_write_items.assert_not_called()


def test_resend_kindle_missing_book_is_not_found(aws):
    with pytest.raises(NotFound):
        books.resend_kindle("u1", "a")


def test_delete_removes_the_s3_prefix_then_the_events_then_the_book(aws):
    table, _, s3 = aws
    _items(table, book=_book("a"))
    s3.get_paginator.return_value.paginate.return_value = [
        {"Contents": [{"Key": "users/u1/books/a/book.epub"}, {"Key": "users/u1/books/a/cover.jpg"}]}
    ]
    s3.delete_objects.return_value = {}
    table.query.return_value = {"Items": [{"PK": "BOOK#a", "SK": "EVENT#E1"}]}
    batch = table.batch_writer.return_value.__enter__.return_value
    calls = MagicMock()
    calls.attach_mock(s3.delete_objects, "s3")
    calls.attach_mock(batch.delete_item, "event")
    calls.attach_mock(table.delete_item, "book")

    assert books.delete_book("u1", "a") is None

    s3.get_paginator.assert_called_once_with("list_objects_v2")
    s3.get_paginator.return_value.paginate.assert_called_once_with(
        Bucket="epub-bucket", Prefix="users/u1/books/a/"
    )
    assert [call[0] for call in calls.mock_calls] == ["s3", "event", "book"]
    calls.s3.assert_called_once_with(
        Bucket="epub-bucket",
        Delete={
            "Objects": [
                {"Key": "users/u1/books/a/book.epub"},
                {"Key": "users/u1/books/a/cover.jpg"},
            ],
            "Quiet": True,
        },
    )
    calls.event.assert_called_once_with(Key={"PK": "BOOK#a", "SK": "EVENT#E1"})
    calls.book.assert_called_once_with(Key={"PK": "USER#u1", "SK": "BOOK#a"})


def test_delete_keeps_the_book_if_s3_fails(aws):
    table, _, s3 = aws
    _items(table, book=_book("a"))
    s3.get_paginator.return_value.paginate.return_value = [
        {"Contents": [{"Key": "users/u1/books/a/book.epub"}]}
    ]
    s3.delete_objects.return_value = {"Errors": [{"Key": "users/u1/books/a/book.epub"}]}

    with pytest.raises(RuntimeError):
        books.delete_book("u1", "a")

    table.delete_item.assert_not_called()


def test_delete_missing_book_is_not_found_without_touching_s3(aws):
    table, _, s3 = aws
    with pytest.raises(NotFound):
        books.delete_book("u1", "a")

    s3.get_paginator.assert_not_called()
    table.delete_item.assert_not_called()
