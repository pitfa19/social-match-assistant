FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 APP_REQUIRE_AUTH=true
WORKDIR /app/backend
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home app
COPY backend/app ./app
COPY backend/migrations ./migrations
COPY shared /app/shared
USER app
CMD ["sh", "-c", "python -m app.bootstrap && exec uvicorn app.main:app --host :: --port ${PORT:-8000}"]
