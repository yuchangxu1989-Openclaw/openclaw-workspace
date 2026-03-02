#!/usr/bin/env python3
"""
ISC 规则桥接层 - 让 SEEF 子技能能读取真实 ISC 规则进行校验

读取 isc-core/rules/ 下的所有 JSON 规则文件，解析其结构，
并针对给定的技能目录执行校验逻辑。

支持的规则校验类型：
  - file_existence_check: 必需文件存在性
  - content_validation: SKILL.md 内容完整性（必需字段、最小长度）
  - code_presence_check: 是否有可执行代码文件
  - naming_convention: 目录命名规范
  - governance: 治理类规则（报告但不阻断）
"""

import json
import os
import glob
import re
from pathlib import Path

ISC_RULES_DIR = os.environ.get(
    'ISC_RULES_DIR',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'isc-core', 'rules')
)


def load_rules(category=None):
    """
    加载所有 ISC 规则文件

    Args:
        category: 可选的域过滤器 (如 'quality', 'naming', 'security')

    Returns:
        list[dict]: 规则列表
    """
    rules = []
    rules_dir = os.path.realpath(ISC_RULES_DIR)

    if not os.path.isdir(rules_dir):
        return rules

    pattern = os.path.join(rules_dir, '*.json')
    for path in sorted(glob.glob(pattern)):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                rule = json.load(f)
            # 注入来源文件名方便调试
            rule['_source_file'] = os.path.basename(path)
            domain = rule.get('domain', rule.get('category', ''))
            if category is None or domain == category:
                rules.append(rule)
        except (json.JSONDecodeError, IOError) as e:
            # 损坏的规则文件跳过，不阻断
            rules.append({
                'id': f'PARSE_ERROR:{os.path.basename(path)}',
                '_source_file': os.path.basename(path),
                '_parse_error': str(e)
            })

    return rules


def check_skill(skill_path, rules=None):
    """
    校验技能是否符合 ISC 规则

    Args:
        skill_path: 技能目录的绝对或相对路径
        rules: 可选的规则列表，为 None 时自动加载

    Returns:
        dict: {passed, failed, warnings, skipped, score, details}
    """
    if rules is None:
        rules = load_rules()

    skill_path = os.path.realpath(skill_path)
    results = {
        'skill_path': skill_path,
        'skill_name': os.path.basename(skill_path),
        'passed': [],
        'failed': [],
        'warnings': [],
        'skipped': [],
    }

    # ── 内置基础检查（不依赖 ISC 规则文件）──────────
    _check_skill_md_exists(skill_path, results)
    _check_code_presence(skill_path, results)
    _check_skill_md_content(skill_path, results)

    # ── 应用 ISC 规则 ──────────────────────────────
    for rule in rules:
        if '_parse_error' in rule:
            results['skipped'].append({
                'rule': rule['id'],
                'status': 'skip',
                'message': f'Rule file parse error: {rule["_parse_error"]}'
            })
            continue

        check = _apply_rule(rule, skill_path)
        _classify_result(check, results)

    # 计算得分
    total_decisive = len(results['passed']) + len(results['failed'])
    results['score'] = len(results['passed']) / max(1, total_decisive)
    results['total_rules_evaluated'] = len(rules)

    return results


# ═══════════════════════════════════════════════════════
# 内置基础检查
# ═══════════════════════════════════════════════════════

def _check_skill_md_exists(skill_path, results):
    """SKILL.md 必须存在"""
    skill_md = os.path.join(skill_path, 'SKILL.md')
    if os.path.exists(skill_md):
        results['passed'].append({
            'rule': 'BUILTIN-001',
            'status': 'pass',
            'message': 'SKILL.md exists'
        })
    else:
        results['failed'].append({
            'rule': 'BUILTIN-001',
            'status': 'fail',
            'message': 'SKILL.md not found (mandatory)'
        })


def _check_code_presence(skill_path, results):
    """至少一个可执行代码文件"""
    code_exts = ['js', 'cjs', 'mjs', 'py', 'sh', 'ts']
    has_code = False
    for ext in code_exts:
        if glob.glob(os.path.join(skill_path, f'*.{ext}')) or \
           glob.glob(os.path.join(skill_path, '**', f'*.{ext}'), recursive=True):
            has_code = True
            break

    if has_code:
        results['passed'].append({
            'rule': 'BUILTIN-002',
            'status': 'pass',
            'message': 'Executable code files found'
        })
    else:
        results['warnings'].append({
            'rule': 'BUILTIN-002',
            'status': 'warn',
            'message': 'No executable code files found (.js/.py/.sh/.ts)'
        })


