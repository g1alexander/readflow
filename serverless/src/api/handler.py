import json
import logging
from decimal import Decimal

from api.routes import books

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ROUTES = {
    "GET /books": lambda sub, event: {"books": books.list_books(sub)},
}


def _default(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def _response(status: int, body: dict) -> dict:
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
        return _response(200, route(sub, event))
    except Exception:
        logger.exception("Unhandled error in %s", route_key)
        return _error(500, "internal", "Internal error")
