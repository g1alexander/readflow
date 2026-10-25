import re

from api import db
from api.errors import InvalidRequest

KINDLE_EMAIL = re.compile(r"[^@\s]+@kindle\.com", re.IGNORECASE)
MAX_EMAIL = 254


def _key(sub: str) -> dict:
    return {"PK": f"USER#{sub}", "SK": "SETTINGS"}


def kindle_email(sub: str) -> str | None:
    return db.table().get_item(Key=_key(sub)).get("Item", {}).get("kindleEmail")


def get_settings(sub: str) -> dict:
    email = kindle_email(sub)
    return {} if email is None else {"kindleEmail": email}


def put_settings(sub: str, body: dict) -> dict:
    if body.keys() != {"kindleEmail"}:
        raise InvalidRequest("Body must have only kindleEmail")
    email = body["kindleEmail"]
    if email is not None and (
        not isinstance(email, str) or len(email) > MAX_EMAIL or not KINDLE_EMAIL.fullmatch(email)
    ):
        raise InvalidRequest("kindleEmail must be a @kindle.com address or null")
    settings = {} if email is None else {"kindleEmail": email}
    db.table().put_item(Item={**_key(sub), "entity": "SETTINGS", **settings, "updatedAt": db.now()})
    return settings
