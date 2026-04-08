import asyncio
import os
import json
import textwrap
from typing import List, Optional

from openai import AsyncOpenAI
from server.env.environment import ContentGuardEnv

# --- MANDATORY CONFIGURATION ---
API_BASE_URL = os.getenv("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o-mini")
HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("API_KEY")
LOCAL_IMAGE_NAME = os.getenv("LOCAL_IMAGE_NAME", "content-guard-env")
# -------------------------------

TASK_ID = os.getenv("CG_TASK", "hard")
BENCHMARK = "ContentGuardEnv"

# Evaluation Constants
MAX_STEPS = 1
TEMPERATURE = 0.0
MAX_TOKENS = 500
SUCCESS_THRESHOLD = 0.7

def log_start(task: str, env: str, model: str) -> None:
    print(f"[START] task={task} env={env} model={model}", flush=True)

def log_step(step: int, action: str, reward: float, done: bool, error: Optional[str]) -> None:
    error_val = error if error else "null"
    done_val = str(done).lower()
    # Sanitize action for single-line stdout
    action_clean = str(action).replace("\n", " ").replace("\r", "")
    print(
        f"[STEP] step={step} action={action_clean} reward={reward:.2f} done={done_val} error={error_val}",
        flush=True,
    )

def log_end(success: bool, steps: int, score: float, rewards: List[float]) -> None:
    rewards_str = ",".join(f"{r:.2f}" for r in rewards)
    print(f"[END] success={str(success).lower()} steps={steps} score={score:.2f} rewards={rewards_str}", flush=True)

async def main() -> None:
    # 1. Initialize Standard Client
    client = AsyncOpenAI(base_url=API_BASE_URL, api_key=HF_TOKEN)

    # 2. Standard OpenEnv Factory Call
    env = await ContentGuardEnv.from_docker_image(LOCAL_IMAGE_NAME)

    rewards: List[float] = []
    steps_total = 0
    score = 0.0
    success = False

    log_start(task=TASK_ID, env=BENCHMARK, model=MODEL_NAME)

    try:
        # 3. Environment Reset
        obs = env.reset(task_id=TASK_ID)
        
        # 4. Evaluation Loop
        for step_idx in range(1, MAX_STEPS + 1):
            
            # Agent Prompting (Elite Moderation Prompt)
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
            
            # 5. Environment Step
            result = await env.step(action_pkg, client=client, model=MODEL_NAME)
            
            reward = result["reward"]
            done = result["done"]
            
            rewards.append(reward)
            steps_total = step_idx
            
            # 6. Step Logging (Mandatory Format)
            log_step(step=step_idx, action=json.dumps(action_pkg), reward=reward, done=done, error=None)
            
            if done:
                break

        # 7. Final Scoring
        score = sum(rewards) / len(rewards) if rewards else 0.0
        success = score >= SUCCESS_THRESHOLD

    except Exception as e:
        print(f"[ERROR] Evaluation crashed: {e}")
    finally:
        # 8. Teardown & Final Log (Mandatory Format)
        await env.close()
        log_end(success=success, steps=steps_total, score=score, rewards=rewards)

if __name__ == "__main__":
    asyncio.run(main())
