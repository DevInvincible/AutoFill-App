from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
import os
from app.schemas.job import JobAnalyzeRequest, JobLoginRequest
from app.services.browser_service import (
    inspect_page,
    click_apply,
    fill_job_form,
    manual_login,
    cancel_login,
)
from app.services.job_parser import find_apply_elements
from app.services.form_mapper import map_form_fields
from app.services.form_filler import (
    prepare_fill_actions,
    fill_form,
)
from app.services.profile_service import get_test_profile
from pydantic import BaseModel
from app.services.form_agent import resume_form_questions
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


@router.post("/analyze")
async def analyze_job(data: JobAnalyzeRequest):
    if not data.url.startswith(("http://", "https://")):
        return {"success": False, "error": "Invalid URL. Must start with http:// or https://"}
    
    try:
        page_data = await inspect_page(str(data.url))

        apply_elements = find_apply_elements(page_data)

        return {
            "page": page_data,
            "apply_elements": apply_elements,
        }
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to analyze job page.",
        }

@router.post("/apply")
async def apply_to_job(data: JobAnalyzeRequest):
    if not data.url.startswith(("http://", "https://")):
        return {"success": False, "error": "Invalid URL. Must start with http:// or https://"}
    try:
        result = await click_apply(
            str(data.url),
            data.profile,
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

@router.post("/login")
async def login_to_job_site(data: JobLoginRequest):
    try:
        result = await manual_login(str(data.url))
        return result
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to open login page.",
        }

@router.post("/login/cancel")
async def cancel_login_endpoint():
    try:
        result = await cancel_login()
        return result
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to cancel login.",
        }