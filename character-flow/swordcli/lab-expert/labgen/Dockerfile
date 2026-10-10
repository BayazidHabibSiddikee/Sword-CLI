# LabGen Cyberdeck Terminal - Docker Image
# Multi-stage build for production

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    freecad \
    ngspice \
    tectonic \
    tesseract-ocr \
    poppler-utils \
    poppler-data \
    python3-venv \
    gcc \
    g++ \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install LabGen package
COPY labgen/ /app/labgen/
RUN pip install --no-cache-dir -e /app/labgen

# Copy backend
COPY backend/ /app/backend/

# Stage 3: Final image
FROM python:3.11-slim AS final

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    freecad \
    ngspice \
    tectonic \
    tesseract-ocr \
    poppler-utils \
    poppler-data \
    python3-venv \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from backend stage
COPY --from=backend /app/venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Copy LabGen source
COPY --from=backend /app/labgen /app/labgen
COPY --from=backend /app/backend /app/backend

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create non-root user
RUN useradd -m -u 1000 labgen && chown -R labgen:labgen /app
USER labgen

WORKDIR /app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]