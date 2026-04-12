import sys
import os
import pytest

# Add server/ to path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server")))

from env.graders import grade_action_async

@pytest.mark.asyncio
async def test_grade_easy_perfect_match():
    action = {"violation": "hate_speech"}
    ground_truth = {"violation": "hate_speech"}
    reward, feedback, rationale = await grade_action_async(action, ground_truth, "easy", {})
    assert reward == 1.0
    assert "Perfect" in feedback
    assert "Section 12" in rationale

@pytest.mark.asyncio
async def test_grade_easy_cluster_match():
    # Misclassifying Hate Speech as Harassment should give partial credit (Standard logic)
    action = {"violation": "harassment"}
    ground_truth = {"violation": "hate_speech"}
    reward, feedback, rationale = await grade_action_async(action, ground_truth, "easy", {})
    assert reward == 0.5
    assert "Hierarchical Match" in feedback

@pytest.mark.asyncio
async def test_grade_medium_action_proximity():
    # Correct action (remove) but slightly off severity
    action = {"action": "remove", "severity": 4}
    ground_truth = {"action": "remove", "severity": 5, "violation": "violence"}
    reward, feedback, rationale = await grade_action_async(action, ground_truth, "medium", {})
    # Action = 0.6, Severity = 0.2 (delta 1) -> 0.8 total
    assert reward == 0.8
    assert "Severity Variance" in feedback

@pytest.mark.asyncio
async def test_grade_hard_with_evidence():
    case = {"content": "You are a total loser and should be banned."}
    action = {
        "ruling": "upheld",
        "policy_references": ["Bullying and Harassment Policy"],
        "explanation": "The user is targeting an individual with 'loser' which is harassment.",
        "user_guidance": "Please follow our community guidelines regarding bullying."
    }
    ground_truth = {
        "violation": "harassment",
        "ruling": "upheld"
    }
    reward, feedback, rationale = await grade_action_async(action, ground_truth, "hard", case)
    
    # Verdict (0.3) + Policy (0.2) + Reasoning (0.3) + Evidence (0.2)
    # The explanation contains 'loser' from the case content, so it should get evidence credit.
    assert reward >= 0.8
    assert "Evidence Usage: 100%" in feedback
    assert "bullying" in rationale
