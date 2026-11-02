import json
import logging
import os
import urllib.request
from functools import cache

import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

logger = logging.getLogger()
logger.setLevel(logging.INFO)

NAMESPACE = "readflow"
TIMEOUT_SECONDS = 10

_deserialize = TypeDeserializer().deserialize


@cache
def _credentials():
    return boto3.Session().get_credentials()


def _image(record: dict, name: str) -> dict:
    return {k: _deserialize(v) for k, v in record["dynamodb"].get(name, {}).items()}


def _watched(item: dict) -> tuple:
    return item.get("ingest"), item.get("kindle", {}).get("status")


def handler(event, context):
    for record in event["Records"]:
        if record.get("eventName") != "MODIFY":
            continue
        new, old = _image(record, "NewImage"), _image(record, "OldImage")
        if new.get("entity") != "BOOK" or _watched(new) == _watched(old):
            continue
        _publish(new["PK"].removeprefix("USER#"), new["id"])


def _publish(sub: str, book_id: str) -> None:
    endpoint = os.environ["EVENTS_ENDPOINT"]
    body = json.dumps(
        {"channel": f"/{NAMESPACE}/users/{sub}", "events": [json.dumps({"bookId": book_id})]}
    )
    request = AWSRequest(
        method="POST", url=endpoint, data=body, headers={"content-type": "application/json"}
    )
    SigV4Auth(_credentials(), "appsync", os.environ["AWS_REGION"]).add_auth(request)
    prepared = urllib.request.Request(
        endpoint, data=body.encode(), headers=dict(request.headers), method="POST"
    )
    with urllib.request.urlopen(prepared, timeout=TIMEOUT_SECONDS) as response:
        result = json.loads(response.read() or b"{}")
    if result.get("failed"):
        raise RuntimeError(f"Publish failed for book {book_id}: {result['failed']}")
    logger.info("Notified change of book %s", book_id)
