# Voice agent worker, hosted in the Mumbai region (e.g. AWS ap-south-1).
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.8 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
RUN uv run python -c "from livekit.plugins import silero; silero.VAD.load()"
CMD ["uv", "run", "python", "agent.py", "start"]
