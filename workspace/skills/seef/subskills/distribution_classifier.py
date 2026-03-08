#!/usr/bin/env python3
"""
Skill distribution classifier.

Auto-classifies a skill as local or public based on simple static indicators.
Designed to be used during skill creation so every new skill gets a default
classification written into SKILL.md immediately.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Any

LOCAL_PATTERNS = [
    re.compile(r"/root/"),
    re.compile(r"/home/[A-Za-z0-9_]+/"),
    re.compile(r"~/.openclaw/?"),
    re.compile(r"/root/.openclaw/?"),
    re.compile(r"\.secrets/"),
    re.compile(r"process\.env\.(API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY)"),
    re.compile(r"process\.env\.(ZHIPU_API_KEY|OPENAI_API_KEY|FEISHU_APP_SECRET|ANTHROPIC_API_KEY|GOOGLE_API_KEY|AZURE_KEY)"),
    re.compile(r"process\.env\.\w*(SECRET|PASSWORD|CREDENTIAL|TOKEN|APIKEY)\w*", re.IGNORECASE),
    re.compile(r"api[_-]?key\s*[:=]\s*['\"][^'\"]{10,}['\"]", re.IGNORECASE),
    re.compile(r"password\s*[:=]\s*['\"][^'\"]{8,}['\"]", re.IGNORECASE),
    re.compile(r"secret\s*[:=]\s*['\"][^'\"]{10,}['\"]", re.IGNORECASE),
    re.compile(r"token\s*[:=]\s*['\"][^'\"]{20,}['\"]", re.IGNORECASE),
]

SCANNABLE_SUFFIXES = {'.js', '.ts', '.py', '.sh', '.md', '.json', '.yaml', '.yml', '.cjs', '.mjs', '.txt'}


def _scan_files(skill_dir: Path) -> List[Path]:
    files: List[Path] = []
    for path in skill_dir.rglob('*'):
        if not path.is_file():
            continue
        if any(part in {'node_modules', '.git', '__pycache__'} for part in path.parts):
            continue
        if path.suffix.lower() in SCANNABLE_SUFFIXES or path.name == 'SKILL.md':
            files.append(path)
    return files


def classify_skill_distribution(skill_dir: str | Path) -> Dict[str, Any]:
    skill_path = Path(skill_dir)
    hits: List[Dict[str, str]] = []

    for file_path in _scan_files(skill_path):
        try:
            content = file_path.read_text(encoding='utf-8')
        except Exception:
            continue

        for pattern in LOCAL_PATTERNS:
            if pattern.search(content):
                hits.append({
                    'file': str(file_path.relative_to(skill_path)),
                    'pattern': pattern.pattern,
                })

    unique_patterns = sorted({hit['pattern'] for hit in hits})
    distribution = 'local' if unique_patterns else 'public'

    return {
        'distribution': distribution,
        'local_indicators': unique_patterns,
        'hit_details': hits[:10],
        'files_scanned': len(_scan_files(skill_path)),
    }
