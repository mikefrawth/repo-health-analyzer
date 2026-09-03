"""User-facing analysis failures.

Anything raised as an AnalysisError reaches the user as a readable message
rather than a generic 500.
"""


class AnalysisError(Exception):
    def __init__(
        self, message: str, status_code: int = 400, code: str | None = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        # A machine-readable discriminator for the handful of failures a
        # caller needs to branch on beyond the HTTP status alone — e.g.
        # "needs_private_scope" (issue #24), where a 404 sometimes means
        # "ask the user to grant private-repo access" rather than "not found".
        self.code = code
