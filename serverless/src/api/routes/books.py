import os
from functools import cache

import boto3
from boto3.dynamodb.conditions import Key

HIDDEN_KEYS = ("PK", "SK", "entity")


@cache
def _table():
    return boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def list_books(sub: str) -> list[dict]:
    query = {
        "KeyConditionExpression": Key("PK").eq(f"USER#{sub}") & Key("SK").begins_with("BOOK#"),
    }
    books = []
    while True:
        page = _table().query(**query)
        books.extend(
            {k: v for k, v in item.items() if k not in HIDDEN_KEYS} for item in page["Items"]
        )
        if "LastEvaluatedKey" not in page:
            return books
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
