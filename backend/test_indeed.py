import asyncio
import os
from app.services.browser_service import click_apply
from app.schemas.profile import UserProfile

async def main():
    print("Testing Indeed via backend browser_service...")
    
    # We will use an arbitrary Indeed job URL for testing
    test_url = "https://www.indeed.com/viewjob?jk=some_random_job_id"
    
    # Mock profile
    profile = UserProfile(
        first_name="Test",
        last_name="User",
        email="test@example.com",
        phone="555-0100",
        location="New York, NY"
    )
    
    try:
        result = await click_apply(
            url=test_url,
            profile=profile,
            cookies=[],  # no cookies in this test
            thread_id_override="test-indeed-thread"
        )
        print("RESULT:")
        print(result)
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(main())
