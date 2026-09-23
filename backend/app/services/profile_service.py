from app.schemas.profile import UserProfile


def get_test_profile() -> UserProfile:
    return UserProfile(
        first_name="Owais",
        last_name="Ahmed",
        email="your@email.com",
        phone="+92XXXXXXXXXX",
        location="Karachi",
        country="Pakistan",
        university="Dawood University of Engineering and Technology",
        linkedin="https://linkedin.com/in/your-profile",
        resume="D:/android auto-fill/backend/files/Owais Ahmed_Certificate.pdf"
    )