def _check_skill_md_content(skill_path, results):
    """SKILL.md 内容质量：必须包含 name/description，且 > 100 字符"""
    skill_md = os.path.join(skill_path, 'SKILL.md')
    if not os.path.exists(skill_md):
        return  # BUILTIN-001 已处理

    try:
        with open(skill_md, 'r', encoding='utf-8') as f:
            content = f.read()
    except IOError:
        results['failed'].append({
            'rule': 'BUILTIN-003',
            'status': 'fail',
            'message': 'SKILL.md exists but is not readable'
        })
        return

    issues = []
    if len(content.strip()) < 100:
        issues.append('content too short (<100 chars)')

    # 检查必需字段（不区分大小写）
    content_lower = content.lower()
    for field in ['name', 'description']:
        if field not in content_lower:
            issues.append(f'missing field: {field}')

    if issues:
        results['failed'].append({
            'rule': 'BUILTIN-003',
            'status': 'fail',
            'message': f'SKILL.md quality issues: {"; ".join(issues)}'
        })
    else:
        results['passed'].append({
            'rule': 'BUILTIN-003',
            'status': 'pass',
            'message': 'SKILL.md content quality OK'
        })


# ═══════════════════════════════════════════════════════
# ISC 规则应用引擎
# ═══════════════════════════════════════════════════════

def _apply_rule(rule, skill_path):
    """
    应用单条 ISC 规则到技能目录

    根据规则内部结构智能判断校验方式：
    - 有 rules[].action.type == 'file_existence_check' → 文件存在性
    - 有 rules[].action.type == 'content_validation' → 内容校验
    - 有 check_criteria.must_have → 质量检查
    - 有 threshold.minLength / requiredFields → 检测标准
    - 有 validation_rules.filesystem_scan → 系统级（跳过）
    - 其他 → 治理/安全类，报告为 info
    """
    rule_id = rule.get('id', rule.get('name', 'UNKNOWN'))
    rule_scope = rule.get('scope', '')
    rule_domain = rule.get('domain', '')

    # 系统级规则不适用于单个技能校验
    if rule_scope == 'system':
        return {
            'rule': rule_id,
            'status': 'skip',
            'message': f'System-scope rule, not applicable to individual skill checks'
        }

    # ── 类型1: 有嵌套 rules 数组的结构化规则 ──
    if 'rules' in rule and isinstance(rule['rules'], list):
        return _apply_structured_rules(rule, skill_path)

    # ── 类型2: 有 check_criteria 的质量规则 ──
    if 'check_criteria' in rule:
        return _apply_quality_criteria(rule, skill_path)

    # ── 类型3: 有 threshold (dict) 的检测标准 ──
    if 'threshold' in rule and isinstance(rule['threshold'], dict):
        return _apply_threshold_check(rule, skill_path)

    # ── 类型4: 有 naming_convention 的命名规则 ──
    if 'naming_convention' in rule:
        return _apply_naming_check(rule, skill_path)

    # ── 默认: 无法映射到技能级校验 ──
    return {
        'rule': rule_id,
        'status': 'skip',
        'message': f'Rule type not applicable to skill-level check (domain={rule_domain})'
    }


def _apply_structured_rules(rule, skill_path):
    """处理含 rules[] 数组的规则（如 skill-mandatory-skill-md-001）"""
    rule_id = rule.get('id', 'UNKNOWN')
    sub_results = []

    for sub_rule in rule['rules']:
        action = sub_rule.get('action', {})
        action_type = action.get('type', '')

        if action_type == 'file_existence_check':
            required_file = action.get('required_file', 'SKILL.md')
            target_path = os.path.join(skill_path, required_file)
            exists = os.path.exists(target_path)
            sub_results.append({
                'sub_rule': sub_rule.get('id', ''),
                'passed': exists,
                'detail': f'{required_file} {"exists" if exists else "not found"}'
            })

        elif action_type == 'content_validation':
            required_fields = action.get('required_fields', [])
            skill_md = os.path.join(skill_path, 'SKILL.md')
            if os.path.exists(skill_md):
                with open(skill_md, 'r', encoding='utf-8') as f:
                    content = f.read().lower()
                missing = [fld for fld in required_fields if fld not in content]
                sub_results.append({
                    'sub_rule': sub_rule.get('id', ''),
                    'passed': len(missing) == 0,
                    'detail': f'Missing fields: {missing}' if missing else 'All required fields present'
                })
            else:
                sub_results.append({
                    'sub_rule': sub_rule.get('id', ''),
                    'passed': False,
                    'detail': 'SKILL.md not found, cannot validate content'
                })

    all_passed = all(r['passed'] for r in sub_results) if sub_results else True
    return {
        'rule': rule_id,
        'status': 'pass' if all_passed else 'fail',
        'message': '; '.join(r['detail'] for r in sub_results) if sub_results else 'No sub-rules to check',
        'sub_results': sub_results
    }


