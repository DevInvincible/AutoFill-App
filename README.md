# ApplyFaster 🚀 — AI-Powered Job Application Automation

> **One tap. Full application. Zero manual effort.**

ApplyFaster is an intelligent mobile app that completely automates the tedious process of filling out online job applications. Paste a job URL, and a background AI agent navigates the job portal, reads every form field, maps your saved profile to the answers, and notifies you when it's done — all while you use your phone normally.

---

## 📱 App Screenshots & Flow

```
[ Apply Tab ]          [ Accounts Tab ]       [ Review Screen ]
  Paste URL              LinkedIn ✅             AI Filled: 12
  ──────────             Indeed ✅               Needs Input: 2
  [Apply with AI]        Google                  [Confirm & Submit]
  ████████░░ 80%
  AI filling answers...
```

---

## 🏗 High-Level Architecture

```mermaid
graph TD
    User((User))
    App[📱 React Native App\nExpo + Expo Router]
    API[⚡ FastAPI Backend\nRailway Cloud]
    Redis[(🗄️ Redis\nUpstash Session Store)]
    LangGraph[🧠 LangGraph Agent\nOrchestrator]
    Gemini[🤖 Google Gemini\nAI Decision Engine]
    Playwright[🌐 Playwright\nHeadless Chromium]
    Site((🎯 Job Portal\nIndeed / LinkedIn / etc))

    User -->|Paste URL + Profile| App
    App -->|POST /jobs/apply + cookies| API
    API -->|Save session| Redis
    API -->|Spawns background task| LangGraph
    LangGraph <-->|Understand form + map answers| Gemini
    LangGraph <-->|Navigate + fill DOM| Playwright
    Playwright <-->|HTTP + JS interaction| Site
    API -->|Result + answers| App
    App -->|Push notification + Review screen| User
```

---

## 🔄 AI Form Filling Pipeline

```mermaid
sequenceDiagram
    participant User
    participant App as React Native App
    participant API as FastAPI Backend
    participant Agent as LangGraph Agent
    participant AI as Gemini AI
    participant Browser as Playwright (Headless)

    User->>App: Paste job URL, tap "Apply with AI"
    App->>App: Load session cookies from AsyncStorage
    App->>API: POST /jobs/apply { url, profile, cookies }
    API->>Browser: Launch Playwright, inject cookies
    Browser->>Browser: Navigate to job URL
    Browser-->>API: Returns page URL + DOM
    API->>API: Detect login wall / apply button
    API->>Agent: Extract form fields from DOM
    Agent->>AI: Analyze fields + match to user profile
    AI-->>Agent: Structured answers for each field
    Agent->>Browser: Fill form inputs, select dropdowns
    Browser-->>Agent: Form filled
    API-->>App: { success, answers, thread_id }
    App->>User: In-app progress bar → Review screen
    User->>App: Review AI answers, tap Submit
    App->>API: POST /jobs/fill { thread_id }
    API->>Browser: Click Submit
    Browser-->>API: Confirmation page
    API-->>App: { success }
    App->>User: 🎉 Push notification: "Application submitted!"
```

---

## 🛠 Tech Stack

### Frontend (Mobile)
| Technology | Purpose |
|---|---|
| React Native + Expo | Cross-platform mobile framework |
| Expo Router | File-based navigation (tabs, stacks) |
| `expo-notifications` | Background + foreground push notifications |
| `react-native-webview` | In-app browser for portal login |
| `@preeternal/react-native-cookie-manager` | Extract session cookies from WebView |
| `@react-native-async-storage` | Persist cookies + profile + active jobs |
| `react-native-reanimated` | Smooth progress bar + page animations |
| EAS Build | Cloud compilation → APK/IPA |

### Backend (API + Automation)
| Technology | Purpose |
|---|---|
| FastAPI (Python) | REST API server |
| Playwright + playwright-stealth | Headless browser automation + bot bypass |
| LangGraph | Stateful AI agent orchestration |
| Google Gemini (GenAI) | Form field understanding + answer generation |
| Redis (Upstash) | Session state between API calls |
| Railway | Cloud deployment with Docker |

---

## 🚧 Challenges Faced & Solutions

This project required solving a chain of complex, real-world engineering problems. Every one of them is documented here.

---

### 1. 🔴 XServer Crash on Cloud (Playwright Headless Mode)

**Problem:** Playwright was configured to launch a visible browser window (`headless=False`) for local debugging. On Railway's cloud environment (Linux, no display server), this caused an immediate crash because there is no XServer/GUI available.

**Error:**
```
playwright._impl._errors.Error: Browser closed unexpectedly.
Could not find expected browser (chromium) locally.
```

