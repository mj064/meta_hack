from .tasks import TASKS

__all__ = ["ContentGuardEnv", "TASKS"]


def __getattr__(name):
	if name == "ContentGuardEnv":
		from .environment import ContentGuardEnv
		return ContentGuardEnv
	raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
