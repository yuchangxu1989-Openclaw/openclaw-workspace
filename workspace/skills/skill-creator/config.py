"""API configuration for skill-creator scripts.

Loads API credentials from environment variables and creates
an Anthropic client configured for our proxy endpoint.
"""

import os
from anthropic import Anthropic

# Default proxy endpoint (penguinsaichat)
DEFAULT_BASE_URL = "https://api.penguinsaichat.dpdns.org/"
DEFAULT_MODEL = "claude-sonnet-4-6"
THINKING_MODEL = "claude-opus-4-6-thinking"


def get_api_key() -> str:
    """Get API key from environment, trying multiple sources."""
    for env_var in ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY_MAIN", "CLAUDE_KEY_MAIN"]:
        key = os.environ.get(env_var)
        if key:
            return key
    raise RuntimeError(
        "No API key found. Set ANTHROPIC_API_KEY or CLAUDE_API_KEY_MAIN."
    )


def get_base_url() -> str:
    """Get API base URL from environment or use default proxy."""
    return os.environ.get("ANTHROPIC_BASE_URL", DEFAULT_BASE_URL)


def get_client() -> Anthropic:
    """Create an Anthropic client with our proxy configuration."""
    return Anthropic(
        api_key=get_api_key(),
        base_url=get_base_url(),
    )


def get_model(heavy: bool = False) -> str:
    """Get model ID. Use heavy=True for complex reasoning tasks."""
    env_model = os.environ.get("SKILL_CREATOR_MODEL")
    if env_model:
        return env_model
    return THINKING_MODEL if heavy else DEFAULT_MODEL
