FROM python:3.12-slim

WORKDIR /app

# Copy backend requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install patchright's patched Chromium browser (has stealth built in)
RUN patchright install chromium
RUN patchright install-deps

# Copy the rest of the backend code
COPY backend/ .

# Railway automatically provides a $PORT environment variable.
# We run Uvicorn on this port.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
