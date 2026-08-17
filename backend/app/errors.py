"""User-facing analysis failures.

Anything raised as an AnalysisError reaches the user as a readable message
rather than a generic 500.
"""


class AnalysisError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
