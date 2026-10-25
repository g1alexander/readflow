import os
import re
from datetime import UTC, datetime
from functools import cache

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.config import Config

from api.errors import InvalidRequest
from api.ulid import new_ulid

MAX_SIZE = 100 * 1024 * 1024
MAX_FILE_NAME = 255
EXPIRES_IN = 900
CONTENT_TYPE = "application/epub+zip"
EPUB_SUFFIX = re.compile(r"\.epub$", re.IGNORECASE)

_serialize = TypeSerializer().serialize


@cache
def _dynamodb():
    return boto3.client("dynamodb")


@cache
def _s3():
    return boto3.client("s3", config=Config(signature_version="s3v4"))


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _item(data: dict) -> dict:
    return {key: _serialize(value) for key, value in data.items()}


def _validate(body: dict) -> tuple[str, int]:
    file_name = body.get("fileName")
    if (
        not isinstance(file_name, str)
        or len(file_name) > MAX_FILE_NAME
        or not EPUB_SUFFIX.search(file_name)
        or not EPUB_SUFFIX.sub("", file_name).strip()
    ):
        raise InvalidRequest("fileName must be a .epub file name")
    size = body.get("size")
    if not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= MAX_SIZE:
        raise InvalidRequest(f"size must be an integer between 1 and {MAX_SIZE}")
    return file_name, size


def create_upload(sub: str, body: dict) -> dict:
    file_name, size = _validate(body)
    book_id = new_ulid()
    now = _now()
    key = f"users/{sub}/books/{book_id}/book.epub"
    book = {
        "id": book_id,
        "name": EPUB_SUFFIX.sub("", file_name).strip(),
        "authors": [],
        "status": "toread",
        "ingest": "pending",
        "epubKey": key,
        "epubFileName": file_name,
        "createdAt": now,
        "updatedAt": now,
    }
    event = {
        "bookId": book_id,
        "kind": "uploaded",
        "data": {"fileName": file_name, "size": size},
        "at": now,
    }
    table = os.environ["TABLE_NAME"]
    _dynamodb().transact_write_items(
        TransactItems=[
            {
                "Put": {
                    "TableName": table,
                    "Item": _item(
                        {"PK": f"USER#{sub}", "SK": f"BOOK#{book_id}", "entity": "BOOK", **book}
                    ),
                    "ConditionExpression": "attribute_not_exists(PK)",
                }
            },
            {
                "Put": {
                    "TableName": table,
                    "Item": _item(
                        {
                            "PK": f"BOOK#{book_id}",
                            "SK": f"EVENT#{new_ulid()}",
                            "entity": "EVENT",
                            **event,
                        }
                    ),
                }
            },
        ]
    )
    url = _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": os.environ["BUCKET_NAME"], "Key": key, "ContentType": CONTENT_TYPE},
        ExpiresIn=EXPIRES_IN,
    )
    return {
        "book": book,
        "upload": {
            "url": url,
            "method": "PUT",
            "headers": {"content-type": CONTENT_TYPE},
            "expiresIn": EXPIRES_IN,
        },
    }
