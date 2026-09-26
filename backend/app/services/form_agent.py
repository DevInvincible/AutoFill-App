from app.schemas.profile import UserProfile
from typing import Any, TypedDict

from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.memory import MemorySaver
from langchain_google_genai import ChatGoogleGenerativeAI
import os
from dotenv import load_dotenv



# ============================================================
# ENV
# ============================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not configured")


# ============================================================
# LLM
# ============================================================

llm = ChatGoogleGenerativeAI(
    model=GEMINI_MODEL,
    google_api_key=GEMINI_API_KEY,
)


# ============================================================
# OUTPUT SCHEMAS
# ============================================================

class AgentAnswer(BaseModel):
    id: str | None = None
    name: str | None = None

    question: str
    field_type: str

    options: list[Any] = Field(default_factory=list)

    answer: str | list[str] | None = None

    confidence: float = 0.0

    # True only when we genuinely need the user.
    needs_user_input: bool = True

    # Why the agent answered it.
    answer_source: str | None = None


class AgentResponse(BaseModel):
    answers: list[AgentAnswer] = Field(default_factory=list)
    total_questions: int = 0


# ============================================================
# LANGGRAPH STATE
# ============================================================
class FormAgentState(TypedDict, total=False):
    mapped_form: dict
    profile: dict
    job_context: dict

    questions: list[dict]

    agent_response: dict

    unanswered_questions: list[dict]
    user_answers: dict


# ============================================================
# STEP 1
# Extract only unanswered questions
# ============================================================

def extract_questions_node(state: FormAgentState):

    mapped_form = state.get("mapped_form", {})
    profile = state.get("profile", {})
    questions = []

    ignored_labels = {
        "search",
        "attach",
        "upload",
    }

    import re
    def option_matches(wanted: str, option_text: str) -> bool:
        if not wanted or not option_text: return False
        w = re.sub(r"\s+", " ", str(wanted).strip().lower())
        o = re.sub(r"\s+", " ", str(option_text).strip().lower())
        return w == o or w in o

    for field in mapped_form.get("fields", []):

        semantic_type = field.get("semantic_type")
        field_type = field.get("type", "")
        label = field.get("label", "")
        field_id = field.get("id", "")

        # Files are handled by form_filler.
        if field_type == "file":
            continue

        # Search inputs are not application questions.
        if field_type == "search":
            continue

        # Phone country-code controls.
        if field_id.startswith("iti-"):
            continue

        # Recaptcha.
        if field_id.startswith("g-recaptcha"):
            continue

        if label.strip().lower() in ignored_labels:
            continue

        # Check if it's a known profile field with options that don't match the user's profile
        if semantic_type and semantic_type != "unknown":
            options = field.get("options", [])
            if options and field_type in ["select", "custom_dropdown", "radio", "checkbox_group"]:
                if semantic_type == "full_name":
                    val = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
                else:
                    val = profile.get(semantic_type)
                
                if val:
                    matched = any(option_matches(str(val), str(opt.get("label") or opt.get("value") or "")) for opt in options)
                    if not matched:
                        # Add to questions so LLM can flag needs_user_input
                        questions.append(field)
                        continue
            
            # If no mismatch or no options to check, skip it (handled normally by form_filler)
            continue

        # Nothing meaningful to ask.
        if not label and not field.get("options"):
            continue

        questions.append(field)

    return {
        "questions": questions
    }


# ============================================================
# STEP 2
# Gemini answers what it safely can
# ============================================================

def analyze_questions_node(state: FormAgentState):

    questions = state.get("questions", [])
    profile = state.get("profile", {})
    job_context = state.get("job_context", {})

    if not questions:
        return {
            "agent_response": AgentResponse(
                answers=[],
                total_questions=0,
            ).model_dump()
        }

    structured_llm = llm.with_structured_output(AgentResponse)

    prompt = f"""
You are an AI job application assistant.

Your job is to analyze application form questions and decide
whether each question can be answered automatically.

IMPORTANT SAFETY RULE:

NEVER invent or guess personal facts about the applicant.

There are THREE possible answer sources:

1. PROFILE
Use this when the user's profile contains the answer.

2. JOB_CONTEXT
Use this for reasonable professional/application answers that can
be generated from the job description, company information, role,
skills, experience, or career motivation.

3. USER_INPUT
Use this when the question requires a personal fact, personal
history, personal preference, or information that is not available.

Examples that MUST require USER_INPUT:

- Have you previously worked at Careem?
- Did you attend this career fair?
- Have you seen Careem's content on social media?
- Are you related to someone at the company?
- How did you hear about this job?
  (unless the profile/context explicitly says so)
- What is your preferred salary?
  (unless explicitly provided)
- Which university are you graduating from?
  if the exact university cannot be confidently matched to an option.

DO NOT choose "Others" merely because the user's exact answer is
not present.

For dropdowns/radios:
- If an answer is known, select the matching option.
- The answer MUST exactly match one of the provided options.
- If no option can be confidently selected, use USER_INPUT.

For checkbox questions:
- Only select options that are clearly supported.
- Do not select random options.
- If the question asks about personal history or preferences and
  the information is unavailable, use USER_INPUT.

For general professional questions such as:

"Why do you want to work here?"
"What interests you about this role?"
"Why are you a good fit?"

you MAY generate a concise professional answer using the
profile and job context.

Do not claim experience, employment, education, achievements,
or events that are not present in the profile/context.

Confidence:
- 0.90-1.00 = directly supported by profile/context
- 0.75-0.89 = reasonable professional answer based on context
- below 0.75 = usually require USER_INPUT

Set:

needs_user_input = false

when you can safely answer.

Set:

needs_user_input = true

when the user must provide the answer.

answer_source must be exactly one of:

"profile"
"job_context"
"user_input"

If needs_user_input is true:
- answer MUST be null
- answer_source MUST be "user_input"

If needs_user_input is false:
- provide the answer
- answer_source must be "profile" or "job_context"

USER PROFILE:
{profile}

JOB CONTEXT:
{job_context}

FORM QUESTIONS:
{questions}
"""

    result = structured_llm.invoke(prompt)

    # Make sure total_questions is always correct.
    result.total_questions = len(result.answers)

    return {
        "agent_response": result.model_dump()
    }

