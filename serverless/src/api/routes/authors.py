from boto3.dynamodb.conditions import Key

from api import db


def list_authors(sub: str) -> list[dict]:
    items = db.query_all(
        KeyConditionExpression=Key("PK").eq(f"USER#{sub}") & Key("SK").begins_with("AUTHOR#"),
    )
    return [{"id": item["id"], "name": item["name"]} for item in items]