**Solution:** Force `headless=True` in all cloud contexts. Used an environment variable flag to auto-detect cloud vs. local:
```python
is_headless = True  # Always true on Railway
context = p.chromium.launch_persistent_context(
    headless=is_headless, ...
)
```

---

### 2. 🔴 React Native `onPress` Passing GestureResponderEvent

**Problem:** The "Apply with AI" button was completely dead — no response when tapped. The function `handleApply` was designed to optionally accept a URL string for auto-resume. When tapped, React Native automatically passes a `GestureResponderEvent` object into the first argument, which crashed when the code tried to call `.trim()` on it.

**Solution:** Added a type guard to distinguish between the event object and a real string:
```typescript
const handleApply = async (overrideUrl?: string | any) => {
  const jobUrl = typeof overrideUrl === 'string' ? overrideUrl : url;
  ...
}
```

---

### 3. 🔴 WebView Infinite Loading / Captcha Loop on Indeed

**Problem:** The in-app WebView used to log in was identified as a bot by Indeed/Cloudflare because:
1. **Wrong User-Agent:** The WebView was reporting itself as an "iPhone Safari" browser, but the device was Android — Cloudflare detected this OS/UA mismatch as spoofing and served an infinite captcha loop.
2. **Incognito Mode:** The WebView had `incognito={true}` which blocked Cloudflare from storing the verification cookie it issues after you pass a captcha.

**Solution:**
- Set a platform-aware User-Agent that matches the actual device OS.
- Removed `incognito` mode and explicitly enabled all cookie/storage APIs:
```tsx
userAgent={Platform.OS === 'android'
  ? "Mozilla/5.0 (Linux; Android 13; SM-S918B)..."
  : "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5...)"
}
sharedCookiesEnabled={true}
thirdPartyCookiesEnabled={true}
domStorageEnabled={true}
```

---

### 4. 🔴 Cookie Domain Mismatch — "Connected" But Still Asking to Login

**Problem:** When logging in via the Accounts screen (e.g., `secure.indeed.com`), cookies were saved under the key `secure.indeed.com`. But when applying to a job at `indeed.com/jobs/...`, the cookie lookup only checked `indeed.com` — no match found, so zero cookies were sent to the backend.

**Solution:** Implemented a multi-variant domain lookup that tries all permutations:
```typescript
const hostname = urlObj.hostname;          // secure.indeed.com
const baseDomain = hostname.split('.').slice(-2).join('.'); // indeed.com
const wwwDomain = 'www.' + baseDomain;     // www.indeed.com

cookies = allCookies[hostname] || allCookies[baseDomain] || allCookies[wwwDomain];
```
Also fixed the cookie save key in `WebViewLogin.tsx` to always save under the base domain.

---

### 5. 🔴 False-Positive Login Wall Detection

**Problem:** After successfully injecting session cookies into the backend Playwright browser, the backend navigated to the correct job page (`pk.indeed.com/viewjob?jk=...`). However, it then checked for a "Sign in" button and found one — because Indeed's **navigation header** always shows a "Sign in" link, even when you are fully logged in. This caused `requires_login: true` to be returned even for authenticated users.

**Logs that revealed the issue:**
```
[GOTO] Final URL: https://pk.indeed.com/viewjob?jk=9a35f94d2ed4b5d0
[AUTH] Login wall detected  ← FALSE POSITIVE!
```

**Solution:** Removed the "Sign in" button heuristic entirely. Now login wall detection is based purely on the URL path containing `/login`, `/signup`, `authwall`, or `signin`.

---

### 6. 🔴 Apply Button Not Found on Indeed

**Problem:** After the login wall fix, the backend reached the job page but couldn't find the Apply button. Indeed labels it **"Apply now"** (not just "Apply"), and it may be an `<a>` link instead of a `<button>`. The original code only searched for a `<button role>` with the text "Apply".

**Solution:** Replaced the single selector with a 4-strategy cascade:
1. Button role with all common labels: `"Apply now"`, `"Easy Apply"`, `"Apply on company website"`
2. Link role with the same labels
3. Indeed/LinkedIn-specific CSS/data attributes: `[class*='indeed-apply']`, `[data-testid='indeedApply']`
4. JS deep text scan as last resort: scans ALL `<button>` and `<a>` elements for any "apply" text
5. Scrolls the page first to trigger lazy-loaded React components

---

### 7. 🔴 Cloudflare Blocking Railway's Server IP

**Problem:** Even with valid session cookies injected, Cloudflare was serving its bot-detection block page to Railway's Playwright browser. The page URL looked correct but the actual HTML was a firewall error page. This was confirmed by the Railway logs:

