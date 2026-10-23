from unittest.mock import MagicMock, patch

from api.routes import books


def _book(book_id):
    return {"PK": "USER#u1", "SK": f"BOOK#{book_id}", "entity": "BOOK", "id": book_id}


def test_queries_the_user_board_partition():
    table = MagicMock()
    table.query.return_value = {"Items": []}
    with patch.object(books, "_table", return_value=table):
        assert books.list_books("u1") == []

    condition = table.query.call_args.kwargs["KeyConditionExpression"]
    expression = condition.get_expression()
    assert expression["operator"] == "AND"
    pk, sk = expression["values"]
    assert pk.get_expression()["values"][1] == "USER#u1"
    assert sk.get_expression()["operator"] == "begins_with"
    assert sk.get_expression()["values"][1] == "BOOK#"


def test_reads_every_page():
    table = MagicMock()
    table.query.side_effect = [
        {"Items": [_book("a")], "LastEvaluatedKey": {"PK": "USER#u1", "SK": "BOOK#a"}},
        {"Items": [_book("b")]},
    ]
    with patch.object(books, "_table", return_value=table):
        result = books.list_books("u1")

    assert [b["id"] for b in result] == ["a", "b"]
    assert "ExclusiveStartKey" not in table.query.call_args_list[0].kwargs
    assert table.query.call_args_list[1].kwargs["ExclusiveStartKey"] == {
        "PK": "USER#u1",
        "SK": "BOOK#a",
    }


def test_strips_storage_keys():
    table = MagicMock()
    table.query.return_value = {"Items": [_book("a")]}
    with patch.object(books, "_table", return_value=table):
        assert books.list_books("u1") == [{"id": "a"}]
