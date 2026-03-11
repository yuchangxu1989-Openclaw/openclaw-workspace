"""API configuration for skill-creator scripts.

Loads API credentials from openclaw.json (primary) or environment
variables (fallback). Configured for penguin proxy endpoint.
"""

import os
import json
from pathlib import Path
from anthropic import Anthropic

# openclaw.json路径
OPENCLAW_JSON = Path("/root/.openclaw/openclaw.json")

# 默认penguin代理端点
DEFAULT_BASE_URL = "https://api.penguinsaichat.dpdns.org/"
DEFAULT_MODEL = "claude-sonnet-4-6"
THINKING_MODEL = "claude-opus-4-6-thinking"

# 缓存openclaw.json中的provider配置
_provider_cache = None


def _load_provider(name: str = "claude-main") -> dict:
    """从openclaw.json加载provider配置（带缓存）"""
    global _provider_cache
    if _provider_cache is not None:
        return _provider_cache

    try:
        if OPENCLAW_JSON.exists():
            cfg = json.loads(OPENCLAW_JSON.read_text())
            providers = cfg.get("models", {}).get("providers", {})
            prov = providers.get(name, {})
            if prov.get("apiKey") and prov.get("baseUrl"):
                _provider_cache = prov
                return _provider_cache
    except (json.JSONDecodeError, OSError):
        pass

    _provider_cache = {}
    return _provider_cache


def get_api_key() -> str:
    """获取API key：优先openclaw.json，回退环境变量"""
    # 1. 从openclaw.json读取
    prov = _load_provider()
    if prov.get("apiKey"):
        return prov["apiKey"]

    # 2. 回退到环境变量
    for env_var in ["CLAUDE_API_KEY_MAIN", "CLAUDE_KEY_MAIN", "ANTHROPIC_API_KEY"]:
        key = os.environ.get(env_var)
        if key:
            return key

    raise RuntimeError(
        "No API key found. Check openclaw.json providers or set CLAUDE_API_KEY_MAIN."
    )


def get_base_url() -> str:
    """获取API端点：优先openclaw.json，回退环境变量/默认值"""
    prov = _load_provider()
    if prov.get("baseUrl"):
        return prov["baseUrl"]

    return os.environ.get("ANTHROPIC_BASE_URL", DEFAULT_BASE_URL)


def get_client() -> Anthropic:
    """创建Anthropic客户端，使用penguin代理配置"""
    return Anthropic(
        api_key=get_api_key(),
        base_url=get_base_url(),
    )


def get_model(heavy: bool = False) -> str:
    """获取模型ID。heavy=True用于复杂推理任务"""
    env_model = os.environ.get("SKILL_CREATOR_MODEL")
    if env_model:
        return env_model
    return THINKING_MODEL if heavy else DEFAULT_MODEL
