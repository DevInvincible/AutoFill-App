JOB APPLICATION AGENT - BACKEND DEVELOPMENT NOTES
==================================================

PROJECT GOAL
------------

Build an AI-powered job application assistant.

The user will provide a job/application URL through a React Native
mobile application.

The backend will use FastAPI, Playwright, LangChain/LangGraph and
browser tools to analyze job pages and eventually interact with
application forms.

The final system should be able to:

1. Open job/application URLs.
2. Read and analyze webpages.
3. Detect job information.
4. Find Apply buttons/links.
5. Open application forms.
6. Detect form fields.
7. Fill application fields using the user's profile.
8. Upload resumes/documents when appropriate.
9. Ask the user for approval before final submission.
10. Eventually support different job platforms such as LinkedIn,
    Indeed, and other websites where automation is permitted.


CURRENT ARCHITECTURE
--------------------

backend/
|
+-- venv/
|   Python virtual environment
|
+-- browser_data/
|   Persistent Playwright browser profile/session data
|
+-- app/
    |
    +-- __init__.py
    |
    +-- main.py
    |   FastAPI application entry point
    |
    +-- routes/
    |   |
    |   +-- __init__.py
    |   +-- jobs.py
    |       Job-related API endpoints
    |
    +-- schemas/
    |   |
    |   +-- __init__.py
    |   +-- job.py
    |       Pydantic request/response models
    |
    +-- services/
        |
        +-- __init__.py
        +-- browser_service.py
            Playwright browser functionality


CURRENT TECHNOLOGY
------------------

Backend:
- Python
- FastAPI
- Pydantic
- Playwright

Future:
- LangChain
- LangGraph
- React Native frontend
- Database
- Authentication/session management


CURRENT API
-----------

POST /jobs/analyze

Purpose:
Analyze a webpage provided by the user.

Current flow:

React Native / Swagger
        |
        v
POST /jobs/analyze
        |
        v
FastAPI route
        |
        v
browser_service.py
        |
        v
Playwright
        |
        v
Chromium
        |
        v
Open URL
        |
        v
Extract webpage information
        |
        v
Return JSON


CURRENT PAGE DATA EXTRACTED
----------------------------

The browser service currently extracts:

- Current URL
- Page title
- Body text
- Links
- Buttons
- Input fields
- Textareas


PLAYWRIGHT
----------

Playwright is the browser automation library.

We use:

headless=False

This means the browser window is visible.

We use:

user_data_dir="./browser_data"

This creates a persistent browser profile so browser session data
such as cookies can potentially persist between browser launches.


IMPORTANT PLAYWRIGHT BEHAVIOR
-----------------------------

context.close()

closes the browser context.

The original implementation opened the browser, immediately read the
page, and then closed the browser.

Therefore, if a webpage redirected to a login page, the backend would
extract the login page rather than waiting for the user to log in.


GOOGLE LOGIN TEST
-----------------

A Google Forms URL was tested.

The page redirected to Google Sign-in.

Attempting to sign in through the Playwright-controlled browser
resulted in:

"This browser or app may not be secure."

This is Google's authentication/automation protection.

We should NOT attempt to bypass Google's security mechanisms.

Instead, browser functionality will first be developed and tested
with publicly accessible job/application pages.


CURRENT DEVELOPMENT STAGE
-------------------------

Completed:

[YES] FastAPI backend setup
[YES] FastAPI server running
[YES] Swagger documentation working
[YES] /jobs/analyze endpoint created
[YES] Playwright installed
[YES] Chromium launches
[YES] Webpage extraction works
[YES] URL/title/text extraction
[YES] Link extraction
[YES] Button extraction
[YES] Input extraction
[YES] Textarea extraction
[YES] Persistent browser profile configured
[YES] Detect job title/company
[YES] Detect Apply button
[YES] Click Apply
[YES] Detect application forms
[YES] Detect form fields intelligently (form_mapper)
[YES] Fill form fields (form_filler)
[YES] Upload resume
[YES] LangGraph agent (form_agent)
[YES] Browser session manager
[YES] LinkedIn-specific handling
[YES] Multi-page form support (Next button)
[YES] CORS middleware
[YES] Error handling on all routes

Not completed:

[ ] User approval before submission (ready_to_submit status exists but no confirm endpoint)
[ ] Database (sessions are in-memory)
[ ] React Native integration (frontend is Expo skeleton only)
[ ] Authentication/session management
[ ] Production deployment

NOTE: The form extraction and filling architecture is fully
platform-agnostic. It works on any website (LinkedIn, Indeed,
Greenhouse, Lever, Workday, custom sites) without requiring
platform-specific code paths.


NEXT STEP
---------

Do NOT work on LinkedIn, Indeed, LangChain or React Native yet.

First test /jobs/analyze with a publicly accessible job/application page.

Then improve the returned webpage data so the backend can identify:

- Job title
- Company
- Location
- Description
- Apply button/link

After that, implement browser interaction such as clicking the
Apply button.


PYTHON __init__.py
------------------

__init__.py files are used to define Python packages.

Example:

app/
    __init__.py

routes/
    __init__.py

services/
    __init__.py

They allow Python to treat these directories as packages and make
imports clearer and more reliable.

Example:

from app.services.browser_service import inspect_page

Even when an __init__.py file is empty, it is okay to keep it.

DO NOT DELETE THE __init__.py FILES FOR THIS PROJECT.