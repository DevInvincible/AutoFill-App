import json
import os
import redis

# Initialize Redis connection from environment variable
# If not set, fallback to localhost for local testing
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

def init_db():
    # Just a simple ping to ensure the connection works
    try:
        redis_client.ping()
        print("Connected to Redis successfully.")
    except redis.ConnectionError:
        print("Warning: Could not connect to Redis. Check your REDIS_URL.")

def save_session(thread_id: str, data: dict):
    # Save the session data as a JSON string
    # We can also add an expiration time, e.g., ex=86400 for 24 hours
    redis_client.set(thread_id, json.dumps(data), ex=86400)

def get_session(thread_id: str) -> dict | None:
    data_str = redis_client.get(thread_id)
    if data_str:
        return json.loads(data_str)
    return None

def delete_session(thread_id: str):
    redis_client.delete(thread_id)
