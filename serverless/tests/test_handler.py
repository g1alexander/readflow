import json
from decimal import Decimal
from unittest.mock import patch

from api import handler


def _event(route_key="GET /books", sub="u1"):
    claims = {"sub": sub} if sub else {}
    return {"routeKey": route_key, "requestContext": {"authorizer": {"jwt": {"claims": claims}}}}


def _body(response):
    return json.loads(response["body"])


def test_get_books_returns_the_board():
    with patch.object(handler.books, "list_books", return_value=[{"id": "a"}]) as list_books:
        response = handler.handler(_event(), None)

    list_books.assert_called_once_with("u1")
    assert response["statusCode"] == 200
    assert response["headers"]["content-type"] == "application/json"
    assert _body(response) == {"books": [{"id": "a"}]}


def test_serializes_decimals_as_json_numbers():
    book = {"id": "a", "score": Decimal("4"), "ratio": Decimal("0.5")}
    with patch.object(handler.books, "list_books", return_value=[book]):
        response = handler.handler(_event(), None)

    assert response["body"] == '{"books": [{"id": "a", "score": 4, "ratio": 0.5}]}'


def test_unknown_route_is_not_found():
    response = handler.handler(_event("GET /nope"), None)

    assert response["statusCode"] == 404
    assert _body(response) == {"error": {"code": "not_found", "message": "Route not found"}}


def test_missing_sub_is_unauthorized():
    with patch.object(handler.books, "list_books") as list_books:
        response = handler.handler(_event(sub=None), None)

    list_books.assert_not_called()
    assert response["statusCode"] == 401
    assert _body(response)["error"]["code"] == "unauthorized"


def test_unhandled_error_is_internal_without_details():
    with patch.object(handler.books, "list_books", side_effect=RuntimeError("secret detail")):
        response = handler.handler(_event(), None)

    assert response["statusCode"] == 500
    assert _body(response) == {"error": {"code": "internal", "message": "Internal error"}}
