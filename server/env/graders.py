"""
ContentGuardEnv — Grading Engine (v1.0)
=====================================
This module implements the core policy-alignment scoring logic for the 
OpenEnv moderation benchmark. It evaluates agent decisions against 
Meta Community Standards across three primary dimensions: 
1. Categorical Precision (Easy)
2. Enforcement Proximity (Medium) 
3. Appellate Reasoning & Procedural Accuracy (Hard)
"""

import json
from typing import Any, Dict, List, Tuple, Optional

# ── Policy Ontology & Relations ────────────────────────────────────────────────
# Hierarchical mapping used for partial credit (Policy Proximity Scoring).
_POLICY_CLUSTERS = {
    "hate_speech":     {"harassment", "violence", "hateful_conduct"},
    "harassment":      {"hate_speech", "violence", "bullying"},
    "violence":        {"hate_speech", "harassment", "incitement"},
    "misinformation":  {"integrity", "harmful_content"},
    "spam":            {"inauthentic_activity", "commercial_scams"},
    "sexual_content":  {"adult_material", "non_consensual"},
    "safe":            set(),
}

# Standard Enforcement Escalation Ladder (ordered by severity)
_ENFORCEMENT_LADDER = ["no_action", "add_warning_label", "restrict_reach", "escalate_to_human", "remove"]

def _smooth_reward(score: float) -> float:
    """
    Sovereign v3.7 Logic: Ensures scores are strictly between 0 and 1.
    Translates [0, 1] range to [0.01, 0.99] for automated validator compliance.
    """
    return round(max(0.01, min(0.99, score)), 4)


# ── EASY: Categorical Alignment ────────────────────────────────────────────────

def _grade_easy(action: Dict, ground_truth: Dict, **_) -> Tuple[float, str]:
    """
    Evaluates categorical precision using Policy Proximity Scoring.
    Provides partial credit for mapping to the correct 'Policy Cluster'.
    """
    predicted = (action.get("violation") or "").strip().lower()
    actual = ground_truth.get("violation", "").lower()

    if predicted == actual:
        score = 1.0
        msg = f"Policy Alignment: Perfect. Correct violation category identified: '{actual}'."
    elif predicted in _POLICY_CLUSTERS.get(actual, set()):
        score = 0.5 # Boosted from 0.4 for better research utility
        msg = f"Policy Alignment: Hierarchical Match. '{predicted}' belongs to the '{actual}' proximity cluster."
    else:
        score = 0.0
        msg = f"Policy Alignment: Failed. Predicted '{predicted}' is outside the ground truth scope of '{actual}'."

    return score, msg


# ── MEDIUM: Enforcement Proximity ──────────────────────────────────────────────

def _grade_medium(action: Dict, ground_truth: Dict, **_) -> Tuple[float, str]:
    """
    Calculates proximity to ideal enforcement action and severity rating.
    Uses 'Enforcement Ladder Distance' for partial credit.
    """
    pred_action = (action.get("action") or "").strip().lower()
    gold_action = ground_truth.get("action", "").lower()

    pred_severity = action.get("severity")
    gold_severity = ground_truth.get("severity", 3)

    # 1. Action Scaling (60% weight)
    if pred_action == gold_action:
        action_score = 0.6
    else:
        try:
            pred_idx = _ENFORCEMENT_LADDER.index(pred_action)
            gold_idx = _ENFORCEMENT_LADDER.index(gold_action)
            diff = abs(pred_idx - gold_idx)
            # Tiered partial credit
            action_score = 0.4 if diff == 1 else (0.2 if diff == 2 else 0.0)
        except ValueError:
            action_score = 0.0

    # 2. Severity Precision (40% weight)
    try:
        sev_diff = abs(int(pred_severity) - int(gold_severity))
        severity_score = 0.4 if sev_diff == 0 else (0.2 if sev_diff == 1 else 0.0)
    except (TypeError, ValueError):
        severity_score = 0.0

    total = round(action_score + severity_score, 4)
    feedback = (
        f"Alignment Score: {total:.3f} | "
        f"Enforcement Match: {action_score/0.6:.0%} | "
        f"Severity Variance: {1.0 - (severity_score/0.4):.0%} Delta"
    )
    return total, feedback


# ── HARD: Appellate Report Quality ─────────────────────────────────────────────

