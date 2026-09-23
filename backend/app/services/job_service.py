from urllib.parse import urlparse


def detect_source(url: str) -> str:
    domain = urlparse(url).netloc.lower()

    if "linkedin.com" in domain:
        return "linkedin"

    if "indeed.com" in domain:
        return "indeed"

    return "unknown"