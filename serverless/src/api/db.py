import os
from collections.abc import Iterator
from datetime import UTC, datetime
from functools import cache

import boto3


@cache
def table():
    return boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def query_all(**query) -> Iterator[dict]:
    while True:
        page = table().query(**query)
        yield from page["Items"]
        if "LastEvaluatedKey" not in page:
            return
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
