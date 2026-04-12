import os
from huggingface_hub import HfApi
from dotenv import load_dotenv

def deploy():
    load_dotenv()
    token = os.getenv("HF_TOKEN")
    repo_id = "mj064/ContentGuardEnv"
    
    if not token:
        print("❌ ERROR: HF_TOKEN missing in .env")
        return

    api = HfApi(token=token)
    
    try:
        print(f"🚀 Synchronizing ContentGuardEnv to {repo_id}...")
        api.upload_folder(
            folder_path=os.path.dirname(os.path.abspath(__file__)),
            repo_id=repo_id,
            repo_type="space",
            token=token,
            ignore_patterns=[
                ".env*",
                ".git*",
                ".venv*",
                ".kombai*",
                "content_guard_env.egg-info*",
                ".pytest_cache*",
                "__pycache__*",
                "*.pyc",
                ".gemini*",
                "deploy_to_hf.py",
            ],
            delete_patterns=[
                ".venv/**",
                ".kombai/**",
                "content_guard_env.egg-info/**",
                ".pytest_cache/**",
                "**/__pycache__/**",
                "**/*.pyc",
            ]
        )
        print("✅ SUCCESS! ContentGuardEnv is now LIVE on Hugging Face.")
    except Exception as e:
        print(f"❌ DEPLOYMENT FAILED: {e}")

if __name__ == "__main__":
    deploy()
