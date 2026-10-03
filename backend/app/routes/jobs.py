from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
import httpx
from app.schemas.job import JobAnalyzeRequest
from app.services.browser_service import click_apply, fill_job_form
from app.services.form_agent import resume_form_questions
from pydantic import BaseModel
import traceback

class JobAnswersRequest(BaseModel):
    thread_id: str
    answers: dict

class JobFillRequest(BaseModel):
    thread_id: str

class LocalFormAnalyzeRequest(BaseModel):
    fields: list
    profile: dict
    saved_answers: dict
    job_context: dict

api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)

APP_API_KEY = os.getenv("APP_API_KEY", "default-dev-secret-key-12345")
SUPABASE_URL = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY")

async def verify_auth(
    api_key: str = Security(api_key_header),
    bearer: HTTPAuthorizationCredentials = Security(bearer_scheme)
):
    # 1. Check for legacy shared API Key (used for early dev/testing)
    if api_key == APP_API_KEY:
        return "dev_user"
        
    # 2. Check for Supabase JWT by querying Supabase Auth endpoint
    if bearer and bearer.credentials:
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            raise HTTPException(
                status_code=500, 
                detail="SUPABASE_URL or SUPABASE_ANON_KEY not configured on the backend."
            )
        try:
            # Verify the token with Supabase directly (bypasses need for legacy JWT secrets)
            auth_url = f"{SUPABASE_URL}/auth/v1/user"
            headers = {
                "Authorization": f"Bearer {bearer.credentials}",
                "apikey": SUPABASE_ANON_KEY
            }
            with httpx.Client() as client:
                response = client.get(auth_url, headers=headers)
                
            if response.status_code == 200:
                user_data = response.json()
                return user_data.get("id") # Return the user ID
            else:
                raise HTTPException(status_code=401, detail="Invalid or expired Supabase token.")
                
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")

    # 3. Deny access if neither is valid
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid X-API-KEY or Bearer token required.",
    )

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
    dependencies=[Depends(verify_auth)],
)


@router.get("/health")
async def health_check():
    return {"status": "ok"}

@router.get("/status/{thread_id}")
async def get_status(thread_id: str):
    from app.services.browser_service import _task_progress
    status = _task_progress.get(thread_id, {"pct": 0, "label": "Initializing..."})
    return {"success": True, "progress": status["pct"], "label": status["label"]}

@router.post("/apply")
async def apply_to_job(data: JobAnalyzeRequest):
    url_str = str(data.url)
    if not url_str.startswith(("http://", "https://")):
        return {"success": False, "error": "Invalid URL. Must start with http:// or https://"}

    import urllib.parse
    try:
        parsed_url = urllib.parse.urlparse(url_str)
        hostname = parsed_url.hostname.lower() if parsed_url.hostname else ""
    except Exception:
        return {"success": False, "error": "Malformed URL."}

    # Phase 3 Security: SSRF Protection
    # Block internal IPs, localhost, and cloud metadata endpoints
    suspicious_domains = [
        "localhost",
        "127.0.0.1",
        "169.254.169.254", # Cloud metadata
        "0.0.0.0",
        "::1"
    ]
    
    is_suspicious = any(hostname == bad for bad in suspicious_domains)
    # Also block local TLDs
    if hostname.endswith((".local", ".internal", ".arpa")) or is_suspicious:
        return {
            "success": False,
            "error": "Security Guard: Blocked suspicious or internal URL.",
            "message": "SSRF prevention triggered.",
        }
    try:
        result = await click_apply(
            url=str(data.url),
            profile=data.profile,
            cookies=data.cookies,
            thread_id_override=data.thread_id,
        )

        return result
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to apply to job.",
        }


@router.post("/answers")
async def submit_answers(data: JobAnswersRequest):
    try:
        result = resume_form_questions(
            thread_id=data.thread_id,
            user_answers=data.answers,
        )

        return result
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to submit answers.",
        }


@router.post("/fill")
async def fill_form_endpoint(data: JobFillRequest):
    try:
        result = await fill_job_form(
            thread_id=data.thread_id,
        )

        return result
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to fill job form.",
        }

@router.post("/analyze-local")
async def analyze_local_endpoint(data: LocalFormAnalyzeRequest, user_id: str = Depends(verify_auth)):
    try:
        from app.services.form_agent import analyze_form_questions
        
        # We reuse the exact same AI logic!
        agent_result = analyze_form_questions(
            mapped_form={"fields": data.fields},
            profile=data.profile,
            job_context=data.job_context,
            thread_id="local-webview"
        )
        
        return {
            "success": True,
            "agent_response": agent_result.get("agent_response", {}),
            "total_questions": len(data.fields),
        }
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to analyze form locally.",
        }