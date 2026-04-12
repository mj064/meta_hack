---
title: ContentGuardEnv
emoji: 🛡️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
tags:
  - openenv
  - trust-and-safety
  - meta
  - llama-3
  - moderation-research
pinned: false
---

# ContentGuardEnv: A Research Framework for Policy-Grounded Moderation

ContentGuardEnv is a benchmark environment designed for the **Meta × PyTorch Hackathon 2026**. It moves beyond traditional "toxic vs. safe" classification by challenging AI agents to map content against the complex nuances of **Meta's Community Standards**.

This project provides an **OpenEnv-compliant** interface for training and evaluating autonomous Trust & Safety agents that can not only detect violations but decide on enforcement and generate appellate reasoning.

---

## 🔬 Design Philosophy

Modern moderation at scale is no longer just a binary classification problem. It requires understanding **intent, context, and severity**. I built ContentGuardEnv to simulate these three specific layers of the moderation lifecycle:

1.  **Categorical Alignment (Easy)**: Can the agent identify the specific policy category (e.g., Harassment vs. Hate Speech)?
2.  **Enforcement Proximity (Medium)**: Is the suggested penalty proportionate to the violation? (e.g., Warning Label vs. Account Removal).
3.  **Appellate Reasoning (Hard)**: Can the agent justify its decision with specific policy citations and evidence-backed explanations?

---

## 🛠️ Technical Architecture

The environment is built on a modular stack designed for scalability and research reproducibility:

*   **Backend**: FastAPI-powered gateway providing both RESTful and WebSocket endpoints for real-time telemetry.
*   **Evaluation Engine**: A hierarchical grading system that provides partial credit for "near-misses" (e.g., misidentifying Hate Speech as Harassment is penalized less than misidentifying it as Safe).
*   **Synthetic Data Pipeline**: Integrated with Toxigen and professional safety datasets to provide varying levels of toxicity and adversarial behavior.
*   **Monitoring Dashboard**: A high-fidelity terminal interface built with vanilla JS and CSS for low-latency observation of agent decision-making.

---

## 📐 Integration & Evaluation

### Implementation Details
ContentGuardEnv follows the [OpenEnv Specification](https://huggingface.co/spaces?search=openenv). It exposes standard lifecycle endpoints:

- `POST /reset`: Initializes an episode with a specific difficulty tier.
- `POST /step/{id}`: Accepts a structured JSON action package.
- `GET /state/{id}`: Provides the full internal state for debugging.
- `WS /ws`: A persistent stream for reasoning traces.

### Running the Evaluation
To verify an agent against this environment, use the provided `inference.py` script. It is configured to handle official evaluation tags (`[START]`, `[STEP]`, `[END]`) automatically.

```bash
# Set up your environment
export API_BASE_URL="https://api.openai.com/v1"
export MODEL_NAME="gpt-4o-mini"
export HF_TOKEN="your_token_here"

# Execute the benchmark
python inference.py
```

---

## 🏗️ Repository Structure

*   `server/`: Contains the FastAPI application and static dashboard assets.
*   `server/env/`: Core logic including the `ContentGuardEnv` class and reward graders.
*   `inference.py`: Standardized script for automated benchmarking.
*   `openenv.yaml`: Environment manifest defining task IDs and hardware requirements.
*   `Dockerfile`: Container configuration optimized for Hugging Face Spaces.

---

## 💡 Future Directions

This framework is a starting point for more complex safety research. Future iterations could include:
*   **Multi-Turn Appeals**: Agents defending their decisions against a "User" agent in a dialogue.
*   **Image/Video Modalities**: Extending the environment to handle multimodal safety checks.
*   **Dynamic Policy Updates**: Simulating 48-hour policy shifts to test agent adaptability.

---

## 👥 Authorship
Developed by **mj064** for the Meta × PyTorch Hackathon 2026.
Built with a focus on creating safer, more transparent digital communities through better AI alignment.
