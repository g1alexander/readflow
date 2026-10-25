import base64
import json
from decimal import Decimal
from unittest.mock import patch

import pytest

from api import handler
from api.errors import Conflict, InvalidRequest, NotFound


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


def _book_event(route_key, book_id="b1", **extra):
    return {**_event(route_key), "pathParameters": {"id": book_id}, **extra}


def test_get_book_passes_the_path_id():
    detail = {"book": {"id": "b1"}, "events": []}
    with patch.object(handler.books, "get_book", return_value=detail) as get_book:
        response = handler.handler(_book_event("GET /books/{id}"), None)

    get_book.assert_called_once_with("u1", "b1")
    assert response["statusCode"] == 200
    assert _body(response) == detail


def test_patch_book_returns_the_updated_book():
    with patch.object(handler.books, "patch_book", return_value={"id": "b1"}) as patch_book:
        response = handler.handler(
            _book_event("PATCH /books/{id}", body='{"status": "finished"}'), None
        )

    patch_book.assert_called_once_with("u1", "b1", {"status": "finished"})
    assert response["statusCode"] == 200
    assert _body(response) == {"book": {"id": "b1"}}


def test_resend_kindle_returns_the_book():
    with patch.object(handler.books, "resend_kindle", return_value={"id": "b1"}) as resend:
        response = handler.handler(_book_event("POST /books/{id}/kindle"), None)

    resend.assert_called_once_with("u1", "b1")
    assert _body(response) == {"book": {"id": "b1"}}


def test_delete_book_is_no_content():
    with patch.object(handler.books, "delete_book", return_value=None) as delete_book:
        response = handler.handler(_book_event("DELETE /books/{id}"), None)

    delete_book.assert_called_once_with("u1", "b1")
    assert response == {"statusCode": 204}


def test_settings_routes():
    with (
        patch.object(handler.settings, "get_settings", return_value={}) as get_settings,
        patch.object(handler.settings, "put_settings", return_value={}) as put_settings,
    ):
        handler.handler(_event("GET /settings"), None)
        handler.handler({**_event("PUT /settings"), "body": '{"kindleEmail": null}'}, None)

    get_settings.assert_called_once_with("u1")
    put_settings.assert_called_once_with("u1", {"kindleEmail": None})


def test_get_authors():
    authors = [{"id": "borges", "name": "Borges"}]
    with patch.object(handler.authors, "list_authors", return_value=authors):
        response = handler.handler(_event("GET /authors"), None)

    assert _body(response) == {"authors": authors}


def test_missing_book_is_not_found():
    with patch.object(handler.books, "get_book", side_effect=NotFound("Book not found")):
        response = handler.handler(_book_event("GET /books/{id}"), None)

    assert response["statusCode"] == 404
    assert _body(response) == {"error": {"code": "not_found", "message": "Book not found"}}


def test_conflict_uses_its_code():
    error = Conflict("kindle_email_missing", "Set a Kindle email")
    with patch.object(handler.books, "resend_kindle", side_effect=error):
        response = handler.handler(_book_event("POST /books/{id}/kindle"), None)

    assert response["statusCode"] == 409
    assert _body(response) == {
        "error": {"code": "kindle_email_missing", "message": "Set a Kindle email"}
    }


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
