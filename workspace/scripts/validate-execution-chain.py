#!/usr/bin/env python3
"""
V4评测用例执行链步骤验证脚本

功能：
  读取V4评测用例JSON文件，检查每个execution_chain_step是否符合结构化schema，
  按精确度分级（PRECISE/SEMI/VAGUE），输出不达标case列表和整体达标率。

用法：
  python3 scripts/validate-execution-chain.py [文件路径...]
  不传参数时自动扫描 tests/benchmarks/v4-*-cases*.json
"""

import json
import re
import sys
import os
import glob

# === 精确度分级规则 ===

# 工具/命令调用模式 — 表示步骤包含可执行的具体命令
# 注意：用(?<![a-zA-Z])代替\b，因为Python3中\b把中文字符视为\w，
# 导致"执行grep"中grep前的\b不触发（中文字符和ASCII字母都是\w）
TOOL_PATTERNS = [
    r'(?<![a-zA-Z])grep(?![a-zA-Z])',
    r'(?<![a-zA-Z])find\s+\S+',
    r'(?<![a-zA-Z])cat\s+\S+',
    r'(?<![a-zA-Z])diff\s+',
    r'(?<![a-zA-Z])rg\s+',
    r'(?<![a-zA-Z])head\s+',
    r'(?<![a-zA-Z])tail\s+',
    r'(?<![a-zA-Z])wc\s+',
    r'(?<![a-zA-Z])python3?\s+\S+',
    r'(?<![a-zA-Z])node\s+\S+',
    r'(?<![a-zA-Z])git\s+(log|diff|show|blame)(?![a-zA-Z])',
    r'(?<![a-zA-Z])curl\s+',
    r'(?<![a-zA-Z])jq\s+',
    r'(?<![a-zA-Z])sed\s+',
    r'(?<![a-zA-Z])awk\s+',
    r'(?<![a-zA-Z])exec:\s*\S+',
    r'(?<![a-zA-Z])read_file:\s*\S+',
    r'(?<![a-zA-Z])write_file:\s*\S+',
    r'(?<![a-zA-Z])feishu_doc\s+\w+',
    r'(?<![a-zA-Z])feishu_bitable(?![a-zA-Z])',
    r'(?<![a-zA-Z])feishu_wiki(?![a-zA-Z])',
    r'(?<![a-zA-Z])sessions_spawn(?![a-zA-Z])',
    r'(?<![a-zA-Z])web_search(?![a-zA-Z])',
    r'(?<![a-zA-Z])web_fetch(?![a-zA-Z])',
]

# 文件路径模式 — 表示步骤引用了具体文件或目录
FILE_PATH_PATTERNS = [
    r'[\w\-./]+\.(?:js|py|json|md|ts|yaml|yml|sh|css|html)\b',  # 带扩展名的文件路径
    r'\b\w+/\w+/[\w\-./]*',  # 多级目录路径 如 infrastructure/intent-engine/
    r'\b(?:skills|scripts|infrastructure|src|tests|config|lib|modules|packages)/[\w\-./]*',  # 常见项目目录
    r'\b\w+\.(?:js|py|json|ts):?\d+',  # 文件名:行号 如 server.js:15
    r'\bdoc_token:\s*\w+',  # 飞书文档token
    r'\bagentId:\s*[\w\-]+',  # Agent ID
    r"--include='[^']+'\s",  # grep的--include参数 如 --include='*.js'
]

# 动作动词模式 — 表示步骤包含具体操作意图（但不够精确）
ACTION_VERB_PATTERNS = [
    r'验证\S+',
    r'校验\S+',
    r'检查\S+',
    r'解析\S+',
    r'读取\S+',
    r'写入\S+',
    r'创建\S+',
    r'删除\S+',
    r'更新\S+',
    r'对比\S+',
    r'提取\S+',
    r'统计\S+',
    r'计算\S+',
    r'输出\S+',
]

TOOL_RE = [re.compile(p, re.IGNORECASE) for p in TOOL_PATTERNS]
FILE_RE = [re.compile(p) for p in FILE_PATH_PATTERNS]
ACTION_RE = [re.compile(p) for p in ACTION_VERB_PATTERNS]


def has_tool_call(text: str) -> bool:
    """检查文本是否包含工具/命令调用"""
    return any(r.search(text) for r in TOOL_RE)


def has_file_path(text: str) -> bool:
    """检查文本是否包含具体文件路径"""
    return any(r.search(text) for r in FILE_RE)


def has_action_verb(text: str) -> bool:
    """检查文本是否包含具体动作动词"""
    return any(r.search(text) for r in ACTION_RE)


