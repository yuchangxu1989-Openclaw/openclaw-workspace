#!/usr/bin/env bash
# clean-eval-cases.sh — 按评测标准清洗评测集（非破坏性标记模式，版本从isc-core/config动态读取）
# 用法:
#   bash clean-eval-cases.sh scan [file_or_dir]   # 扫描标记+统计（默认，不修改文件）
#   bash clean-eval-cases.sh apply [file_or_dir]  # 备份+删除不合格+写回
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/../config.json"
MODE="${1:-scan}"

case "$MODE" in
  scan|apply) shift ;;
  *)
    # 兼容旧用法：无模式参数时当作 scan，第一个参数当 target
    MODE="scan"
    ;;
esac

TARGET="${1:-$(jq -r '.output_dir' "$CONFIG")}"

# 动态读取评测标准版本
_EVAL_VER_CFG="$(cd "$SCRIPT_DIR/../../../isc-core/config" 2>/dev/null && pwd)/eval-standard-version.json"
_EVAL_VER="$(jq -r '.version // "V?"' "$_EVAL_VER_CFG" 2>/dev/null || echo 'V?')"
echo "=== 评测集清洗 (${_EVAL_VER} 标准) — 模式: $MODE ==="
echo "目标: $TARGET"
echo ""

# 收集要处理的文件
FILELIST=$(mktemp)
trap 'rm -f "$FILELIST"' EXIT

if [ -f "$TARGET" ]; then
  echo "$TARGET" > "$FILELIST"
elif [ -d "$TARGET" ]; then
  find "$TARGET" -name "*.json" -type f | sort > "$FILELIST"
else
  echo "ERROR: $TARGET 不存在"
  exit 1
fi

if [ ! -s "$FILELIST" ]; then
  echo "未找到 JSON 文件"
  exit 0
fi

echo "发现 $(wc -l < "$FILELIST") 个文件"
echo ""

python3 - "$CONFIG" "$FILELIST" "$MODE" << 'PYEOF'
import json, sys, os, shutil
from datetime import datetime

config_path = sys.argv[1]
filelist_path = sys.argv[2]
mode = sys.argv[3]

with open(config_path) as f:
    config = json.load(f)

with open(filelist_path) as f:
    files = [l.strip() for l in f if l.strip()]

rules = config['quality_rules']
required_fields = rules['required_fields']
valid_categories = rules['valid_categories']
valid_difficulties = rules['valid_difficulties']
c2_req = rules['c2_requirements']

total_cases = 0
total_ok = 0
total_flagged = 0
total_missing_fields = 0
reason_counts = {}
files_modified = 0

def add_reason(reason):
    reason_counts[reason] = reason_counts.get(reason, 0) + 1


def check_case(case):
    """检查单条 case，返回 (errors: list[str], missing: list[str])"""
    errors = []
    missing = []

    if not isinstance(case, dict):
        return ["not_object"], []

    # Required fields
    for field in required_fields:
        val = case.get(field)
        if val is None or (isinstance(val, str) and not val.strip()):
            missing.append(field)
            errors.append(f"missing:{field}")

    # Category
    cat = case.get('category', '')
    if cat and cat not in valid_categories:
        errors.append(f"bad_category:{cat}")

    # Difficulty
    diff = case.get('difficulty', '')
    if diff and diff not in valid_difficulties:
        errors.append(f"bad_difficulty:{diff}")

    # Input length
    inp = case.get('input', '')
    if isinstance(inp, str):
        inp_len = len(inp)
    elif isinstance(inp, list):
        inp_len = sum(len(str(t)) for t in inp)
    else:
        inp_len = 0
    if inp_len < c2_req['min_input_length']:
        errors.append(f"input_short:{inp_len}")

    return errors, missing


