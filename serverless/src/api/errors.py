class InvalidRequest(ValueError):
    pass


class NotFound(Exception):
    pass


class Conflict(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
