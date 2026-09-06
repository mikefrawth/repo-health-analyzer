# Pinned upstream Node image (digest, not just the mutable "22-slim" tag),
# copied in below instead of piping NodeSource's install script through bash.
FROM node:22-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS node

FROM python:3.12-slim

# git: the backend clones each Target Repository rather than pulling files over
# the REST API. nodejs/npm: the pinned ESLint install that produces the JS/TS
# Complexity Signal.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
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

# Analysis of attacker-chosen repository contents (git clone, radon, ESLint)
# should not run as root.
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
