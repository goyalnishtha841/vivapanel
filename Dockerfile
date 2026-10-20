# One container: the React app is built, then served by the FastAPI backend at the same URL.
#   docker build -t viva-panel . && docker run -p 8000:8000 --env-file .env viva-panel

FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# "/" = live mode against the same origin
RUN VITE_API_URL=/ npm run build

FROM python:3.12-slim
# git: shallow-clones the student's repo
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home app
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY agents/ agents/
COPY backend/ backend/
COPY --from=web /web/dist frontend/dist
RUN mkdir -p backend/data && chown -R app backend/data
USER app
ENV PYTHONUNBUFFERED=1 PORT=8000
EXPOSE 8000
# hosts set $PORT; one worker, because sessions run in background threads of this process
CMD ["sh", "-c", "exec uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
