FROM python:3.12-slim

WORKDIR /app

# Install Xvfb (virtual display) and dependencies
RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install patchright's patched Chromium browser (has stealth built in)
RUN patchright install chromium
RUN patchright install-deps

# Copy the rest of the backend code
COPY backend/ .

# Railway automatically provides a $PORT environment variable.
# We run Uvicorn wrapped in xvfb-run to simulate a display so we can run non-headless.
CMD ["sh", "-c", "xvfb-run -a uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
