"""
llm_wrapper.py  -  Phase 1: Stop the 404 bleeding.

Fallback chain  (all configurable via .env):
  PRIMARY   -> Ollama phi3   (local, always free, never decommissioned)
  SECONDARY -> Gemini Flash  (cloud free-tier, stable model names)

Public API
----------
  call_llm(messages, schema=None)   - call with retry + fallback
  get_structured_llm(schema)        - drop-in for llm.with_structured_output()
  check_models_on_startup()         - validates models at boot, logs clearly
"""

import os, time, httpx
from typing import Any, Type
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv

load_dotenv()

# -- CONFIG --------------------------------------------------------------------
PRIMARY_PROVIDER   = os.getenv("PRIMARY_LLM_PROVIDER",   "ollama")
PRIMARY_MODEL      = os.getenv("PRIMARY_MODEL",           "phi3")
OLLAMA_BASE_URL    = os.getenv("OLLAMA_BASE_URL",         "http://localhost:11434")

SECONDARY_PROVIDER = os.getenv("SECONDARY_LLM_PROVIDER", "gemini")
SECONDARY_MODEL    = os.getenv("SECONDARY_MODEL",         "gemini-2.0-flash")

GEMINI_API_KEY     = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY       = os.getenv("GROQ_API_KEY")

# Cloudflare Workers AI — free tier, OpenAI-compatible, never decommissions models
CF_ACCOUNT_ID      = os.getenv("CF_ACCOUNT_ID")
CF_API_TOKEN       = os.getenv("CF_API_TOKEN")
# Default model: phi-2 (small, fast, free). Options: @cf/microsoft/phi-2, @cf/meta/llama-3.1-8b-instruct
CF_MODEL           = os.getenv("CF_MODEL", "@cf/microsoft/phi-2")

LLM_TIMEOUT        = int(os.getenv("LLM_TIMEOUT_SECONDS", "45"))
LLM_MAX_RETRIES    = int(os.getenv("LLM_MAX_RETRIES",     "2"))

PROVIDER_CHAIN = [
    (PRIMARY_PROVIDER,   PRIMARY_MODEL),
    (SECONDARY_PROVIDER, SECONDARY_MODEL),
]

# Hard-failure strings that mean "this provider cannot work" -> skip immediately
HARD_FAIL = [
    "model_not_found", "model_decommissioned", "NOT_FOUND",
    "404", "invalid_api_key", "invalid_request_error", "401", "403",
]

# -- BUILD INDIVIDUAL LLMs -----------------------------------------------------
def _build_llm(provider: str, model: str):
    p = provider.lower()
    if p == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=model, base_url=OLLAMA_BASE_URL, timeout=LLM_TIMEOUT, num_predict=1024)
    elif p == "gemini":
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not set")
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=GEMINI_API_KEY, request_timeout=LLM_TIMEOUT, max_retries=0)
    elif p == "groq":
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY not set")
        from langchain_groq import ChatGroq
        return ChatGroq(model=model, groq_api_key=GROQ_API_KEY, timeout=LLM_TIMEOUT, max_retries=0)
    elif p == "cloudflare":
        # Cloudflare Workers AI — free, OpenAI-compatible, zero model decommissioning
        # Models: @cf/microsoft/phi-2  @cf/meta/llama-3.1-8b-instruct  @cf/google/gemma-7b-it
        if not CF_ACCOUNT_ID or not CF_API_TOKEN:
            raise RuntimeError("CF_ACCOUNT_ID and CF_API_TOKEN must be set for Cloudflare provider")
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model,
            base_url=f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/v1",
            api_key=CF_API_TOKEN,
            timeout=LLM_TIMEOUT,
            max_retries=0,
        )
    else:
        raise ValueError(f"Unknown provider: {provider!r}")

# -- STARTUP HEALTH CHECK ------------------------------------------------------
def check_models_on_startup():
    print("[LLM] Running startup health check...")
    if PRIMARY_PROVIDER == "ollama":
        try:
            r = httpx.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
            available = [m["name"] for m in r.json().get("models", [])]
            if any(PRIMARY_MODEL in n for n in available):
                print(f"[LLM] OK  Ollama {PRIMARY_MODEL} is available")
            else:
                print(f"[LLM] WARN Ollama model '{PRIMARY_MODEL}' not found. Run: ollama pull {PRIMARY_MODEL}")
                print(f"[LLM]      Available: {available}")
        except Exception as e:
            print(f"[LLM] WARN Ollama unreachable at {OLLAMA_BASE_URL}: {e}")

    if SECONDARY_PROVIDER == "gemini":
        if not GEMINI_API_KEY:
            print("[LLM] WARN GEMINI_API_KEY not set - Gemini fallback disabled")
        elif not GEMINI_API_KEY.startswith("AIza"):
            print(f"[LLM] WARN GEMINI_API_KEY looks wrong (should start with AIza). Get one from aistudio.google.com/app/apikey")
        else:
            print(f"[LLM] OK  Gemini key present, model: {SECONDARY_MODEL}")
    print("[LLM] Health check done.")

# -- call_llm()  THE ONLY PLACE ALL LLM CALLS GO ------------------------------
def call_llm(messages, schema: Type[BaseModel] | None = None) -> Any:
    """
    Try PRIMARY then SECONDARY with retries and Pydantic validation.
    Raises RuntimeError only when ALL providers are exhausted.
    """
    last_error = None
    for provider, model in PROVIDER_CHAIN:
        for attempt in range(LLM_MAX_RETRIES):
            try:
                base_llm = _build_llm(provider, model)
                if schema:
                    result = base_llm.with_structured_output(schema).invoke(messages)
                    if not isinstance(result, schema):
                        result = schema.model_validate(result if isinstance(result, dict) else result.dict())
                else:
                    result = base_llm.invoke(messages)
                print(f"[LLM] OK {provider}/{model} (attempt {attempt+1})")
                return result
            except (ValidationError, ValueError) as ve:
                last_error = ve
                print(f"[LLM] Output validation failed on {provider}/{model}: {ve}")
                if attempt < LLM_MAX_RETRIES - 1:
                    time.sleep(1)
                continue
            except Exception as e:
                err = str(e)
                last_error = e
                print(f"[LLM] {provider}/{model} attempt {attempt+1} failed: {err[:200]}")
                if any(sig in err for sig in HARD_FAIL):
                    print(f"[LLM] Hard failure - skipping {provider}/{model}")
                    break
                if attempt < LLM_MAX_RETRIES - 1:
                    time.sleep(1)
        print(f"[LLM] {provider}/{model} exhausted, trying next provider...")

    raise RuntimeError(f"All LLM providers failed. Last: {last_error}")

# -- Structured LLM adapter  (drop-in for llm.with_structured_output) ---------
class _StructuredAdapter:
    def __init__(self, schema): self._schema = schema
    def invoke(self, messages): return call_llm(messages, schema=self._schema)

def get_structured_llm(schema: Type[BaseModel]) -> _StructuredAdapter:
    return _StructuredAdapter(schema)