```
[APPLY] No apply button found. Visible buttons/links:
['Return home → Troubleshooting Cloudflare Errors Contact us']
```

Railway's IP is a known datacenter IP, which Cloudflare's threat intelligence immediately flags.

**Solution:** Added `playwright-stealth` package which patches 15+ browser APIs that Cloudflare fingerprints:
- Hides `navigator.webdriver = true`
- Spoofs `chrome.runtime` to look like a real Chrome install
- Patches canvas fingerprinting, `window.Notification`, `window.Permissions`
- Passes the standard Cloudflare bot detection test suite

```python
from playwright_stealth import stealth_sync
page = context.new_page()
stealth_sync(page)  # Applied to every new page
```

---

### 8. 🔴 "App Not Installed / Package Invalid" on Android

**Problem:** Attempting to install a new APK over an older version caused Android to reject it with the "Package appears to be invalid" error. This happens when the signing certificate of the new build doesn't match the old installed version.

**Solution:** Uninstall the existing app completely before installing the new APK. Android requires a clean install when certificate metadata changes between builds.

---

### 9. 🟡 Stale `@connected_accounts` Flag

**Problem:** An early implementation wrote a boolean flag to `AsyncStorage` when logging in (`accounts.linkedin = true`). Later, the Accounts screen was updated to read real cookies from `universal_cookies`. But the old write remained in `login.tsx`, creating a confusing split between stale flags and real cookie state.

**Solution:** Deleted the stale write entirely. The Accounts screen now reads only `universal_cookies`, which contains the actual session data. Connected status is accurate and live.

---

### 10. 🟡 `review.tsx` Silent Failures

**Problem:** When form submission failed on the Review screen, errors were sent only as background push notifications. On Android, if the user hadn't granted notification permissions, they would see nothing at all — the app appeared frozen.

**Solution:** Added `Alert.alert()` as a primary visible feedback layer alongside notifications for all error states (submission failed, network error, next page needed).

---

## 📁 Project Structure

```
autofill-app/
├── Dockerfile                    # Railway deployment container
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py               # FastAPI app entry point
│       ├── routes/
│       │   └── jobs.py           # /apply, /answers, /fill, /health
│       ├── services/
│       │   ├── browser_service.py  # Playwright + stealth automation
│       │   ├── form_agent.py       # LangGraph AI agent
│       │   ├── form_mapper.py      # DOM → structured fields
│       │   └── form_filler.py      # Profile → fill actions
│       └── schemas/
│           └── job.py
└── frontend/
    ├── app/
    │   ├── _layout.tsx           # Root layout + notification handler
    │   ├── login.tsx             # WebView login screen
    │   ├── review.tsx            # AI answer review + submit
    │   ├── result.tsx            # Submission confirmation
    │   └── (tabs)/
    │       ├── index.tsx         # Apply tab (main screen)
    │       ├── accounts.tsx      # Linked accounts + cookie status
    │       └── profile.tsx       # User profile editor
    └── src/
        ├── components/
        │   ├── WebViewLogin.tsx  # In-app browser for login
        │   └── QuestionCard.tsx  # Review screen field card
        └── services/
            └── api.ts            # Axios client + error interceptor
```

---

## 🚀 Getting Started (Local Development)

### Backend
```bash
cd backend
python -m venv venv
# Windows:
.\\venv\\Scripts\\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
playwright install chromium

# Create .env
cp .env.example .env
# Fill in GEMINI_API_KEY, REDIS_URL, APP_API_KEY

uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npx expo start
```

### Environment Variables

**Backend `.env`:**
```env
GEMINI_API_KEY=your_google_gemini_key
GEMINI_MODEL=gemini-2.0-flash
REDIS_URL=rediss://default:PASSWORD@endpoint.upstash.io:6379
APP_API_KEY=your-secret-api-key
ALLOWED_ORIGINS=*
```

**Frontend (Expo):**
```env
EXPO_PUBLIC_API_URL=https://your-railway-app.up.railway.app
EXPO_PUBLIC_API_KEY=your-secret-api-key
```

---

## 📦 Deployment

| Component | Platform | Method |
|---|---|---|
| Backend | Railway | Docker (`Dockerfile` in root) |
| Session Store | Upstash Redis | Managed Redis, free tier |
| Mobile App | EAS Build | `npx eas-cli build -p android --profile preview` |

> **Important:** Playwright requires a full Docker environment with system dependencies. Do not deploy the backend to Vercel or any serverless platform — it will fail due to binary size limits and execution timeouts.

---

## 📄 License

MIT License — see `LICENSE` for details.
