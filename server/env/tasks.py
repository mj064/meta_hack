"""
Task definitions for ContentGuardEnv.
Mirrors Meta's actual content moderation decision pipeline.
"""

VIOLATION_TYPES = [
    "hate_speech",
    "misinformation",
    "spam",
    "sexual_content",
    "violence",
    "harassment",
    "safe",
]

MODERATION_ACTIONS = [
    "remove",
    "restrict_reach",
    "add_warning_label",
    "escalate_to_human",
    "no_action",
]

TASKS: dict = {
    "easy": {
        "name": "Violation Type Detection",
        "description": (
            "You are a content moderation AI. Analyze the social media post "
            "and classify it into exactly ONE violation category.\n\n"
            "Categories:\n"
            "  hate_speech     — content targeting people based on identity\n"
            "  misinformation  — demonstrably false or misleading claims\n"
            "  spam            — unsolicited commercial/repetitive content\n"
            "  sexual_content  — explicit or suggestive sexual material\n"
            "  violence        — graphic violence or promotion of harm\n"
            "  harassment      — targeted personal attacks on individuals\n"
            "  safe            — no policy violation\n\n"
            "Respond ONLY with JSON: {\"violation\": \"<category>\"}"
        ),
        "action_space": {
            "type": "object",
            "properties": {
                "violation": {
                    "type": "string",
                    "enum": VIOLATION_TYPES,
                    "description": "The detected policy violation category.",
                }
            },
            "required": ["violation"],
        },
        "observation_space": {
            "type": "object",
            "description": "Social media post with content, metadata, and platform context.",
        },
    },

    "medium": {
        "name": "Moderation Action Decision",
        "description": (
            "You are a senior content moderator AI. Given the post AND its "
            "confirmed violation type, decide the correct enforcement action.\n\n"
            "Actions:\n"
            "  remove              — take content down immediately\n"
            "  restrict_reach      — reduce distribution (shadowban)\n"
            "  add_warning_label   — keep up with a fact-check/warning overlay\n"
            "  escalate_to_human   — too complex/sensitive, needs human review\n"
            "  no_action           — borderline, no enforcement warranted\n\n"
            "Also rate severity 1–5 (1=minor, 5=critical).\n\n"
            "Respond ONLY with JSON: "
            "{\"action\": \"<action>\", \"severity\": <1-5>, \"reasoning\": \"<brief reasoning>\"}"
        ),
        "action_space": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": MODERATION_ACTIONS,
                },
                "severity": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5,
                },
                "reasoning": {
                    "type": "string",
                    "description": "One-sentence justification for the decision.",
                },
            },
            "required": ["action", "severity", "reasoning"],
        },
        "observation_space": {
            "type": "object",
            "description": "Post + violation type + user account history + platform context.",
        },
    },

    "hard": {
        "name": "User Appeal Moderation Report",
        "description": (
            "You are a Trust & Safety AI writing the official response to a user "
            "who has appealed their content moderation decision.\n\n"
            "The report must include:\n"
            "  ruling           — 'upheld' (action stands) or 'overturned' (action reversed)\n"
            "  policy_references— list of specific Community Standard policies violated\n"
            "  explanation      — clear explanation of what violated policy and why\n"
            "  user_guidance    — what the user should do to avoid future violations\n\n"
            "Respond ONLY with JSON:\n"
            "{\n"
            "  \"ruling\": \"upheld\" | \"overturned\",\n"
            "  \"policy_references\": [\"policy_name_1\", ...],\n"
            "  \"explanation\": \"<2-3 sentence explanation>\",\n"
            "  \"user_guidance\": \"<actionable guidance>\"\n"
            "}"
        ),
        "action_space": {
            "type": "object",
            "properties": {
                "ruling": {"type": "string", "enum": ["upheld", "overturned"]},
                "policy_references": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "explanation": {"type": "string"},
                "user_guidance": {"type": "string"},
            },
            "required": ["ruling", "policy_references", "explanation", "user_guidance"],
        },
        "observation_space": {
            "type": "object",
            "description": "Full case: post + violation + action taken + user appeal message.",
        },
    },
}
