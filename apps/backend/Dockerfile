# Stage 1: Build with uv
# Build context must be the project root (for uv.lock access)
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder
WORKDIR /app
COPY apps/backend/pyproject.toml apps/backend/
COPY uv.lock ./
RUN uv sync --project apps/backend --no-dev --frozen
COPY apps/backend/ apps/backend/

# Stage 2: Runtime
FROM python:3.11-slim-bookworm
WORKDIR /app
COPY --from=builder /app /app
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"
EXPOSE 8001
CMD ["uvicorn", "apps.backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
