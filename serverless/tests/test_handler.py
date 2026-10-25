import base64
import json
from decimal import Decimal
from unittest.mock import patch

import pytest

from api import handler
from api.errors import InvalidRequest


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


def _post(body, **extra):
    return {**_event("POST /uploads"), "body": body, **extra}


def test_post_uploads_creates_the_book():
    created = {"book": {"id": "a"}, "upload": {"url": "https://signed"}}
    with patch.object(handler.uploads, "create_upload", return_value=created) as create_upload:
        response = handler.handler(_post('{"fileName": "a.epub", "size": 1}'), None)

    create_upload.assert_called_once_with("u1", {"fileName": "a.epub", "size": 1})
    assert response["statusCode"] == 201
    assert _body(response) == created


def test_decodes_base64_bodies():
    raw = base64.b64encode(b'{"fileName": "a.epub", "size": 1}').decode()
    with patch.object(handler.uploads, "create_upload", return_value={}) as create_upload:
        handler.handler(_post(raw, isBase64Encoded=True), None)

    create_upload.assert_called_once_with("u1", {"fileName": "a.epub", "size": 1})


@pytest.mark.parametrize("body", [None, "", "not json", "[1]"])
def test_bad_body_is_invalid_request(body):
    with patch.object(handler.uploads, "create_upload") as create_upload:
        response = handler.handler(_post(body), None)

    create_upload.assert_not_called()
    assert response["statusCode"] == 400
    assert _body(response)["error"]["code"] == "invalid_request"


def test_validation_error_is_invalid_request():
    error = InvalidRequest("size must be an integer")
    with patch.object(handler.uploads, "create_upload", side_effect=error):
        response = handler.handler(_post('{"fileName": "a.epub"}'), None)

    assert response["statusCode"] == 400
    assert _body(response) == {
        "error": {"code": "invalid_request", "message": "size must be an integer"}
    }
