import logging
import os
import re
from datetime import UTC, datetime
from functools import cache

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

from common.ulid import new_ulid
from metadata import epub
from metadata.slug import slugify

logger = logging.getLogger()
logger.setLevel(logging.INFO)

EPUB_KEY = re.compile(r"^users/(?P<sub>[^/]+)/books/(?P<book_id>[^/]+)/book\.epub$")

_serialize = TypeSerializer().serialize


@cache
def _dynamodb():
    return boto3.client("dynamodb")


@cache
def _s3():
    return boto3.client("s3")


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _values(data: dict) -> dict:
    return {key: _serialize(value) for key, value in data.items()}


def handler(event, context):
    detail = event["detail"]
    key = detail["object"]["key"]
    match = EPUB_KEY.match(key)
    if not match:
        logger.warning("Ignoring unexpected key %s", key)
        return
    sub, book_id = match["sub"], match["book_id"]
    size = detail["object"]["size"]
    body = _s3().get_object(Bucket=os.environ["BUCKET_NAME"], Key=key)["Body"].read()
    try:
        metadata = epub.parse(body)
    except epub.EpubError as error:
        logger.warning("Invalid EPUB %s: %s", key, error)
        _finish(
            sub,
            book_id,
            {"epubSize": size, "ingest": "failed", "ingestError": str(error)},
            "ingest_failed",
            {"error": str(error)},
        )
        return
    fields = {
        "authors": _upsert_authors(sub, metadata.authors),
        "epubSize": size,
        "ingest": "ready",
    }
    if metadata.title:
        fields["name"] = metadata.title
    if metadata.year is not None:
        fields["year"] = metadata.year
    if metadata.cover:
        fields["coverKey"] = _put_cover(sub, book_id, metadata.cover)
    _finish(sub, book_id, fields, "ingest_ready", {})


def _put_cover(sub: str, book_id: str, cover: epub.Cover) -> str:
    key = f"users/{sub}/books/{book_id}/cover.{cover.extension}"
    _s3().put_object(
        Bucket=os.environ["BUCKET_NAME"],
        Key=key,
        Body=cover.data,
        ContentType=cover.media_type,
    )
    return key


def _upsert_authors(sub: str, names: list[str]) -> list[dict]:
    authors = {}
    for name in names:
        slug = slugify(name)
        if not slug or slug in authors:
            continue
        authors[slug] = {"id": slug, "name": _upsert_author(sub, slug, name)}
    return list(authors.values())


def _upsert_author(sub: str, slug: str, name: str) -> str:
    try:
        _dynamodb().put_item(
            TableName=os.environ["TABLE_NAME"],
            Item=_values(
                {
                    "PK": f"USER#{sub}",
                    "SK": f"AUTHOR#{slug}",
                    "entity": "AUTHOR",
                    "id": slug,
                    "name": name,
                    "createdAt": _now(),
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


def _finish(sub: str, book_id: str, fields: dict, kind: str, data: dict) -> None:
    now = _now()
    fields = {**fields, "updatedAt": now}
    table = os.environ["TABLE_NAME"]
    try:
        _dynamodb().transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": table,
                        "Key": _values({"PK": f"USER#{sub}", "SK": f"BOOK#{book_id}"}),
                        "UpdateExpression": "SET "
                        + ", ".join(f"#{name} = :{name}" for name in fields),
                        "ConditionExpression": "#ingest = :pending",
                        "ExpressionAttributeNames": {
                            "#ingest": "ingest",
                            **{f"#{name}": name for name in fields},
                        },
                        "ExpressionAttributeValues": _values(
                            {":pending": "pending", **{f":{k}": v for k, v in fields.items()}}
                        ),
                    }
                },
                {
                    "Put": {
                        "TableName": table,
                        "Item": _values(
                            {
                                "PK": f"BOOK#{book_id}",
                                "SK": f"EVENT#{new_ulid()}",
                                "entity": "EVENT",
                                "bookId": book_id,
                                "kind": kind,
                                "data": data,
                                "at": now,
                            }
                        ),
                    }
                },
            ]
        )
    except ClientError as error:
        reasons = error.response.get("CancellationReasons", [])
        if not reasons or reasons[0].get("Code") != "ConditionalCheckFailed":
            raise
        logger.info("Book %s is no longer pending, skipping", book_id)
