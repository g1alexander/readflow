import re
import unicodedata

NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).lower()


def slugify(name: str) -> str:
    return NON_ALPHANUMERIC.sub("-", fold(name)).strip("-")
