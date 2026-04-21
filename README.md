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

# ContentGuardEnv

I built ContentGuardEnv for the **Meta x Hugging Face Hackathon 2026** as a practical moderation environment where an AI agent has to do more than just classify text.

Instead of only asking "is this toxic?", the environment asks the model to:

1. Detect the policy category.
2. Choose a proportional enforcement action.
3. Explain a decision in an appeal-style format.

## Live Deployment

- Hugging Face Space: https://mj064-contentguardenv.hf.space
- Hugging Face repo: https://huggingface.co/spaces/mj064/ContentGuardEnv
- GitHub repo: https://github.com/mj064/meta_hack

## What This Project Does

ContentGuardEnv is an OpenEnv-style environment with three difficulty tiers:

- Easy: category detection
- Medium: enforcement action + severity
- Hard: appeal ruling + policy references

It includes:

- A FastAPI backend for reset/step/state APIs
- A WebSocket reasoning stream for live agent traces
- A browser dashboard to run episodes and inspect rewards
- A grading pipeline that returns reward + feedback for each decision

## Why I Built It

The goal was to simulate the type of moderation decisions that are messy in real systems: ambiguous context, policy tradeoffs, and high-cost mistakes.

This project is meant to be usable both as:

- A demo app for human-in-the-loop moderation testing
- A benchmark harness for agent evaluation loops

## Stack

- Python + FastAPI
- Vanilla JS/CSS frontend
- OpenAI/Hugging Face compatible inference routing
- Dockerized runtime for Hugging Face Spaces

## Run Locally

1. Install dependencies.

```bash
pip install -r requirements.txt
```

2. Set environment variables (or use a local `.env`).

```bash
API_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4o-mini
HF_TOKEN=your_token_here
```

3. Start the app.

```bash
python server/app.py
```

Open http://localhost:7860

## API Overview

- POST `/reset`
- POST `/step/{episode_id}`
- GET `/state/{episode_id}`
- GET `/health`
- WS `/ws`

## Deploy to Hugging Face Space

This repo includes a helper script:

```bash
python sync_repo.py
```

It syncs the project folder to the Space while ignoring local-only artifacts.

## Project Layout

- `server/app.py`: FastAPI app + WebSocket gateway
- `server/env/`: environment, tasks, graders, data generation
- `server/static/`: dashboard HTML/CSS/JS
- `inference.py`: script for benchmark/evaluation flows
- `sync_repo.py`: one-command Hugging Face Space sync

## Notes

This is actively iterated during hackathon development, so UI and evaluation behavior continue to evolve as edge cases are discovered.