# Explicit Policy Mappings (Meta Community Standard References)
_META_POLICY_MAP = {
    "hate_speech": ["Hate Speech Policy", "Community Standards Section 12", "Protected Characteristics Policy"],
    "misinformation": ["Misinformation Policy", "Health Misinformation Guidelines", "Integrity Policies"],
    "spam": ["Spam and Fake Engagement Policy", "Inauthentic Behavior Policy"],
    "sexual_content": ["Adult Nudity and Sexual Activity Policy", "Child Safety Policy"],
    "violence": ["Violence and Incitement Policy", "Dangerous Individuals Policy", "Coordinating Harm Policy"],
    "harassment": ["Bullying and Harassment Policy", "Privacy Policy", "Doxxing Policy"],
    "safe": [],
}

def _grade_hard(action: Dict, ground_truth: Dict, case: Dict, **_) -> Tuple[float, str]:
    """
    High-Fidelity Appellate Review Simulator.
    Evaluates: Verdict (30%), Policy Citations (20%), Reasoning (30%), Evidence (20%).
    """
    violation = ground_truth.get("violation", "safe")
    gold_ruling = ground_truth.get("ruling", "upheld")
    evidence_text = case.get("content", "").lower()

    pred_ruling = (action.get("ruling") or "").strip().lower()
    pred_policies = [p.lower() for p in (action.get("policy_references") or [])]
    pred_explanation = (action.get("explanation") or "").lower()
    pred_guidance = (action.get("user_guidance") or "").strip()

    # 1. Verdict (30%)
    ruling_score = 0.3 if pred_ruling == gold_ruling else 0.0

    # 2. Policy Citations (20%)
    gold_policies = [p.lower() for p in _META_POLICY_MAP.get(violation, [])]
    policy_score = 0.0
    if gold_policies:
        matched = sum(1 for gp in gold_policies if any(gp in pp or pp in gp for pp in pred_policies))
        # Elite v3.0 logic: Tiered credit. 1 correct = 50% credit. More = 100%.
        if matched >= 1:
            policy_score = 0.2 if matched == len(gold_policies) else 0.15
        else:
            policy_score = 0.0
    elif not pred_policies:
        policy_score = 0.2

    # 3. Reasoning & Keyword Match (30%)
    key_terms = {
        "hate_speech": ["hate", "identity", "protected", "group", "slur", "dehumanize"],
        "misinformation": ["false", "mislead", "fact", "claim", "health", "harm"],
        "spam": ["unsolicited", "commercial", "fake", "repeated", "scam"],
        "sexual_content": ["explicit", "nudity", "sexual", "consent", "minor"],
        "violence": ["threat", "harm", "danger", "incitement", "physical"],
        "harassment": ["target", "personal", "bully", "attack", "malicious"],
        "safe": ["comply", "policy", "standard", "permitted", "nuance"],
    }
    terms = key_terms.get(violation, [])
    found_terms = sum(1 for t in terms if t in pred_explanation)
    # Tiered credit: 1 term = 50% credit. 2+ terms = 100% credit.
    if terms:
        if found_terms >= 2:
            explanation_score = 0.3
        elif found_terms == 1:
            explanation_score = 0.15
        else:
            explanation_score = 0.0
    else:
        explanation_score = 0.3

    # 4. Evidence Extraction (20%)
    evidence_score = 0.0
    if any(word in pred_explanation for word in evidence_text.split() if len(word) > 4):
        evidence_score = 0.2
    elif len(pred_explanation) > 50:
        evidence_score = 0.1

    total = round(ruling_score + policy_score + explanation_score + evidence_score, 4)
    feedback = (
        f"Policy Fidelity: {total:.3f} | "
        f"Ruling: {pred_ruling.upper()} | "
        f"Reasoning Quality: {explanation_score/0.3:.0%} | "
        f"Evidence Usage: {evidence_score/0.2:.0%}"
    )
    return total, feedback


