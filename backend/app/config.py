"""Environment-backed settings for the analyzer backend."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    github_token: str = ""
    internal_api_secret: str = ""

    # Reject a Target Repository larger than this before attempting a clone.
    max_repo_size_kb: int = 200_000  # ~200 MB, as reported by the GitHub API

    # Analysis Scope caps.
    max_files: int = 500
    max_python_files: int = 100
    max_js_files: int = 100

    clone_depth: int = 50

    # Directory holding the pinned ESLint install used for the JS/TS Complexity
    # Signal. When absent, JS/TS complexity is simply not computed.
    js_analyzer_dir: str = "/opt/js-analyzer"

    claude_model: str = "claude-opus-5"
    claude_timeout_seconds: float = 60.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
