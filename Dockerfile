FROM python:3.11-slim

LABEL maintainer="Hackathon Participant"
LABEL description="ContentGuardEnv — Autonomous Moderation RLHF Environment"
# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# HF Spaces runs as non-root
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 7860

CMD ["python", "server/app.py"]
