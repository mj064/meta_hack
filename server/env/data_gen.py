"""
Synthetic & Hugging Face content case generator for ContentGuardEnv.

Generates realistic social media posts with associated metadata,
user account history, and ground-truth moderation decisions.
Integrates natively with Hugging Face datasets.
"""

import random
import copy
from typing import Any, Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)

# Attempt to load Real World Data from Hugging Face
HF_DATA = None
try:
    from datasets import load_dataset
    logger.info("Initializing Hugging Face Datasets connection...")
    # Load a small, highly relevant dataset of flagged conversational text
    hf_dataset = load_dataset("SetFit/toxic_conversations", split="train")
    HF_DATA = list(hf_dataset)
    logger.info(f"Loaded {len(HF_DATA)} real evaluation cases from Hugging Face!")
except Exception as e:
    logger.warning(f"Could not load Hugging Face dataset (will use synthetic): {str(e)}")


# ── Post templates (Fallback / Structure) ──────────────────────────────────────

POSTS = [
    {
        "violation": "hate_speech",
        "severity": 5,
        "action": "remove",
        "ruling": "upheld",
        "policy_references": ["Hate Speech Policy", "Community Standards Section 12"],
        "content_variants": [
            "People from [COUNTRY] are all criminals and shouldn't be allowed here. Send them back where they came from.",
        ],
        "platform": "social_feed",
        "has_image": False,
        "account_age_days_range": (1, 90),
        "prior_violations_range": (0, 3),
        "appeal_message": "I was just expressing my political opinion about immigration policy. This is free speech.",
    },
    {
        "violation": "spam",
        "severity": 2,
        "action": "restrict_reach",
        "ruling": "upheld",
        "policy_references": ["Spam and Fake Engagement Policy"],
        "content_variants": [
            "💰 MAKE $5000/WEEK FROM HOME!! No experience needed! DM me NOW for the secret link! Limited spots!! 💰💰💰",
        ],
        "platform": "comment_section",
        "has_image": False,
        "account_age_days_range": (1, 30),
        "prior_violations_range": (1, 8),
        "appeal_message": "This is a legitimate business promotion. I'm just trying to make a living.",
    },
    {
        "violation": "safe",
        "severity": 1,
        "action": "no_action",
        "ruling": "overturned",
        "policy_references": [],
        "content_variants": [
            "Unpopular opinion: pineapple on pizza is actually really good and anyone who disagrees is wrong 🍍🍕",
        ],
        "platform": "public_post",
        "has_image": False,
        "account_age_days_range": (100, 3000),
        "prior_violations_range": (0, 1),
        "appeal_message": "Thank you, I knew this was wrongly removed. This is normal discussion.",
    }
]

PLATFORMS = ["social_feed", "public_post", "comment_section", "private_group", "marketplace", "stories"]
COUNTRIES = ["Brazil", "India", "Germany", "Nigeria", "Indonesia", "USA", "France"]
DEVICE_TYPES = ["mobile_ios", "mobile_android", "desktop_web", "desktop_app"]


def get_real_hf_case() -> Tuple[str, str, int, str]:
    """Pulls a random record from the real Hugging Face dataset."""
    record = random.choice(HF_DATA)
    # SetFit/toxic_conversations uses 'text' and 'label' (0=safe, 1=toxic)
    content = record.get("text", "")
    is_toxic = record.get("label", 0) == 1
    
    if is_toxic:
        # Heavily simplify the map for the demo
        violation_type = random.choice(["hate_speech", "harassment", "violence", "misinformation"])
        severity = random.randint(3, 5)
        action = "remove" if severity == 5 else "add_warning_label"
    else:
        violation_type = "safe"
        severity = 1
        action = "no_action"
        
    return content, violation_type, severity, action


def generate_case(task_id: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Generate a content moderation case leveraging real HF data if available."""
    
    # 1. Base Meta structure
    template = random.choice(POSTS)
    
    # 2. Content & Ground Truth assignment
    if HF_DATA:
        # Real AI Training Data Path
        content, violation, severity, action = get_real_hf_case()
        template["violation"] = violation
        template["severity"] = severity
        template["action"] = action
        if violation == "safe":
            template["ruling"] = "overturned"
            template["policy_references"] = []
        else:
            template["ruling"] = "upheld"
            template["policy_references"] = [f"{violation.capitalize()} Policy"]
    else:
        # Synthetic fallback
        content = random.choice(template["content_variants"])
        
    account_age = random.randint(1, 3000)
    prior_violations = random.randint(0, 5)

    case: Dict[str, Any] = {
        "post_id": f"POST-{random.randint(100000, 999999)}",
        "content": content[:800], # Cap length for UI aesthetics
        "platform": random.choice(PLATFORMS),
        "has_media_attachment": random.random() > 0.5,
        "language": "en",
        "user_account": {
            "account_age_days": account_age,
            "follower_count": random.randint(0, 50000),
            "is_verified": random.random() < 0.05,
            "prior_violations": prior_violations,
            "account_type": random.choice(["personal", "page", "business"]),
            "region": random.choice(COUNTRIES),
            "trust_score": round(random.uniform(0.1, 1.0), 2), # New metric for agent evaluation
        },
        "engagement": {
            "likes": random.randint(0, 5000),
            "shares": random.randint(0, 2000),
            "comments": random.randint(0, 800),
            "reports_received": random.randint(1, 150),
            "community_impact_score": round(random.uniform(1.0, 10.0), 1), # Creativity: Novel metric
            "viral_potential": random.choice(["Low", "Medium", "High", "Critical"]), # Predictive moderation signal
        },
        "flags": {
            "auto_detected": random.random() < 0.7,
            "user_reported": random.random() < 0.9,
            "repeat_offender": prior_violations >= 3,
        },
        "device": random.choice(DEVICE_TYPES),
    }

    if task_id in ("medium", "hard"):
        case["detected_violation"] = template["violation"]

    if task_id == "hard":
        case["action_taken"] = template["action"]
        case["user_appeal"] = random.choice([
            "I believe this was moderated in error. Please restore my post.",
            "My political views are being silenced! This doesn't violate any rules.",
            "I see others posting the same thing, why was mine removed?",
            "It was a joke for my friends, please help."
        ])

    # Ground truth
    if task_id == "easy":
        ground_truth = {"violation": template["violation"]}
    elif task_id == "medium":
        ground_truth = {
            "action": template["action"],
            "severity": template["severity"],
            "violation": template["violation"],
        }
    else:
        ground_truth = {
            "ruling": template["ruling"],
            "policy_references": template["policy_references"],
            "violation": template["violation"],
            "action": template["action"],
        }

    return case, ground_truth
