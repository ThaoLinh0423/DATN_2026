FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# ── Layer 1: dependencies (chỉ rebuild khi pyproject.toml hoặc uv.lock thay đổi) ──
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project \
    --index-url https://download.pytorch.org/whl/cpu \
    --extra-index-url https://pypi.org/simple

# ── Layer 2: source code (rebuild nhanh, không cài lại thư viện) ──
COPY configs/ configs/
COPY src/ src/
COPY deploy.py deploy.py

RUN mkdir -p data/raw outputs

ENV PYTHONPATH=/app/src

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "deploy:app", "--host", "0.0.0.0", "--port", "8000"]
