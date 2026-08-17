"""FastAPI surface for the analyzer backend."""

import logging
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .analyzer import analyze
from .config import Settings, get_settings
from .errors import AnalysisError
from .models import AnalyzeRequest, AnalyzeResponse

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Repo Health Analyzer",
    description="Analyses a public GitHub repository and returns Metrics, a "
    "deterministic Health Score, and an AI Summary.",
    version="1.0.0",
)


def require_internal_secret(
    x_internal_secret: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    """Gate the endpoint to callers holding the shared secret.

    The backend calls a paid API on every request, so it must not be usable by
    anyone who finds its public URL. This is not user authentication — it only
    establishes that the caller is our own frontend.
    """
    expected = settings.internal_api_secret
    if not expected:
        raise HTTPException(
            status_code=500,
            detail="INTERNAL_API_SECRET is not configured on the backend.",
        )
    if not secrets.compare_digest(x_internal_secret, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing internal secret.")


@app.exception_handler(AnalysisError)
async def analysis_error_handler(_request: Request, exc: AnalysisError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/analyze",
    response_model=AnalyzeResponse,
    dependencies=[Depends(require_internal_secret)],
)
async def analyze_repository(
    payload: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
) -> AnalyzeResponse:
    return await analyze(payload.repo_url, settings)
