import os
from datetime import UTC, datetime
from functools import cache

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer
from botocore.config import Config
from botocore.exceptions import ClientError

from api import db
from api.errors import Conflict, InvalidRequest, NotFound
from api.routes import settings
from common.slug import slugify
from common.ulid import new_ulid

HIDDEN_KEYS = ("PK", "SK", "entity")
COVER_URL_EXPIRES_IN = 3600
MAX_NAME = 300
MAX_AUTHORS = 10
STATUSES = {"toread", "upnext", "reading", "onhold", "finished", "dropped"}
TYPES = {
    "productivity",
    "wellbeing",
    "history",
    "film",
    "philosophy",
    "fiction",
    "thriller",
    "scifi",
    "design",
    "strategy",
    "programming",
    "other",
}
NULLABLE = {"type", "score", "year"}

_serialize = TypeSerializer().serialize


@cache
def _dynamodb():
    return boto3.client("dynamodb")


@cache
def _s3():
    return boto3.client("s3", config=Config(signature_version="s3v4"))


def _item(data: dict) -> dict:
    return {key: _serialize(value) for key, value in data.items()}


def _key(sub: str, book_id: str) -> dict:
    return {"PK": f"USER#{sub}", "SK": f"BOOK#{book_id}"}


def _public(item: dict) -> dict:
    book = {k: v for k, v in item.items() if k not in HIDDEN_KEYS}
    if "coverKey" in book:
        book["coverUrl"] = _s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": os.environ["BUCKET_NAME"], "Key": book["coverKey"]},
            ExpiresIn=COVER_URL_EXPIRES_IN,
        )
    return book


def _load(sub: str, book_id: str) -> dict:
    item = db.table().get_item(Key=_key(sub, book_id)).get("Item")
    if item is None:
        raise NotFound("Book not found")
    return item


def _events(book_id: str, **query) -> list[dict]:
    return list(
        db.query_all(
            KeyConditionExpression=Key("PK").eq(f"BOOK#{book_id}")
            & Key("SK").begins_with("EVENT#"),
            **query,
        )
    )


def list_books(sub: str) -> list[dict]:
    items = db.query_all(
        KeyConditionExpression=Key("PK").eq(f"USER#{sub}") & Key("SK").begins_with("BOOK#"),
    )
    return [_public(item) for item in items]


def get_book(sub: str, book_id: str) -> dict:
    book = _load(sub, book_id)
    events = [
        {
            "id": event["SK"].removeprefix("EVENT#"),
            "kind": event["kind"],
            "data": event["data"],
            "at": event["at"],
        }
        for event in _events(book_id, ScanIndexForward=False)
    ]
    return {"book": _public(book), "events": events}


def _text(field: str, value) -> str:
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= MAX_NAME:
        raise InvalidRequest(f"{field} must be a string of 1 to {MAX_NAME} characters")
    return value.strip()


