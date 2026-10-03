from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
import os
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

api_key_header = APIKeyHeader(name="X-API-KEY")
APP_API_KEY = os.getenv("APP_API_KEY", "default-dev-secret-key-12345")

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != APP_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )

router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
    dependencies=[Depends(verify_api_key)],
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

    # Phase 3 Security: Prevent SSRF and cookie theft by whitelisting trusted ATS domains
    allowed_domains = [
        "greenhouse.io",
        "lever.co",
        "ashbyhq.com",
        "workable.com",
        "breezy.hr",
        "myworkdayjobs.com",
        "icims.com",
        "smartrecruiters.com",
        "linkedin.com",
        "jobs.lever.co",
    ]

    if not any(hostname == domain or hostname.endswith("." + domain) for domain in allowed_domains):
        return {
            "success": False,
            "error": "Security Guard: Unsupported domain. To protect your session data, we only allow known, trusted Job Board domains.",
            "message": "Domain not in ATS whitelist.",
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
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to fill job form.",
        }