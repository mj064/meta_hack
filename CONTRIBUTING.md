# Contributing to ContentGuardEnv

First off, thank you for considering contributing to ContentGuardEnv! It's people like you that make the Trust & Safety community safer for everyone.

## Development Setup

1.  **Fork the repo** and clone it locally.
2.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run tests**:
    ```bash
    pytest tests/
    ```

## Adding New Moderation Tasks

We are always looking for more complex moderation scenarios. To add a new task:
1.  Define the task schema in `server/env/tasks.py`.
2.  Implement a dedicated grader in `server/env/graders.py`.
3.  Update `openenv.yaml` to include the new task ID.

## Pull Request Process

1.  Ensure any install or build dependencies are removed before the end of the layer when doing a build.
2.  Update the README.md with details of changes to the interface, if applicable.
3.  Submit your PR with a clear description of the research objective or fix.

## Policy Guidelines

All contributions must align with the spirit of the [Meta Community Standards](https://www.facebook.com/communitystandards/). We do not accept contributions that promote harm, hate speech, or harassment.
