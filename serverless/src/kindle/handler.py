import logging
import os
from datetime import UTC, datetime
from email.message import EmailMessage
from functools import cache

import boto3
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.config import Config
from botocore.exceptions import ClientError

from common.slug import slugify
from common.ulid import new_ulid

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_EPUB_SIZE = 28 * 1024 * 1024
CLIENT_CONFIG = Config(connect_timeout=5, read_timeout=20, retries={"max_attempts": 3})
KINDLE_NAMES = {"#kindle": "kindle", "#requestedAt": "requestedAt"}

_serialize = TypeSerializer().serialize
_deserialize = TypeDeserializer().deserialize


class SendFailed(Exception):
    pass


@cache
def _dynamodb():
    return boto3.client("dynamodb")


@cache
def _s3():
    return boto3.client("s3", config=CLIENT_CONFIG)


@cache
def _sesv2():
    return boto3.client("sesv2", config=CLIENT_CONFIG)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _values(data: dict) -> dict:
    return {key: _serialize(value) for key, value in data.items()}


def _image(record: dict, name: str) -> dict:
    return {k: _deserialize(v) for k, v in record["dynamodb"].get(name, {}).items()}


def handler(event, context):
    for record in event["Records"]:
        _process(_image(record, "NewImage"), _image(record, "OldImage"))


def _process(new: dict, old: dict) -> None:
    requested_at = new["kindle"]["requestedAt"]
    if old.get("kindle", {}).get("requestedAt") == requested_at and old.get("ingest") == "ready":
        return
    sub = new["PK"].removeprefix("USER#")
    book_id = new["id"]
    key = _values({"PK": new["PK"], "SK": new["SK"]})
    if not _claim(key, requested_at):
        logger.info("Request %s of book %s already taken, skipping", requested_at, book_id)
        return
    try:
        try:
            _send(sub, new)
        except SendFailed as error:
            _finish(key, book_id, requested_at, "failed", str(error))
        else:
            _finish(key, book_id, requested_at, "sent", None)
    except Exception:
        _release(key, requested_at)
        raise


def _claim(key: dict, requested_at: str) -> bool:
    try:
        _dynamodb().update_item(
            TableName=os.environ["TABLE_NAME"],
            Key=key,
            UpdateExpression="SET #kindle.#processedFor = :req, #updatedAt = :now",
            ConditionExpression="#kindle.#requestedAt = :req AND "
            "(attribute_not_exists(#kindle.#processedFor) OR #kindle.#processedFor <> :req)",
            ExpressionAttributeNames={
                **KINDLE_NAMES,
                "#processedFor": "processedFor",
                "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues=_values({":req": requested_at, ":now": _now()}),
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        return False
    return True


def _release(key: dict, requested_at: str) -> None:
    try:
        _dynamodb().update_item(
            TableName=os.environ["TABLE_NAME"],
            Key=key,
            UpdateExpression="REMOVE #kindle.#processedFor",
            ConditionExpression="#kindle.#processedFor = :req",
            ExpressionAttributeNames={"#kindle": "kindle", "#processedFor": "processedFor"},
            ExpressionAttributeValues=_values({":req": requested_at}),
        )
    except ClientError:
        logger.exception("Could not release request %s", requested_at)


def _kindle_email(sub: str) -> str | None:
    item = (
        _dynamodb()
        .get_item(
            TableName=os.environ["TABLE_NAME"],
            Key=_values({"PK": f"USER#{sub}", "SK": "SETTINGS"}),
        )
        .get("Item", {})
    )
    return item.get("kindleEmail", {}).get("S")


def _send(sub: str, book: dict) -> None:
    to = _kindle_email(sub)
    if not to:
        raise SendFailed("kindle_email_missing")
    epub = _s3().get_object(Bucket=os.environ["BUCKET_NAME"], Key=book["epubKey"])
    if epub["ContentLength"] > MAX_EPUB_SIZE:
        epub["Body"].close()
        raise SendFailed("too_large")
    message = EmailMessage()
    message["From"] = os.environ["SENDER_ADDRESS"]
    message["To"] = to
    subject = " ".join(book["name"].split())
    message["Subject"] = subject
    message.set_content(subject)
    message.add_attachment(
        epub["Body"].read(),
        maintype="application",
        subtype="epub+zip",
        filename=f"{slugify(book['name']) or 'book'}.epub",
    )
    try:
        _sesv2().send_email(
            FromEmailAddress=os.environ["SENDER_ADDRESS"],
            Destination={"ToAddresses": [to]},
            Content={"Raw": {"Data": message.as_bytes()}},
        )
    except ClientError as error:
        logger.warning("SES rejected book %s: %s", book["id"], error.response["Error"]["Message"])
        raise SendFailed("ses_error") from error


def _finish(key: dict, book_id: str, requested_at: str, status: str, error: str | None) -> None:
    now = _now()
    fields = {"#kindle.#status": ":status", "#kindle.#at": ":now", "#updatedAt": ":now"}
    names = {**KINDLE_NAMES, "#status": "status", "#at": "at", "#updatedAt": "updatedAt"}
    values = {":req": requested_at, ":status": status, ":now": now}
    if error:
        fields["#kindle.#error"] = ":error"
        names["#error"] = "error"
        values[":error"] = error
    table = os.environ["TABLE_NAME"]
    try:
        _dynamodb().transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": table,
                        "Key": key,
                        "UpdateExpression": "SET "
                        + ", ".join(f"{name} = {value}" for name, value in fields.items()),
                        "ConditionExpression": "#kindle.#requestedAt = :req",
                        "ExpressionAttributeNames": names,
                        "ExpressionAttributeValues": _values(values),
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
                                "kind": f"kindle_{status}",
                                "data": {"error": error} if error else {},
                                "at": now,
                            }
                        ),
                    }
                },
            ]
        )
    except ClientError as exc:
        reasons = exc.response.get("CancellationReasons", [])
        if not reasons or reasons[0].get("Code") != "ConditionalCheckFailed":
            raise
        logger.info("Book %s has a newer Kindle request, skipping result", book_id)
