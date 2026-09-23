FROM python:3.12-slim

WORKDIR /app

# Copy backend requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers and dependencies
# We only install Chromium to save space and time
RUN playwright install chromium
RUN playwright install-deps

# Copy the rest of the backend code
COPY backend/ .

# Railway automatically provides a $PORT environment variable.
# We run Uvicorn on this port.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