if mode == 'scan':
    # ========== SCAN 模式：标记 + 统计，不修改原文件 ==========
    for filepath in files:
        if not os.path.isfile(filepath):
            continue
        basename = os.path.basename(filepath)

        try:
            with open(filepath) as f:
                raw = f.read().strip()
        except Exception as e:
            print(f"❌ {basename} - 读取失败: {e}")
            continue

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print(f"❌ {basename} - JSON 解析失败")
            add_reason("json_parse_error")
            continue

        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list):
            print(f"❌ {basename} - 非数组/对象格式，跳过")
            add_reason("invalid_format")
            continue

        file_total = len(data)
        file_ok = 0
        file_flagged = 0

        for case in data:
            total_cases += 1
            errors, missing = check_case(case)

            if errors:
                file_flagged += 1
                total_flagged += 1
                # 生成标记原因（取第一个主要原因作为 _flag）
                primary = errors[0].split(':')[0]
                case['_flag'] = '; '.join(errors)
                if missing:
                    case['_missing'] = missing
                    total_missing_fields += len(missing)
                for e in errors:
                    add_reason(e.split(':')[0])
            else:
                file_ok += 1
                total_ok += 1

        status = "✅" if file_flagged == 0 else "⚠️"
        print(f"{status} {basename}: {file_total} 条 — 合格 {file_ok} / 不合格 {file_flagged}")

    # 统计报告
    print()
    print("=" * 40)
    print("📊 扫描统计报告")
    print("=" * 40)
    print(f"总条数:       {total_cases}")
    print(f"合格:         {total_ok}")
    print(f"不合格:       {total_flagged}")
    print(f"待补字段数:   {total_missing_fields}")

    if reason_counts:
        print()
        print("不合格原因分布:")
        for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1]):
            print(f"  {reason}: {count}")

    print()
    if total_flagged > 0:
        print(f"⚠️  共 {total_flagged} 条不合格 case。")
        print(f"确认后执行:  clean-eval-cases.sh apply {sys.argv[2] if len(sys.argv) > 2 else ''}")
    else:
        print("✅ 全部合格，无需清洗。")


elif mode == 'apply':
    # ========== APPLY 模式：备份 + 删除不合格 + 清除标记 + 写回 ==========
    for filepath in files:
        if not os.path.isfile(filepath):
            continue
        basename = os.path.basename(filepath)

        try:
            with open(filepath) as f:
                raw = f.read().strip()
        except Exception as e:
            print(f"❌ {basename} - 读取失败: {e}")
            continue

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print(f"❌ {basename} - JSON 解析失败，跳过")
            continue

        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list):
            print(f"❌ {basename} - 非数组/对象格式，跳过")
            continue

        before = len(data)
        total_cases += before

        # 先扫描标记（如果还没标记过）
        for case in data:
            if isinstance(case, dict) and '_flag' not in case:
                errors, missing = check_case(case)
                if errors:
                    case['_flag'] = '; '.join(errors)
                    if missing:
                        case['_missing'] = missing

        # 分离合格/不合格
        kept = []
        removed = 0
        for case in data:
            if isinstance(case, dict) and '_flag' in case:
                removed += 1
                total_flagged += 1
                flag = case['_flag']
                for reason in flag.split('; '):
                    add_reason(reason.split(':')[0])
            else:
                # 清除临时标记字段
                if isinstance(case, dict):
                    case.pop('_flag', None)
                    case.pop('_missing', None)
                kept.append(case)
                total_ok += 1

        if removed > 0:
            # 备份原文件
            backup_dir = os.path.join(os.path.dirname(filepath), '.backup')
            os.makedirs(backup_dir, exist_ok=True)
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_path = os.path.join(backup_dir, f"{basename}.{ts}.bak")
            shutil.copy2(filepath, backup_path)

            # 写回清洗后文件
            with open(filepath, 'w') as f:
                json.dump(kept, f, ensure_ascii=False, indent=2)
                f.write('\n')

            files_modified += 1
            print(f"🧹 {basename}: {before} → {len(kept)} (删除 {removed}, 备份 → {backup_path})")
        else:
            print(f"✅ {basename}: {before} 条全部合格，无需修改")

    # 统计
    print()
    print("=" * 40)
    print("📊 清洗执行报告")
    print("=" * 40)
    print(f"清洗前总数: {total_cases}")
    print(f"保留总数:   {total_ok}")
    print(f"删除总数:   {total_flagged}")
    print(f"修改文件数: {files_modified}")

    if reason_counts:
        print()
        print("删除原因分布:")
        for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1]):
            print(f"  {reason}: {count}")

    print()
    print("=== 清洗完成 ===")

PYEOF
