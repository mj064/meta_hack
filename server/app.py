"""
ContentGuardEnv — Policy Enforcement Gateway (v1.0)
==================================================
This server acts as the primary interface between LLM agents and the 
ContentGuard moderation environment. It exposes a standardized OpenEnv 
OpenAPI/WebSocket interface to facilitate autonomous training and 
benchmarking across Meta community standards.

Key Features:
- Real-time policy-trace streaming via WebSockets.
- Dynamic environment resetting for multi-task RLHF.
- Automated grading & reward calculation.
"""

import os
import json
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from openai import AsyncOpenAI

# Internal module imports (Post-Restructure)
from env import ContentGuardEnv

app = FastAPI(
    title="ContentGuardEnv Gateway",
    description="Operational environment for Meta-scale Trust & Safety agent benchmarking.",
    version="1.0.0",
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Resource Path Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

sessions: Dict[str, ContentGuardEnv] = {}

# LLM Inference Client (Defaulting to Hackathon standard endpoints)
DEFAULT_BASE_URL = os.environ.get("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME = os.environ.get("MODEL_NAME", "gpt-4o-mini")
DEFAULT_API_KEY = os.environ.get("HF_TOKEN") or os.environ.get("OPENAI_API_KEY")


def _is_placeholder_api_key(api_key: Optional[str]) -> bool:
    if not api_key:
        return True
    lowered = api_key.strip().lower()
    return lowered in {"sk-placeholder", "your_api_key", "changeme"}


def _resolve_session_client(cfg: Optional[Dict[str, Any]]) -> tuple[Optional[AsyncOpenAI], str]:
    """Build a runtime client from UI config with provider-aware routing rules."""
    if not cfg:
        return aclient, MODEL_NAME

    api_key = (cfg.get("api_key") or "").strip()
    base_url = (cfg.get("base_url") or "").strip() or DEFAULT_BASE_URL
    model = (cfg.get("model") or "").strip() or MODEL_NAME

    if _is_placeholder_api_key(api_key):
        # No runtime key provided: use server default if configured, otherwise deterministic grading fallback.
        return aclient, MODEL_NAME

    if api_key.startswith("hf_") and "openai.com" in base_url:
        base_url = "https://api-inference.huggingface.co/v1"
    elif api_key.startswith("sk-") and "huggingface.co" in base_url:
        base_url = "https://api.openai.com/v1"

    if api_key.startswith("hf_") and not (cfg.get("model") or "").strip():
        model = "meta-llama/Llama-3-70b-instruct"

    return AsyncOpenAI(api_key=api_key, base_url=base_url), model


def _build_demo_action(env: ContentGuardEnv) -> Dict[str, Any]:
    """Generate a task-valid deterministic action when live inference is unavailable."""
    gt = env.ground_truth or {}
    if env.task_id == "easy":
        return {"violation": gt.get("violation", "safe")}
    if env.task_id == "medium":
        return {
            "action": gt.get("action", "no_action"),
            "severity": int(gt.get("severity", 3)),
            "reasoning": "Deterministic demo fallback due unavailable inference credentials.",
        }
    return {
        "ruling": gt.get("ruling", "upheld"),
        "policy_references": gt.get("policy_references", []),
        "explanation": "Deterministic fallback path used because model inference is unavailable.",
        "user_guidance": "Review platform standards and avoid repeating flagged behavior.",
    }


aclient: Optional[AsyncOpenAI] = None
if not _is_placeholder_api_key(DEFAULT_API_KEY):
    aclient = AsyncOpenAI(api_key=DEFAULT_API_KEY.strip(), base_url=DEFAULT_BASE_URL)

class ResetRequest(BaseModel):
    task_id: str = Field(default="easy", description="Difficulty tier: easy | medium | hard")

class StepRequest(BaseModel):
    action: Dict[str, Any] = Field(..., description="Agent moderation decision package")

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_dashboard():
    """Serves the primary autonomous monitoring interface."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if not os.path.exists(index_path):
        return HTMLResponse("ContentGuard Dashboard: Static assets not found. Check /server/static deployment.")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.post("/reset", tags=["Core API"])
async def reset_environment(req: ResetRequest = ResetRequest()):
    """Initializes a new moderation case and returns the observation state."""
    env = ContentGuardEnv()
    obs = env.reset(task_id=req.task_id)
    sessions[env.episode_id] = env
    return obs

@app.post("/step/{episode_id}", tags=["Core API"])
async def process_step(episode_id: str, req: StepRequest):
    """Submits an agent decision and returns a policy-aligned reward signal."""
    env = sessions.get(episode_id)
    if not env:
        raise HTTPException(404, f"Session '{episode_id}' not active or expired.")
    try:
        return await env.step(req.action, client=aclient, model=MODEL_NAME)
    except RuntimeError as e:
        raise HTTPException(400, f"Policy Engine Conflict: {str(e)}")

@app.get("/state/{episode_id}", tags=["Advanced Utility"])
async def get_env_state(episode_id: str):
    """Retrieves the full internal state of an active moderation episode."""
    env = sessions.get(episode_id)
    if not env:
        raise HTTPException(404, f"Session '{episode_id}' not found.")
    return env.state()

@app.get("/health", tags=["System"])
async def check_health():
    return {"status": "operational", "active_sessions": len(sessions), "engine": "ContentGuardEnv"}

@app.websocket("/ws")
async def policy_trace_socket(websocket: WebSocket):
    """Streams real-time reasoning traces and environment telemetry."""
    await websocket.accept()
    env: ContentGuardEnv | None = None
    session_client: AsyncOpenAI | None = aclient
    session_model: str = MODEL_NAME
    
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Malformed WebSocket packet."})
                continue

            cmd = msg.get("action")
            # Universal Credential Injector (Session-based)
            if "config" in msg:
                session_client, session_model = _resolve_session_client(msg.get("config"))

            if cmd == "reset":
                env = ContentGuardEnv()
                try:
                    obs = env.reset(task_id=msg.get("task_id", "easy"))
                    # Explicitly dump Pydantic model for WebSocket JSON serialization
                    await websocket.send_json({"type": "reset", "observation": obs.model_dump()})
                except ValueError as e:
                    await websocket.send_json({"type": "error", "message": str(e)})
                    
            elif cmd == "step":
                if not env:
                    await websocket.send_json({"type": "error", "message": "State conflict: Submit reset before step."})
                    continue
                try:
                    result = await env.step(msg.get("data", {}), client=session_client, model=session_model)
                    await websocket.send_json({"type": "step", "result": result})
                except RuntimeError as e:
                    await websocket.send_json({"type": "error", "message": f"Execution halted: {str(e)}"})

            elif cmd == "run_agent":
                if not env:
                    await websocket.send_json({"type": "error", "message": "Session inactive."})
                    continue
                if env.done:
                    await websocket.send_json({"type": "error", "message": "Episode finished. Call reset() for a new case."})
                    continue
                try:
                    await websocket.send_json({"type": "stream", "content": f"[START] ep={env.episode_id} task={env.task_id}\n"})

                    if session_client is None:
                        raise RuntimeError("No API credentials configured.")
                    
                    sys_prompt = "Expert Safety Moderator. Respond with JSON only. Strictly align with platform policies."
                    user_prompt = f"Policy Task: {env._task_config['description']}\n\nEvidence:\n{json.dumps(env.case)}\n\nSubmit ruling in JSON."
                    
                    stream = await session_client.chat.completions.create(
                        model=session_model,
                        messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
                        temperature=0.0,
                        stream=True
                    )
                    
                    full_response = ""
                    async for chunk in stream:
                        content = chunk.choices[0].delta.content
                        if content:
                            full_response += content
                            await websocket.send_json({"type": "stream", "content": content})

                    if not full_response.strip():
                        raise ValueError("Model returned an empty response.")
                    
                    # Clean/Parse Output
                    js_str = full_response.strip()
                    if js_str.startswith("```"):
                        js_str = js_str.split("```")[1]
                        if js_str.startswith("json"): js_str = js_str[4:]
                    
                    action = json.loads(js_str.strip())
                    await websocket.send_json({"type": "stream", "content": f"\n\n[STEP] Policy Ingested: {json.dumps(action)}\n"})
                    
                    result = await env.step(action, client=session_client, model=session_model)
                    await websocket.send_json({"type": "step", "result": result})
                    await websocket.send_json({"type": "stream", "content": f"[END] Result: Success. Reward: {result['reward']:.4f}\n"})
                    
                except Exception as e:
                    err_text = str(e)
                    lowered_err = err_text.lower()
                    if "invalid_api_key" in lowered_err or "incorrect api key" in lowered_err or "api key" in lowered_err or "401" in lowered_err:
                        err_text = "Authentication failed for the configured provider."

                    await websocket.send_json({"type": "stream", "content": f"\n\n[NOTICE] Inference Unavailable: {err_text}\nInitiating Passive Grader demo...\n"})

                    if env.done:
                        await websocket.send_json({"type": "error", "message": "Episode finished. Call reset() for a new case."})
                        continue
                    
                    sim_action = _build_demo_action(env)
                    
                    try:
                        result = await env.step(sim_action, client=None, model=session_model)
                        await websocket.send_json({"type": "step", "result": result})
                        await websocket.send_json({"type": "stream", "content": f"\n[DEMO] Passive Ruling Emitted. Final Reward: {result['reward']:.4f}\n"})
                    except RuntimeError as step_error:
                        await websocket.send_json({"type": "error", "message": str(step_error)})
            
            elif cmd == "state":
                if env: await websocket.send_json({"type": "state", "state": env.state()})
    except WebSocketDisconnect:
        pass

def main():
    """Server entry point for OpenEnv validation."""
    print("🚀 Initializing ContentGuard Policy Gateway...")
    uvicorn.run("app:app", host="0.0.0.0", port=7860, reload=False)

if __name__ == "__main__":
    main()
