from pydantic import BaseModel
from typing import Optional


class UserProfile(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    email: Optional[str] = None
    phone: Optional[str] = None

    location: Optional[str] = None
    country: Optional[str] = None

    university: Optional[str] = None

    current_employer: Optional[str] = None
    current_job_title: Optional[str] = None

    linkedin: Optional[str] = None

    current_salary: Optional[str] = None
    salary_expectation: Optional[str] = None

    gender: Optional[str] = None
    experience: Optional[str] = None

    resume: Optional[str] = None
    cover_letter: Optional[str] = None