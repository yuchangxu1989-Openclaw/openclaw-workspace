#!/usr/bin/env python3
"""
[DEPRECATED] 2026-03-04 — 此文件已废弃
原因：generate_dashboard() 中所有数据（意图分布、四维洞察、核心指标等）均为100%硬编码伪造数据，
      没有任何真实数据源。参见审计报告 reports/report-chain-audit-2026-03-04.md。
处置：整个文件功能已废弃。cron任务 merged-cras-knowledge-6h 已同步禁用。
"""

import sys
import json

def generate_dashboard():
    """
    [DEPRECATED] 此函数已废弃。
    原 generate_dashboard() 输出的所有数据（TOP10意图分布、四维趋势洞察、核心指标等）
    均为硬编码常量，不基于任何真实用户交互数据。
    """
    return {
        "status": "deprecated",
        "error": "此仪表盘生成器已废弃：所有数据为硬编码伪造值，无真实数据源。",
        "see": "reports/report-chain-audit-2026-03-04.md"
    }

if __name__ == "__main__":
    print(json.dumps(generate_dashboard(), ensure_ascii=False), file=sys.stderr)
    sys.exit(1)
