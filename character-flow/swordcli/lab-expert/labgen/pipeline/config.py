import json
import os
import re
from pathlib import Path

def get_settings_path():
    current_dir = Path(__file__).parent.parent
    return current_dir / "settings.json"

def substitute_env_vars(obj):
    """Recursively substitute ${VAR_NAME} with environment variables"""
    if isinstance(obj, dict):
        return {k: substitute_env_vars(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [substitute_env_vars(item) for item in obj]
    elif isinstance(obj, str):
        def replace_var(match):
            var_name = match.group(1)
            return os.environ.get(var_name, match.group(0))
        return re.sub(r'\$\{([^}]+)\}', replace_var, obj)
    return obj

def load_settings():
    settings_path = get_settings_path()
    if settings_path.exists():
        with open(settings_path) as f:
            settings = json.load(f)
        return substitute_env_vars(settings)
    return {}

def save_settings(settings):
    settings_path = get_settings_path()
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)

def get_api_key():
    settings = load_settings()
    api_key = settings.get("llm", {}).get("api_key")
    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        api_key = os.environ.get("LABGEN_API_KEY")
    return api_key