def _apply_quality_criteria(rule, skill_path):
    """处理含 check_criteria 的质量规则"""
    rule_id = rule.get('id', 'UNKNOWN')
    criteria = rule['check_criteria']
    issues = []

    must_have = criteria.get('must_have', [])
    for criterion in must_have:
        criterion_lower = criterion.lower()

        # "SKILL.md 文件存在且内容>100字"
        if 'skill.md' in criterion_lower and '存在' in criterion_lower:
            skill_md = os.path.join(skill_path, 'SKILL.md')
            if not os.path.exists(skill_md):
                issues.append(f'FAIL: {criterion}')
            elif '>100' in criterion or '>100' in criterion:
                with open(skill_md, 'r', encoding='utf-8') as f:
                    content = f.read()
                if len(content) <= 100:
                    issues.append(f'FAIL: {criterion} (actual: {len(content)} chars)')

        # "至少一个可执行代码文件"
        elif '可执行' in criterion_lower or 'executable' in criterion_lower:
            code_exts = ['js', 'cjs', 'py', 'sh']
            has_code = any(
                glob.glob(os.path.join(skill_path, f'*.{ext}')) or
                glob.glob(os.path.join(skill_path, '**', f'*.{ext}'), recursive=True)
                for ext in code_exts
            )
            if not has_code:
                issues.append(f'FAIL: {criterion}')

    return {
        'rule': rule_id,
        'status': 'pass' if not issues else 'fail',
        'message': '; '.join(issues) if issues else 'All quality criteria met'
    }


def _apply_threshold_check(rule, skill_path):
    """处理含 threshold 的检测标准"""
    rule_id = rule.get('id', 'UNKNOWN')
    threshold = rule['threshold']

    min_length = threshold.get('minLength', 0)
    required_fields = threshold.get('requiredFields', [])

    skill_md = os.path.join(skill_path, 'SKILL.md')
    if not os.path.exists(skill_md):
        return {
            'rule': rule_id,
            'status': 'fail',
            'message': 'SKILL.md not found for threshold check'
        }

    with open(skill_md, 'r', encoding='utf-8') as f:
        content = f.read()

    issues = []
    if min_length > 0 and len(content) < min_length:
        issues.append(f'Content length {len(content)} < required {min_length}')

    content_lower = content.lower()
    for field in required_fields:
        if field.lower() not in content_lower:
            issues.append(f'Missing required field: {field}')

    return {
        'rule': rule_id,
        'status': 'pass' if not issues else 'fail',
        'message': '; '.join(issues) if issues else 'Threshold check passed'
    }


def _apply_naming_check(rule, skill_path):
    """处理命名规范检查"""
    rule_id = rule.get('id', 'UNKNOWN')
    skill_name = os.path.basename(os.path.realpath(skill_path))

    # 目录名应该全小写、用连字符分隔
    is_valid = bool(re.match(r'^[a-z][a-z0-9-]*$', skill_name))

    return {
        'rule': rule_id,
        'status': 'pass' if is_valid else 'warn',
        'message': f'Skill directory name "{skill_name}" {"follows" if is_valid else "may not follow"} naming convention'
    }


def _classify_result(check, results):
    """将校验结果分类到 passed/failed/warnings/skipped"""
    status = check.get('status', 'skip')
    if status == 'pass':
        results['passed'].append(check)
    elif status == 'fail':
        results['failed'].append(check)
    elif status == 'warn':
        results['warnings'].append(check)
    else:
        results['skipped'].append(check)


# ═══════════════════════════════════════════════════════
# 便捷函数
# ═══════════════════════════════════════════════════════

def get_compliance_summary(skill_path, rules=None):
    """获取简洁的合规摘要"""
    result = check_skill(skill_path, rules)
    return {
        'skill': result['skill_name'],
        'score': round(result['score'], 2),
        'passed': len(result['passed']),
        'failed': len(result['failed']),
        'warnings': len(result['warnings']),
        'skipped': len(result['skipped']),
        'verdict': 'COMPLIANT' if result['score'] >= 0.7 else 'NON-COMPLIANT'
    }


def batch_check(skill_dirs, rules=None):
    """批量校验多个技能"""
    if rules is None:
        rules = load_rules()

    return {
        os.path.basename(d): get_compliance_summary(d, rules)
        for d in skill_dirs
    }


# ═══════════════════════════════════════════════════════
# CLI 入口
# ═══════════════════════════════════════════════════════

if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print('Usage: isc_bridge.py <skill_path> [--summary] [--batch dir1 dir2 ...]')
        sys.exit(1)

    if sys.argv[1] == '--batch':
        dirs = sys.argv[2:]
        results = batch_check(dirs)
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        skill_path = sys.argv[1]
        if '--summary' in sys.argv:
            result = get_compliance_summary(skill_path)
        else:
            result = check_skill(skill_path)
        print(json.dumps(result, ensure_ascii=False, indent=2))
