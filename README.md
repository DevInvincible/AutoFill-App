# AutoFill App 🚀

An intelligent, AI-driven application that completely automates the tedious process of applying for jobs. Simply provide your profile and a job link, and the system handles the rest—navigating the page, understanding the form fields, mapping your profile to the requirements, and submitting the application.

---

## 🏗 High-Level Architecture

The system is split between a React Native mobile application and a powerful Python backend that orchestrates a LangGraph AI agent and Playwright for headless browser automation.

```mermaid
graph TD
    %% Entities
    User((User))
    App[📱 React Native App]
    API[⚡ FastAPI Backend]
    Redis[(🗄️ Redis Session Store)]
    
    %% AI & Automation Layer
    LangGraph[🧠 LangGraph Orchestrator]
    Gemini[🤖 Google GenAI Gemini]
    Playwright[🌐 Playwright Browser]
    TargetSite((🎯 Target Job Site))

    %% Flow
    User -->|Enters Profile & Job URL| App
    App -->|POST /api/jobs| API
    API -->|Save Job State| Redis
    API -.->|Spawns Background Task| LangGraph
    
    %% Agent loop
    LangGraph <-->|Parses Context & Decides Actions| Gemini
    LangGraph <-->|Navigates, Extracts DOM, Fills Forms| Playwright
    Playwright <-->|Interacts with Webpage| TargetSite
    
    %% Status checking
    App -->|Polls GET /api/jobs/[id]| API
    API -->|Reads State| Redis
```

---

## 🔄 The AI Form Filling Flow (LangGraph)

When a job is submitted, the backend doesn't just run a simple script. It spins up a **LangGraph Agent** that intelligently reacts to the webpage it is looking at. 

```mermaid
sequenceDiagram
    participant User
    participant Backend as FastAPI
    participant Agent as LangGraph Agent
    participant AI as Gemini AI
    participant Browser as Playwright

    User->>Backend: Submit Job URL & Profile
    Backend->>Agent: Initialize Automation Task
    
    Agent->>Browser: Go to Job URL
    Browser-->>Agent: Returns HTML/DOM Structure
    
    Agent->>AI: Analyze this webpage and my profile
    AI-->>Agent: "I found a job form. Here are the fields we need to fill."
    
    Agent->>AI: How should we map the user profile to these fields?
    AI-->>Agent: "Map Name to input#1, Resume to input#2, etc."
    
    Agent->>Browser: Execute Fill Commands (Type text, Upload files)
    Browser-->>Agent: Form Filled
    
    Agent->>Browser: Click Submit!
    Browser-->>Agent: Success/Confirmation Page
    
    Agent->>Backend: Update Job Status to "Completed"
    Backend-->>User: Notification: "Job Applied Successfully!"
```

---

## 🛠 Tech Stack

### Frontend (Mobile App)
- **Framework:** React Native / Expo
- **Styling:** Tailwind CSS
- **Routing:** Expo Router (`app/` directory)

### Backend (API & Automation)
- **Framework:** FastAPI (Python)
- **AI/LLM:** LangGraph & Google GenAI (Gemini)
- **Browser Automation:** Playwright
- **Session Storage:** Redis (via Upstash)

---

## 🚀 Getting Started (Local Development)

### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Mac/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure Environment Variables:
   Create a `.env` file in the `backend` folder with the following:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-3.6-flash
   REDIS_URL=rediss://default:YOUR_PASSWORD@your-endpoint.upstash.io:6379
   ```
5. Run the FastAPI Server:
   ```bash
   uvicorn app.main:app --reload
   ```

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Expo development server:
   ```bash
   npx expo start
   ```

---

## 📦 Deployment

- **Frontend:** Can be deployed as a web app on **Vercel** or compiled to Android/iOS using **EAS Build** (`eas build -p android`).
- **Backend:** Designed to be deployed on platforms that support Docker and background workers (e.g., **Render**, **Railway**, or a VPS). Note: Vercel is not recommended for the backend due to Playwright size limits and serverless timeouts.

## 📄 License
This project is licensed under the MIT License.
