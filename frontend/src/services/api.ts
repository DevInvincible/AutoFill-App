import axios from 'axios';

// Set this in your .env file or environment variables for production (e.g. EXPO_PUBLIC_API_URL=https://api.yourdomain.com)
// Otherwise it defaults to localhost for development.
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://autofill-app-production.up.railway.app';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || 'default-dev-secret-key-12345';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes — apply can be slow
  headers: {
    'Content-Type': 'application/json',
    'X-API-KEY': API_KEY,
  },
});

// ============================================================
// Types
// ============================================================

export interface UserProfile {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  country?: string;
  university?: string;
  current_employer?: string;
  current_job_title?: string;
  linkedin?: string;
  current_salary?: string;
  salary_expectation?: string;
  gender?: string;
  experience?: string;
  resume?: string;
  cover_letter?: string;
}

export interface AgentAnswer {
  id?: string;
  name?: string;
  question: string;
  field_type: string;
  options: any[];
  answer: string | string[] | null;
  confidence: number;
  needs_user_input: boolean;
  answer_source?: string;
}

export interface ApplyResponse {
  success: boolean;
  url?: string;
  title?: string;
  job_context?: any;
  form?: any;
  fill_actions?: any[];
  agent_response?: {
    answers: AgentAnswer[];
    total_questions: number;
  };
  __interrupt__?: any;
  thread_id?: string;
  requires_login?: boolean;
  login_url?: string;
  message?: string;
  error?: string;
}

export interface FillResponse {
  success: boolean;
  status?: 'completed' | 'next_page' | 'ready_to_submit';
  filled?: any[];
  total_actions?: number;
  profile_actions?: number;
  agent_actions?: number;
  screenshot?: string;
  thread_id?: string;
  __interrupt__?: any;
  form?: any;
  error?: string;
  message?: string;
}

// ============================================================
// API Functions
// ============================================================

export async function applyToJob(
  url: string,
  profile: UserProfile,
  cookies?: any[]
): Promise<ApplyResponse> {
  const response = await api.post('/jobs/apply', {
    url,
    profile,
    cookies,
  });
  return response.data;
}

export async function submitAnswers(
  threadId: string,
  answers: Record<string, string>
): Promise<any> {
  const response = await api.post('/jobs/answers', {
    thread_id: threadId,
    answers,
  });
  return response.data;
}

export async function fillForm(threadId: string): Promise<FillResponse> {
  const response = await api.post('/jobs/fill', {
    thread_id: threadId,
  });
  return response.data;
}

export const loginToSite = async (url: string) => {
  try {
    const response = await api.post('/jobs/login', { url });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error.message;
  }
};

export const cancelLogin = async () => {
  try {
    const response = await api.post('/jobs/login/cancel');
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error.message;
  }
};

export default api;
