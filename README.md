---
title: ContentGuardEnv
emoji: 🛡️
colorFrom: blue
colorTo: blue
sdk: docker
app_port: 7860
tags:
  - openenv
  - content-moderation
  - trust-and-safety
  - meta
  - llama-3
  - agent-environment
pinned: false
---

# 🛡️ ContentGuardEnv — Autonomous Policy Enforcement Framework

> An **OpenEnv-compliant** environment where AI agents learn to perform complex, high-stakes content moderation using **Meta's Community Standards**.

[![OpenEnv](https://img.shields.io/badge/OpenEnv-compliant-blue)](https://huggingface.co/spaces?search=openenv)
[![HF Space](https://img.shields.io/badge/🤗-HuggingFace%20Space-yellow)](https://huggingface.co/spaces)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-green)](https://python.org)
[![License MIT](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

---

## 🌎 The Real-World Problem

At Meta-scale, platforms process **billions of posts** daily. Traditional moderation is limited by human bandwidth and the high psychological toll of reviewing toxic content. 

**ContentGuardEnv** solves this by providing a training ground for **Autonomous Trust & Safety Agents** to:
- Detect nuanced policy violations (Hate Speech, Violence, Harassment).
- Propose appropriate enforcement actions (Restrict, Remove, Escalate).
- Generate high-quality appellate reasoning reports for user transparency.

---

## 🎯 Task Architecture

ContentGuardEnv simulates the full lifecycle of a moderation decision across three progressive tiers:

| Task | Name | Objective | Difficulty |
|------|------|-------------|------------|
| `easy` | Violation Detection | Identify the primary policy violation category. | 🟢 Easy |
| `medium` | Enforcement Action | Decide the action (e.g., Remove) and its severity (1-5). | 🟡 Medium |
| `hard` | Appellate Review | Generate a detailed report: Ruling, Policies, and Reasoning. | 🔴 Hard |

---

## 📐 OpenEnv Standard API

### RESTful Gateway
```
POST /reset           → Initialize a new moderation case
POST /step/{id}       → Submit agent decision package
GET  /state/{id}      → Retrieve internal episode telemetry
WS   /ws              → Real-time reasoning trace stream
GET  /                → Performance Dashboard UI
```

### Python Integration Example
```python
import httpx, json

BASE = "https://your-space.hf.space"

# 1. Reset Environment (Task: hard)
obs = httpx.post(f"{BASE}/reset", json={"task_id": "hard"}).json()
case = obs["content_case"]

print(f"Post Content: {case['content']}")

# 2. Agent Decision (Hard Task Schema)
decision = {
  "ruling": "upheld",
  "policy_references": ["Community Standards Section 12", "Hate Speech Policy"],
  "explanation": "The post targets a protected group with dehumanizing language...",
  "user_guidance": "Please review our policies regarding inclusive language."
}

# 3. Submit Step
result = httpx.post(f"{BASE}/step/{obs['episode_id']}", json={"action": decision}).json()
print(f"Policy Alignment Score: {result['reward']}")
```

---

## 🧠 Policy Alignment Graders

Our environment features a **Hierarchical Policy Proximity Engine** that rewards agents for professional nuances:
- **Policy Tier Scoring**: Recognizing a "Violence" violation in a "Hate Speech" case receives 0.5 points (Related Tier credit) instead of a binary zero.
- **Severity-Aware Shaping**: Penalizes agents more heavily for "Under-triage" (allowing toxic content) than "Over-triage" (conservative removals), mirroring real platform risk profiles.
- **Evidence-Based Rewards**: The `hard` task requires agents to extract specific tokens from the content to justify their ruling, rewarding grounded reasoning over generic LLM hallucinations.

---

## 🔬 Research Utility & Engineering Excellence

ContentGuardEnv is designed as a **Production-Grade RL Benchmarking Environment**:

#### 1. Contextual Simulation (High Utility)
Unlike simple text classifiers, our cases include **Contextual Platform Signals**:
- **User Trust Scores**: Historical reliability of the content creator.
- **Community Impact Score**: Probabilistic modeling of post reach and harm potential.
- **Viral Potential**: Dynamic signaling that requires agents to prioritize "Critical" risk items.

#### 2. Strictly-Typed Schema (Code Quality)
The entire environment is governed by **Pydantic Schemas**. Every `Observation` and `Action` is a validated object, ensuring your agents receive structured, error-free telemetry—satisfying the highest standards for reproducible AI research.

#### 3. Professional Reward Shaping
Rewards are normalized in the `[0.0, 1.0]` range and are **dense**, meaning agents receive incremental signal for every correct aspect of the decision (Category, Severity, Citation, Reasoning), drastically accelerating reinforcement learning convergence.

---

## 🏗️ Project Structure
```
.
├── server/
│   ├── app.py           # Policy Enrichment Gateway (FastAPI)
│   ├── env/
│   │   ├── environment.py # ContentGuardEnv Logic
│   │   ├── data_gen.py    # Real-world dataset pipeline (Toxigen/Toxic-Convo)
│   │   └── graders.py     # Hierarchical reward system
│   └── static/
│       └── index.html     # Autonomous Monitoring Dashboard
├── inference.py         # Baseline benchmark script
├── openenv.yaml         # Environment manifest
├── Dockerfile           # Optimized container spec
└── pyproject.toml       # Modernized dependency lock
```

---

## 🚀 Deployment & Usage

### Local Development
```bash
pip install -r requirements.txt
python server/app.py
```

### 🏁 Official Evaluation Protocol
To run the standardized evaluation suite as required by the judges:

1. **Set Environment Variables**:
   ```bash
   $env:API_BASE_URL="https://api.openai.com/v1"
   $env:MODEL_NAME="gpt-4o-mini"
   $env:HF_TOKEN="your_meta_token"
   ```

2. **Run Inference**:
   ```bash
   python inference.py
   ```

3. **Verify STDOUT Output**:
   The script will emit the mandatory evaluation tags:
   - `[START]` ... (Initialization)
   - `[STEP]` ... (Step-by-step telemetry)
   - `[END]` ... (Final Score and Rewards)

---

## 📋 Submission Checklist (Round 1)

- [x] **OpenEnv spec compliant** (`reset`, `step`, `state`)
- [x] **Minimum 3 tasks** (Progressive difficulty implemented)
- [x] **Reward signals** in standard [0.0, 1.0] range
- [x] **Baseline inference script** (Using `openai` package & standard logs)
- [x] **Dockerfile** (Tested for HF Spaces compliance)
- [x] **Metadata Manifest** (`openenv.yaml` v0.2.0)

---

## 👥 Authors
Designed by **mj064** for the **Meta × PyTorch Hackathon 2026**.
Dedicated to building safer digital spaces through autonomous trust & safety.
