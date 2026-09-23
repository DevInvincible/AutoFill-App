# AutoFill App 🚀

An intelligent Auto-Fill application that leverages AI to automatically parse job descriptions and fill out complex forms.

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