# ── Elite v3.0: Teacher Feedback Rationale ─────────────────────────────────────
_POLICY_RATIONALE = {
    "hate_speech": "Content targeting protected groups with dehumanizing language, slurs, or exclusion is a Tier 1 violation under Meta Section 12.",
    "misinformation": "Health or civic claims that are demonstrably false and likely to lead to physical or social harm require labels or removal.",
    "spam": "Unsolicited commercial content or fake engagement patterns undermine platform integrity and user trust.",
    "sexual_content": "Explicit sexual activity or non-consensual imagery is strictly prohibited to maintain community safety.",
    "violence": "Direct threats, incitement to harm, or praise of dangerous organizations violate the physical safety policy.",
    "harassment": "Targeted attacks on private individuals, including bullying or malicious repetitive behavior, violate personal dignity standards.",
    "safe": "Content does not meet the threshold for violation; context suggests satire, political speech, or benign conversation.",
}


# ── Registry & Dispatcher ───────────────────────────────────────────────────────

_GRADERS = {
    "easy": _grade_easy,
    "medium": _grade_medium,
    "hard": _grade_hard,
}


# ── Elite v3.2: AI Judge Prompt Template ──────────────────────────────────────
_JUDGE_PROMPT_TEMPLATE = """
As a lead Trust & Safety Meta Policy Auditor, evaluate the following moderation decision.

[ENVIRONMENT CONTEXT]
Policy in Focus: {policy_focus}
Platform Logic: {task_description}

[CONTENT CASE]
{content_case}

[AGENT DECISION]
{agent_action}

[GRADING RUBRIC]
1. Policy Alignment: Did the agent select the correct violation category?
2. Enforcement Proximity: Is the severity and action (remove/label/etc) appropriate?
3. Reasoning Quality: Is the explanation nuanced and grounded in the evidence?

Respond with JSON only:
{{
  "score": float (0.0 to 1.0),
  "feedback": "Concise professional audit feedback",
  "rationale": "Gold standard policy justification"
}}
"""


# ── Async Dispatcher & AI-as-a-Judge ───────────────────────────────────────────

async def grade_action_async(
    action: Dict,
    ground_truth: Dict,
    task_id: str,
    case: Dict,
    client: Optional[Any] = None,
    model: str = "gpt-4o-mini",
    task_description: str = ""
) -> Tuple[float, str, str]:
    """
    Elite v3.2 Dispatcher supporting real-time AI Judging.
    """
    # 1. Easy tasks always use the fast deterministic grader.
    # 2. If client is missing, fall back to professional heuristics.
    if task_id == "easy" or client is None:
        return grade_action(action, ground_truth, task_id, case)

    try:
        actual_violation = ground_truth.get("violation", "safe")
        prompt = _JUDGE_PROMPT_TEMPLATE.format(
            policy_focus=actual_violation,
            task_description=task_description,
            content_case=json.dumps(case, indent=2),
            agent_action=json.dumps(action, indent=2)
        )

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a Meta Community Standards Auditor. Output JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0,
            response_format={"type": "json_object"}
        )

        audit = json.loads(response.choices[0].message.content)
        
        score = float(audit["score"]) if "score" in audit else 0.5

        # Merge AI score with deterministic ruling check for 'Hard' tasks (integrity check)
        # This ensures the AI doesn't hallucinate a pass on a fundamentally wrong ruling.
        if task_id == "hard":
            gold_ruling = ground_truth.get("ruling", "upheld")
            pred_ruling = (action.get("ruling") or "").strip().lower()
            if pred_ruling != gold_ruling:
                score = min(score, 0.3) # Hard penalty for wrong verdict
        
        return _smooth_reward(score), f"[AI JUDGE] {audit['feedback']}", audit["rationale"]

    except Exception as e:
        # Robust Fallback to Heuristic Grader
        reward, feedback, rationale = grade_action(action, ground_truth, task_id, case)
        return reward, f"[FALLBACK] {feedback} (AI Judge Error: {str(e)})", rationale


def grade_action(
    action: Dict,
    ground_truth: Dict,
    task_id: str,
    case: Dict,
) -> Tuple[float, str, str]:
    """
    Deterministic fallback for environment rewards.
    """
    grader = _GRADERS.get(task_id)
    if grader is None:
        raise ValueError(f"CRITICAL: No grading rubric found for task_id '{task_id}'.")
    
    reward, feedback = grader(action, ground_truth, case=case)
    
    actual_violation = ground_truth.get("violation", "safe")
    rationale = _POLICY_RATIONALE.get(actual_violation, "Standard policy compliance.")
    
    return _smooth_reward(reward), feedback, rationale
