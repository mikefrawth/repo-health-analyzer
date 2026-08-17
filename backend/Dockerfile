FROM python:3.12-slim

# git: the backend clones each Target Repository rather than pulling files over
# the REST API. nodejs/npm: the pinned ESLint install that produces the JS/TS
# Complexity Signal.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pinned, repo-independent ESLint. The analysed repository's own dependencies
# are never installed.
COPY js-analyzer /opt/js-analyzer
RUN cd /opt/js-analyzer && npm install --omit=dev --no-audit --no-fund

COPY app ./app

ENV JS_ANALYZER_DIR=/opt/js-analyzer \
    PYTHONUNBUFFERED=1

# Railway and Render both inject PORT.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