def classify_step(step) -> str:
    """
    对单个步骤进行精确度分级。

    返回:
      "STRUCT"  — 已经是结构化对象（dict），包含action/target/expected_result
      "PRECISE" — 字符串步骤，包含具体命令调用 + 文件路径/目标
      "SEMI"    — 字符串步骤，包含动作或路径之一，但不完整
      "VAGUE"   — 字符串步骤，纯叙事描述
    """
    # 如果已经是结构化对象
    if isinstance(step, dict):
        required = {"action", "target", "expected_result"}
        if required.issubset(step.keys()):
            return "STRUCT"
        else:
            return "SEMI"  # 结构化但字段不全

    # 字符串步骤
    text = str(step)

    # 去掉开头的序号 "1. " "2. " 等
    text_clean = re.sub(r'^\d+\.\s*', '', text)

    tool = has_tool_call(text_clean)
    path = has_file_path(text_clean)
    verb = has_action_verb(text_clean)

    if tool and path:
        return "PRECISE"
    elif tool or path:
        return "SEMI"
    elif verb:
        return "SEMI"
    else:
        return "VAGUE"


def validate_file(filepath: str) -> dict:
    """
    验证单个评测用例文件。

    返回:
      {
        "file": 文件名,
        "total_cases": 用例总数,
        "cases_with_chain": 有执行链的用例数,
        "total_steps": 总步骤数,
        "by_level": {"STRUCT": n, "PRECISE": n, "SEMI": n, "VAGUE": n},
        "non_compliant_cases": [不达标case列表],
        "case_details": [{case_id, name, steps_count, levels, compliant}]
      }
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        cases = json.load(f)

    if not isinstance(cases, list):
        cases = [cases]

    result = {
        "file": os.path.basename(filepath),
        "total_cases": len(cases),
        "cases_with_chain": 0,
        "total_steps": 0,
        "by_level": {"STRUCT": 0, "PRECISE": 0, "SEMI": 0, "VAGUE": 0},
        "non_compliant_cases": [],
        "case_details": [],
    }

    for case in cases:
        case_id = case.get("id", "unknown")
        case_name = case.get("name", "unnamed")
        steps = case.get("execution_chain_steps", [])

        if not steps:
            result["non_compliant_cases"].append({
                "id": case_id,
                "name": case_name,
                "reason": "无execution_chain_steps字段"
            })
            continue

        result["cases_with_chain"] += 1
        result["total_steps"] += len(steps)

        levels = {"STRUCT": 0, "PRECISE": 0, "SEMI": 0, "VAGUE": 0}
        step_details = []

        for i, step in enumerate(steps):
            level = classify_step(step)
            levels[level] += 1
            result["by_level"][level] += 1
            step_details.append({
                "index": i + 1,
                "level": level,
                "text": str(step)[:120]
            })

        # 达标标准：PRECISE+STRUCT占比 >= 60%（过渡期阈值）
        compliant_count = levels["STRUCT"] + levels["PRECISE"]
        compliant_rate = compliant_count / len(steps) if steps else 0
        is_compliant = compliant_rate >= 0.6

        detail = {
            "id": case_id,
            "name": case_name,
            "steps_count": len(steps),
            "levels": levels,
            "precise_rate": f"{compliant_rate:.1%}",
            "compliant": is_compliant,
        }
        result["case_details"].append(detail)

        if not is_compliant:
            vague_steps = [s for s in step_details if s["level"] == "VAGUE"]
            result["non_compliant_cases"].append({
                "id": case_id,
                "name": case_name,
                "reason": f"精确率{compliant_rate:.1%} < 60%，{levels['VAGUE']}个模糊步骤",
                "vague_steps": vague_steps[:3],  # 最多展示3个模糊步骤示例
            })

    return result


def print_report(results: list[dict]):
    """输出汇总报告"""
    print("=" * 80)
    print("V4评测用例执行链粒度验证报告")
    print("=" * 80)
    print()

    grand_total_steps = 0
    grand_levels = {"STRUCT": 0, "PRECISE": 0, "SEMI": 0, "VAGUE": 0}
    grand_total_cases = 0
    grand_compliant_cases = 0
    grand_non_compliant = []

    for r in results:
        grand_total_steps += r["total_steps"]
        for k in grand_levels:
            grand_levels[k] += r["by_level"][k]
        grand_total_cases += len(r["case_details"])
        grand_compliant_cases += sum(1 for c in r["case_details"] if c["compliant"])
        grand_non_compliant.extend(r["non_compliant_cases"])

    # 文件级汇总
    print("## 各文件统计")
    print()
    print(f"{'文件':<50} {'用例':>4} {'步骤':>4} {'精确':>4} {'半精确':>4} {'模糊':>4} {'精确率':>7}")
    print("-" * 80)

    for r in results:
        total = r["total_steps"] or 1
        precise_rate = (r["by_level"]["STRUCT"] + r["by_level"]["PRECISE"]) / total
        print(f"{r['file']:<50} {r['total_cases']:>4} {r['total_steps']:>4} "
              f"{r['by_level']['PRECISE']:>4} {r['by_level']['SEMI']:>4} "
              f"{r['by_level']['VAGUE']:>4} {precise_rate:>6.1%}")

    print("-" * 80)
    total = grand_total_steps or 1
    overall_precise = (grand_levels["STRUCT"] + grand_levels["PRECISE"]) / total
    print(f"{'合计':<50} {grand_total_cases:>4} {grand_total_steps:>4} "
          f"{grand_levels['PRECISE']:>4} {grand_levels['SEMI']:>4} "
          f"{grand_levels['VAGUE']:>4} {overall_precise:>6.1%}")

    # 整体达标率
    print()
    print("## 整体达标率")
    print()
    print(f"  步骤总数:     {grand_total_steps}")
    print(f"  结构化(STRUCT): {grand_levels['STRUCT']} ({grand_levels['STRUCT']/total:.1%})")
    print(f"  精确(PRECISE):  {grand_levels['PRECISE']} ({grand_levels['PRECISE']/total:.1%})")
    print(f"  半精确(SEMI):   {grand_levels['SEMI']} ({grand_levels['SEMI']/total:.1%})")
    print(f"  模糊(VAGUE):    {grand_levels['VAGUE']} ({grand_levels['VAGUE']/total:.1%})")
    print()
    print(f"  ★ 精确达标率(STRUCT+PRECISE): {overall_precise:.1%}")
    print(f"  ★ 用例达标率(精确率≥60%的case): {grand_compliant_cases}/{grand_total_cases} = "
          f"{grand_compliant_cases/grand_total_cases:.1%}" if grand_total_cases else "N/A")

    # 不达标case列表
    print()
    print("## 不达标用例列表")
    print()
    if not grand_non_compliant:
        print("  全部达标 ✅")
    else:
        for nc in grand_non_compliant:
            print(f"  ❌ [{nc['id']}] {nc['name']}")
            print(f"     原因: {nc['reason']}")
            for vs in nc.get("vague_steps", []):
                print(f"     模糊步骤示例: step[{vs['index']}] {vs['text'][:80]}")
            print()

    print("=" * 80)

    # 返回汇总数据供外部使用
    return {
        "total_steps": grand_total_steps,
        "levels": grand_levels,
        "precise_rate": overall_precise,
        "total_cases": grand_total_cases,
        "compliant_cases": grand_compliant_cases,
        "case_compliant_rate": grand_compliant_cases / grand_total_cases if grand_total_cases else 0,
    }


def main():
    # 确定要验证的文件
    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        # 自动扫描V4用例文件
        base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "tests", "benchmarks")
        files = sorted(glob.glob(os.path.join(base, "v4-*-cases*.json")))

    if not files:
        print("错误：未找到V4评测用例文件", file=sys.stderr)
        print("用法: python3 scripts/validate-execution-chain.py [文件路径...]", file=sys.stderr)
        sys.exit(1)

    print(f"扫描到 {len(files)} 个V4评测用例文件\n")

    results = []
    for f in files:
        if not os.path.exists(f):
            print(f"警告：文件不存在 {f}", file=sys.stderr)
            continue
        results.append(validate_file(f))

    summary = print_report(results)

    # 输出JSON格式的汇总（方便CI/CD集成）
    summary_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "reports", "execution-chain-validation-result.json")
    summary_path = os.path.normpath(summary_path)
    os.makedirs(os.path.dirname(summary_path), exist_ok=True)
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump({
            "timestamp": __import__('datetime').datetime.now().isoformat(),
            "files_scanned": len(results),
            "summary": summary,
            "file_details": [{
                "file": r["file"],
                "total_cases": r["total_cases"],
                "total_steps": r["total_steps"],
                "by_level": r["by_level"],
                "non_compliant_count": len(r["non_compliant_cases"]),
            } for r in results],
        }, f, ensure_ascii=False, indent=2)
    print(f"\n验证结果已保存至: {summary_path}")


if __name__ == "__main__":
    main()
