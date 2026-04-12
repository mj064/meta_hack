"""
ContentGuardEnv — Core environment class.

An OpenEnv-compliant environment where AI agents learn to perform
social media content moderation — the same challenge Meta faces at
100 billion+ content items per week.
"""

import uuid
import random
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from .data_gen import generate_case
from .tasks import TASKS
from .graders import grade_action_async


class PolicyBriefing(BaseModel):
    """Dynamic platform guidance for the agent."""
    alert_level: str
    current_focus: str
    guidance_summary: str


class GlobalRisk(BaseModel):
    """Platform-wide risk telemetry."""
    queue_depth: int
    avg_harm_potential: float


class ModerationCase(BaseModel):
    """Pydantic model for a Content Moderation Ticket."""
    post_id: str
    content: str
    platform: str
    user_account: Dict[str, Any]
    engagement: Dict[str, Any]
    flags: Dict[str, Any]
    detected_violation: Optional[str] = None
    action_taken: Optional[str] = None
    user_appeal: Optional[str] = None


class Observation(BaseModel):
    """Standard Observation package."""
    episode_id: str
    task_id: str
    task_name: str
    task_description: str
    content_case: ModerationCase
    policy_briefing: PolicyBriefing
    global_risk: GlobalRisk
    action_space: Dict[str, Any]
    observation_space: Dict[str, Any]


class ContentGuardEnv:
    """
    OpenEnv Environment: Social Media Content Moderation.
    - Professional Operational Modeling.
    """

    def __init__(self) -> None:
        self.episode_id: str = str(uuid.uuid4())
        self.task_id: Optional[str] = None
        self.case: Optional[Dict[str, Any]] = None
        self.ground_truth: Optional[Dict[str, Any]] = None
        self.step_count: int = 0
        self.total_reward: float = 0.0
        self.done: bool = False
        self._task_config: Optional[Dict] = None

    # ── OpenEnv API ────────────────────────────────────────────────────────────

    def reset(self, task_id: str = "easy") -> Observation:
        """Load a new moderation case with reactive global context."""
        if task_id not in TASKS:
            raise ValueError(f"Unknown task_id '{task_id}'. Valid: {list(TASKS.keys())}")
        
        self.task_id = task_id
        self.step_count = 0
        self.total_reward = 0.0
        self.done = False
        self._task_config = TASKS[task_id]
        self.case, self.ground_truth = generate_case(task_id)

        # Standard operational context modeling
        briefing = PolicyBriefing(
            alert_level=random.choice(["Green", "Yellow", "Elevated", "Critical"]),
            current_focus=random.choice(["Electoral Integrity", "Public Health", "Minor Safety", "General Policy"]),
            guidance_summary="Prioritize enforcement for repeat offenders and high-impact viral content."
        )
        
        risk = GlobalRisk(
            queue_depth=random.randint(100, 5000),
            avg_harm_potential=round(random.uniform(2.0, 8.0), 2)
        )

        return Observation(
            episode_id=self.episode_id,
            task_id=task_id,
            task_name=self._task_config["name"],
            task_description=self._task_config["description"],
            content_case=ModerationCase(**self.case),
            policy_briefing=briefing,
            global_risk=risk,
            action_space=self._task_config["action_space"],
            observation_space=self._task_config["observation_space"],
        )

    async def step(
        self, 
        action: Dict[str, Any], 
        client: Optional[Any] = None, 
        model: str = "gpt-4o-mini"
    ) -> Dict[str, Any]:
        """Submit a moderation decision package and receive alignment reward."""
        if self.done:
            raise RuntimeError("Episode finished. Call reset() for a new case.")

        # AI-as-a-Judge Logic integration
        reward, feedback, rationale = await grade_action_async(
            action=action,
            ground_truth=self.ground_truth,
            task_id=self.task_id,
            case=self.case,
            client=client,
            model=model,
            task_description=self._task_config.get("description", "")
        )
        
        self.step_count += 1
        self.total_reward += reward
        self.done = True

        return {
            "observation": None,
            "reward": float(round(reward, 4)),
            "done": self.done,
            "info": {
                "feedback": feedback,
                "ground_truth_reasoning": rationale,
                "ground_truth": self.ground_truth,
                "metrics": {
                    "reasoning_accuracy": 1.0 if reward > 0.8 else 0.0,
                    "policy_compliance": reward
                }
            },
        }

    def state(self) -> Dict[str, Any]:
        """Return current episode telemetry."""
        return {
            "episode_id": self.episode_id,
            "task_id": self.task_id,
            "step_count": self.step_count,
            "total_reward": float(round(self.total_reward, 4)),
            "done": self.done,
            "operational": True
        }

    async def close(self) -> None:
        """Standard OpenEnv teardown."""
        self.done = True

    @classmethod
    async def from_docker_image(cls, image_name: str):
        """Standard OpenEnv factory for evaluation compliance."""
        return cls()
