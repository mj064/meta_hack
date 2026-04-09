import asyncio
import os
import json
from typing import List, Optional

from openai import AsyncOpenAI
from server.env.environment import ContentGuardEnv

# --- MANDATORY CONFIGURATION ---
API_BASE_URL = os.getenv("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o-mini")
HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("API_KEY")
LOCAL_IMAGE_NAME = os.getenv("LOCAL_IMAGE_NAME", "content-guard-env")
# -------------------------------

BENCHMARK = "ContentGuardEnv"
MAX_STEPS = 1
TEMPERATURE = 0.0
MAX_TOKENS = 500
SUCCESS_THRESHOLD = 0.7

def log_start(task: str, env: str, model: str) -> None:
    print(f"[START] task={task} env={env} model={model}", flush=True)

def log_step(step: int, action: str, reward: float, done: bool, error: Optional[str]) -> None:
    error_val = error if error else "null"
    done_val = str(done).lower()
    action_clean = str(action).replace("\n", " ").replace("\r", "")
    print(f"[STEP] step={step} action={action_clean} reward={reward:.4f} done={done_val} error={error_val}", flush=True)

def log_end(success: bool, steps: int, score: float, rewards: List[float]) -> None:
    rewards_str = ",".join(f"{r:.4f}" for r in rewards)
    print(f"[END] success={str(success).lower()} steps={steps} score={score:.4f} rewards={rewards_str}", flush=True)

async def evaluate_task(env: ContentGuardEnv, client: AsyncOpenAI, task_id: str) -> float:
    """Evaluates a single task and returns the reward."""
    log_start(task=task_id, env=BENCHMARK, model=MODEL_NAME)
    
    rewards: List[float] = []
    steps_total = 0
    
    try:
        obs = env.reset(task_id=task_id)
        
        for step_idx in range(1, MAX_STEPS + 1):
            sys_prompt = "Expert Trust & Safety Auditor. Respond with JSON only. Strictly align with Meta Policies."
            user_prompt = f"Task: {obs.task_description}\n\nCase:\n{obs.content_case.model_dump_json()}\n\nPolicy Context: {obs.policy_briefing.model_dump_json()}"
            
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=[{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS,
                response_format={"type": "json_object"}
            )
            
            action_pkg = json.loads(response.choices[0].message.content)
            result = await env.step(action_pkg, client=client, model=MODEL_NAME)
            
            reward = result["reward"]
            done = result["done"]
            rewards.append(reward)
            steps_total = step_idx
            
            log_step(step=step_idx, action=json.dumps(action_pkg), reward=reward, done=done, error=None)
            if done: break

        score = sum(rewards) / len(rewards) if rewards else 0.0
        success = score >= SUCCESS_THRESHOLD
        log_end(success=success, steps=steps_total, score=score, rewards=rewards)
        return score

    except Exception as e:
        print(f"[ERROR] Task {task_id} failed: {e}")
        log_end(success=False, steps=steps_total, score=0.05, rewards=[0.05])
        return 0.05

async def main() -> None:
    # 1. Initialize Standard Client
    if not HF_TOKEN:
        print("[ERROR] HF_TOKEN is missing. Evaluation cannot proceed.")
        return

    client = AsyncOpenAI(base_url=API_BASE_URL, api_key=HF_TOKEN)
    env = await ContentGuardEnv.from_docker_image(LOCAL_IMAGE_NAME)

    # 2. Portfolio Evaluation (Elite v3.7 Multitask Loop)
    # If CG_TASK is set, run only that task. Otherwise, run the full suite.
    target_task = os.getenv("CG_TASK")
    tasks_to_run = [target_task] if target_task else ["easy", "medium", "hard"]

    for tid in tasks_to_run:
        await evaluate_task(env, client, tid)

    await env.close()

if __name__ == "__main__":
    asyncio.run(main())
