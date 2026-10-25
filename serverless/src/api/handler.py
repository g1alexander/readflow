import base64
import json
import logging
from decimal import Decimal

from api.errors import Conflict, InvalidRequest, NotFound
from api.routes import authors, books, settings, uploads

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ROUTES = {
    "GET /books": lambda sub, event: (200, {"books": books.list_books(sub)}),
    "GET /books/{id}": lambda sub, event: (200, books.get_book(sub, _id(event))),
    "PATCH /books/{id}": lambda sub, event: (
        200,
        {"book": books.patch_book(sub, _id(event), _json_body(event))},
    ),
    "DELETE /books/{id}": lambda sub, event: (204, books.delete_book(sub, _id(event))),
    "POST /books/{id}/kindle": lambda sub, event: (
        200,
        {"book": books.resend_kindle(sub, _id(event))},
    ),
    "POST /uploads": lambda sub, event: (201, uploads.create_upload(sub, _json_body(event))),
    "GET /settings": lambda sub, event: (200, settings.get_settings(sub)),
    "PUT /settings": lambda sub, event: (200, settings.put_settings(sub, _json_body(event))),
    "GET /authors": lambda sub, event: (200, {"authors": authors.list_authors(sub)}),
}


def _id(event) -> str:
    return (event.get("pathParameters") or {})["id"]


def _json_body(event) -> dict:
    try:
        raw = event.get("body") or ""
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw)
        body = json.loads(raw)
    except ValueError as e:
        raise InvalidRequest("Body must be JSON") from e
    if not isinstance(body, dict):
        raise InvalidRequest("Body must be a JSON object")
    return body


def _default(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def _response(status: int, body: dict | None) -> dict:
    if body is None:
        return {"statusCode": status}
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, default=_default),
    }


def _error(status: int, code: str, message: str) -> dict:
    return _response(status, {"error": {"code": code, "message": message}})


def handler(event, context):
    route_key = event.get("routeKey")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    sub = claims.get("sub")
    if not sub:
        return _error(401, "unauthorized", "Missing sub claim")

    route = ROUTES.get(route_key)
    if route is None:
        return _error(404, "not_found", "Route not found")

    try:
        status, body = route(sub, event)
    except InvalidRequest as e:
        return _error(400, "invalid_request", str(e))
    except NotFound as e:
        return _error(404, "not_found", str(e))
    except Conflict as e:
        return _error(409, e.code, str(e))
    except Exception:
        logger.exception("Unhandled error in %s", route_key)
        return _error(500, "internal", "Internal error")
    return _response(status, body)
