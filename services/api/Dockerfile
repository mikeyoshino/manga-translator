FROM python:3.11-slim

WORKDIR /app

# Install shared package first
COPY packages/shared /app/packages/shared
RUN pip install --no-cache-dir /app/packages/shared

# Install API dependencies
COPY services/api/requirements.txt /app/services/api/requirements.txt
RUN pip install --no-cache-dir -r /app/services/api/requirements.txt

# Copy application code
COPY services/api /app/services/api
# Copy server/ for transition-period re-exports
COPY server /app/server
COPY manga_translator /app/manga_translator

ENV PYTHONPATH="/app:/app/services/api"

EXPOSE 5003

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "5003"]