# ============================================================
# STEP 3
# Pause when user input is required
# ============================================================

def check_unanswered_node(state: FormAgentState):

    agent_response = state.get("agent_response", {})

    unanswered = [
        answer
        for answer in agent_response.get("answers", [])
        if answer.get("needs_user_input") is True
    ]

    if not unanswered:
        return {
            "unanswered_questions": []
        }

    user_answers = interrupt({
        "type": "user_input_required",
        "questions": unanswered,
    })

    return {
        "user_answers": user_answers,
        "unanswered_questions": unanswered,
    }

def merge_user_answers_node(state: FormAgentState):
    agent_response = state.get("agent_response", {})
    user_answers = state.get("user_answers", {})

    merged_answers = []

    for answer in agent_response.get("answers", []):
        if answer.get("needs_user_input") is True:

            # Try matching by id → name → question text (in order)
            question_id = (
                answer.get("id")
                or answer.get("name")
                or answer.get("question")
            )

            user_value = None

            # 1. Direct key match (id or name)
            direct_key = answer.get("id") or answer.get("name")
            if direct_key and direct_key in user_answers:
                user_value = user_answers[direct_key]

            # 2. Fallback: match by question text
            if user_value is None and answer.get("question") in user_answers:
                user_value = user_answers[answer["question"]]

            # 3. Fallback: case-insensitive question text match
            if user_value is None:
                q_lower = (answer.get("question") or "").strip().lower()
                for key, val in user_answers.items():
                    if key.strip().lower() == q_lower:
                        user_value = val
                        break

            if user_value is not None:
                answer = {
                    **answer,
                    "answer": user_value,
                    "confidence": 1.0,
                    "needs_user_input": False,
                    "answer_source": "user_input",
                }
            else:
                print(
                    f"[merge_user_answers] WARNING: No user answer found "
                    f"for question '{answer.get('question')}' "
                    f"(id={answer.get('id')}, name={answer.get('name')}). "
                    f"Available keys: {list(user_answers.keys())}"
                )

        merged_answers.append(answer)

    return {
        "agent_response": {
            **agent_response,
            "answers": merged_answers,
            "total_questions": len(merged_answers),
        }
    }
# ============================================================
# GRAPH
# ============================================================

# ============================================================
# GRAPH
# ============================================================

builder = StateGraph(FormAgentState)

builder.add_node(
    "extract_questions",
    extract_questions_node,
)

builder.add_node(
    "analyze_questions",
    analyze_questions_node,
)

builder.add_node(
    "check_unanswered",
    check_unanswered_node,
)
builder.add_node(
    "merge_user_answers",
    merge_user_answers_node,
)

builder.add_edge(
    START,
    "extract_questions",
)

builder.add_edge(
    "extract_questions",
    "analyze_questions",
)

builder.add_edge(
    "analyze_questions",
    "check_unanswered",
)

builder.add_edge(
    "check_unanswered",
    "merge_user_answers",
)

builder.add_edge(
    "merge_user_answers",
    END,
)

checkpointer = MemorySaver()

form_agent = builder.compile(
    checkpointer=checkpointer
)

# ============================================================
# PUBLIC FUNCTION
# ============================================================

def analyze_form_questions(
    mapped_form: dict,
    profile: UserProfile,
    job_context: dict | None = None,
    thread_id: str = "test-thread",
):

    try:
        result = form_agent.invoke(
            {
                "mapped_form": mapped_form,
                "profile": profile.model_dump(),
                "job_context": job_context or {},
            },
            config={
                "configurable": {
                    "thread_id": thread_id
                }
            },
        )
        return result
    except Exception as e:
        print(f"[AI ERROR] form_agent.invoke failed: {e}")
        return {
            "mapped_form": mapped_form,  # Return untouched map
            "ai_error": "The AI is currently experiencing high demand and returned a 503 error. Please wait a few seconds and tap Apply again."
        }

def resume_form_questions(
    thread_id: str,
    user_answers: dict,
):
    result = form_agent.invoke(
        Command(resume=user_answers),
        config={
            "configurable": {
                "thread_id": thread_id
            }
        },
    )

    return result