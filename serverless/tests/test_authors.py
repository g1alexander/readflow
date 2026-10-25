from unittest.mock import MagicMock, patch

from api import db
from api.routes import authors


def test_lists_the_user_authors():
    table = MagicMock()
    table.query.return_value = {
        "Items": [
            {
                "PK": "USER#u1",
                "SK": "AUTHOR#jorge-luis-borges",
                "entity": "AUTHOR",
                "id": "jorge-luis-borges",
                "name": "Jorge Luis Borges",
                "createdAt": "2026-10-25T10:00:00.000Z",
            }
        ]
    }
    with patch.object(db, "table", return_value=table):
        result = authors.list_authors("u1")

    assert result == [{"id": "jorge-luis-borges", "name": "Jorge Luis Borges"}]
    pk, sk = table.query.call_args.kwargs["KeyConditionExpression"].get_expression()["values"]
    assert pk.get_expression()["values"][1] == "USER#u1"
    assert sk.get_expression()["values"][1] == "AUTHOR#"
