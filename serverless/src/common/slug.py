import re
import unicodedata

NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    decomposed = unicodedata.normalize("NFKD", name)
    stripped = "".join(char for char in decomposed if not unicodedata.combining(char))
    return NON_ALPHANUMERIC.sub("-", stripped.lower()).strip("-")
