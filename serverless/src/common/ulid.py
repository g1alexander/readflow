import os
import time

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_ulid() -> str:
    value = (time.time_ns() // 1_000_000) << 80 | int.from_bytes(os.urandom(10))
    return "".join(ALPHABET[(value >> shift) & 31] for shift in range(125, -1, -5))
