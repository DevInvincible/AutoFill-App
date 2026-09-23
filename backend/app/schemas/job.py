from pydantic import BaseModel, HttpUrl

from app.schemas.profile import UserProfile


class JobAnalyzeRequest(BaseModel):

    url: HttpUrl
    profile: UserProfile


class JobResponse(BaseModel):

    source: str

    title: str | None = None

    company: str | None = None

    location: str | None = None

    description: str | None = None

    requirements: list[str] = []

    salary: str | None = None

    apply_url: str | None = None


class JobLoginRequest(BaseModel):
    url: HttpUrl