def _integer(field: str, value, low: int, high: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
        raise InvalidRequest(f"{field} must be an integer between {low} and {high}")
    return value


def _enum(field: str, value, allowed: set[str]) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise InvalidRequest(f"{field} must be one of {', '.join(sorted(allowed))}")
    return value


def _authors(value) -> dict[str, str]:
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_AUTHORS:
        raise InvalidRequest(f"authors must be a list of 1 to {MAX_AUTHORS} names")
    authors = {}
    for name in value:
        name = _text("authors[]", name)
        slug = slugify(name)
        if not slug:
            raise InvalidRequest("authors[] must have letters or digits")
        authors.setdefault(slug, name)
    return authors


VALIDATORS = {
    "status": lambda value: _enum("status", value, STATUSES),
    "name": lambda value: _text("name", value),
    "authors": _authors,
    "type": lambda value: _enum("type", value, TYPES),
    "score": lambda value: _integer("score", value, 1, 5),
    "year": lambda value: _integer("year", value, 0, datetime.now(UTC).year),
}


def _validate(body: dict) -> dict:
    if not body:
        raise InvalidRequest("Body must not be empty")
    unknown = body.keys() - VALIDATORS.keys()
    if unknown:
        raise InvalidRequest(f"Unknown fields: {', '.join(sorted(unknown))}")
    fields = {}
    for field, value in body.items():
        if value is None:
            if field not in NULLABLE:
                raise InvalidRequest(f"{field} cannot be null")
            fields[field] = None
        else:
            fields[field] = VALIDATORS[field](value)
    return fields


def _check_kindle(sub: str, book: dict) -> None:
    if book["ingest"] == "failed":
        raise Conflict("ingest_failed", "The EPUB could not be processed")
    if not settings.kindle_email(sub):
        raise Conflict("kindle_email_missing", "Set a Kindle email in settings first")


def _upsert_author(sub: str, slug: str, name: str) -> str:
    try:
        _dynamodb().put_item(
            TableName=os.environ["TABLE_NAME"],
            Item=_item(
                {
                    "PK": f"USER#{sub}",
                    "SK": f"AUTHOR#{slug}",
                    "entity": "AUTHOR",
                    "id": slug,
                    "name": name,
                    "createdAt": db.now(),
                }
            ),
            ConditionExpression="attribute_not_exists(SK)",
            ReturnValuesOnConditionCheckFailure="ALL_OLD",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        return error.response.get("Item", {}).get("name", {}).get("S", name)
    return name


def _update(fields: dict) -> dict:
    values = {f":{k}": v for k, v in fields.items() if v is not None}
    expression = "SET " + ", ".join(f"#{k} = :{k}" for k, v in fields.items() if v is not None)
    removed = [f"#{k}" for k, v in fields.items() if v is None]
    if removed:
        expression += " REMOVE " + ", ".join(removed)
    return {
        "UpdateExpression": expression,
        "ExpressionAttributeNames": {f"#{k}": k for k in fields},
        "ExpressionAttributeValues": values,
    }


def _transact(sub: str, book_id: str, fields: dict, events: list[tuple[str, dict]]) -> None:
    table = os.environ["TABLE_NAME"]
    update = _update(fields)
    try:
        _dynamodb().transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": table,
                        "Key": _item(_key(sub, book_id)),
                        "ConditionExpression": "attribute_exists(PK)",
                        **update,
                        "ExpressionAttributeValues": _item(update["ExpressionAttributeValues"]),
                    }
                },
                *(
                    {
                        "Put": {
                            "TableName": table,
                            "Item": _item(
                                {
                                    "PK": f"BOOK#{book_id}",
                                    "SK": f"EVENT#{new_ulid()}",
                                    "entity": "EVENT",
                                    "bookId": book_id,
                                    "kind": kind,
                                    "data": data,
                                    "at": fields["updatedAt"],
                                }
                            ),
                        }
                    }
                    for kind, data in events
                ),
            ]
        )
    except ClientError as error:
        reasons = error.response.get("CancellationReasons", [])
        if reasons and reasons[0].get("Code") == "ConditionalCheckFailed":
            raise NotFound("Book not found") from error
        raise


def _kindle_request(now: str) -> dict:
    return {"requestedAt": now, "status": "sending"}


def patch_book(sub: str, book_id: str, body: dict) -> dict:
    fields = _validate(body)
    book = _load(sub, book_id)
    if fields.get("status") == book["status"]:
        del fields["status"]
    if fields.get("status") == "reading":
        _check_kindle(sub, book)
    if not fields:
        return _public(book)
    if "authors" in fields:
        fields["authors"] = [
            {"id": slug, "name": _upsert_author(sub, slug, name)}
            for slug, name in fields["authors"].items()
        ]
    now = db.now()
    fields["updatedAt"] = now

    if "status" not in fields:
        try:
            item = db.table().update_item(
                Key=_key(sub, book_id),
                ConditionExpression="attribute_exists(PK)",
                ReturnValues="ALL_NEW",
                **_update(fields),
            )["Attributes"]
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise NotFound("Book not found") from error
            raise
        return _public(item)

    events = [("status_changed", {"from": book["status"], "to": fields["status"]})]
    if fields["status"] == "reading":
        fields["kindle"] = _kindle_request(now)
        events.append(("kindle_requested", {}))
    _transact(sub, book_id, fields, events)
    return _public(_load(sub, book_id))


def resend_kindle(sub: str, book_id: str) -> dict:
    book = _load(sub, book_id)
    _check_kindle(sub, book)
    now = db.now()
    _transact(
        sub,
        book_id,
        {"kindle": _kindle_request(now), "updatedAt": now},
        [("kindle_requested", {})],
    )
    return _public(_load(sub, book_id))


def delete_book(sub: str, book_id: str) -> None:
    _load(sub, book_id)
    bucket = os.environ["BUCKET_NAME"]
    pages = (
        _s3()
        .get_paginator("list_objects_v2")
        .paginate(Bucket=bucket, Prefix=f"users/{sub}/books/{book_id}/")
    )
    for page in pages:
        objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
        if not objects:
            continue
        response = _s3().delete_objects(Bucket=bucket, Delete={"Objects": objects, "Quiet": True})
        if response.get("Errors"):
            raise RuntimeError(f"Could not delete {len(response['Errors'])} objects of {book_id}")
    with db.table().batch_writer() as batch:
        for event in _events(book_id, ProjectionExpression="PK, SK"):
            batch.delete_item(Key={"PK": event["PK"], "SK": event["SK"]})
    db.table().delete_item(Key=_key(sub, book_id))
