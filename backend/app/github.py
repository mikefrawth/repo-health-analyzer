"""Fetching a Target Repository.

The backend owns this end to end: a size pre-check against the GitHub API,
then a shallow clone that every analyser reads from. See
docs/adr/0002-backend-owns-github-fetch-via-clone.md.
"""

import os
import re
import shutil
import stat
import subprocess
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import httpx

from .errors import AnalysisError

GITHUB_API = "https://api.github.com"

_URL_PATTERN = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/"
    r"(?P<owner>[A-Za-z0-9._-]+)/"
    r"(?P<repo>[A-Za-z0-9._-]+?)"
    r"(?:\.git)?/?$",
    re.IGNORECASE,
)


def parse_repo_url(url: str) -> tuple[str, str]:
    """Pull (owner, repo) out of a GitHub URL, rejecting anything else."""
    match = _URL_PATTERN.match(url.strip())
    if not match:
        raise AnalysisError(
            "That doesn't look like a GitHub repository URL. "
            "Expected something like https://github.com/owner/repo"
        )
    return match.group("owner"), match.group("repo")


def _headers(token: str) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def fetch_repo_metadata(owner: str, repo: str, token: str) -> dict:
    """Repository metadata, or an AnalysisError explaining why we can't have it."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}", headers=_headers(token)
            )
        except httpx.RequestError as exc:
            raise AnalysisError(f"Could not reach GitHub: {exc}", status_code=502) from exc

    if response.status_code == 404:
        raise AnalysisError(
            f"No public repository found at {owner}/{repo}. "
            "It may not exist, or it may be private — private repos aren't supported yet.",
            status_code=404,
        )
    if response.status_code == 403:
        raise AnalysisError(
            "GitHub rejected the request, most likely a rate limit. "
            "Set GITHUB_TOKEN on the backend to raise the limit, or try again later.",
            status_code=429,
        )
    if response.status_code >= 400:
        raise AnalysisError(
            f"GitHub returned {response.status_code} for {owner}/{repo}.",
            status_code=502,
        )
    return response.json()


def assert_within_size_limit(metadata: dict, max_size_kb: int) -> None:
    """Reject oversized repositories before we spend a clone on them."""
    size_kb = metadata.get("size") or 0
    if size_kb > max_size_kb:
        raise AnalysisError(
            f"That repository is about {size_kb // 1024} MB, over the "
            f"{max_size_kb // 1024} MB limit for analysis.",
            status_code=413,
        )


def _force_remove_readonly(func, path, _exc_info) -> None:
    """Git marks objects read-only; Windows refuses to delete those without this."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


@contextmanager
def clone_repository(owner: str, repo: str, depth: int) -> Iterator[Path]:
    """Shallow-clone into a temp directory that is removed on the way out.

    Bounded depth rather than `--depth 1`: one commit is enough to know the
    repository's last-touched date but not enough to say anything about how
    actively it is worked on.
    """
    workdir = Path(tempfile.mkdtemp(prefix="repo-health-"))
    target = workdir / repo
    try:
        result = subprocess.run(
            [
                "git",
                "clone",
                "--depth",
                str(depth),
                "--quiet",
                f"https://github.com/{owner}/{repo}.git",
                str(target),
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode != 0:
            detail = result.stderr.strip().splitlines()
            raise AnalysisError(
                f"Could not clone {owner}/{repo}: {detail[-1] if detail else 'unknown error'}",
                status_code=502,
            )
        yield target
    except subprocess.TimeoutExpired as exc:
        raise AnalysisError(
            f"Cloning {owner}/{repo} took too long and was stopped.", status_code=504
        ) from exc
    finally:
        shutil.rmtree(workdir, onexc=_force_remove_readonly)
