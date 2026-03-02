#!/usr/bin/env python3
"""
SEEF Subskill: Skill Evaluator
技能评估器 - 对现有技能进行多维质量诊断

v1.1.0 - 接入真实 ISC 规则校验（isc_bridge）
"""

import json
import hashlib
import sys
import os
from datetime import datetime
from pathlib import Path

# 确保能 import 同级目录的 isc_bridge
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from isc_bridge import check_skill as isc_check_skill, load_rules as isc_load_rules

class SkillEvaluator:
    """技能评估器"""
    
    def __init__(self, isc_client=None, cras_client=None):
        self.isc_client = isc_client
        self.cras_client = cras_client
        self._isc_rules = None  # 延迟加载
        self.results = {
            'subskill': 'evaluator',
            'version': '1.1.0',
            'timestamp': datetime.now().isoformat(),
            'findings': [],
            'metrics': {}
        }
    
    def evaluate(self, skill_path, cras_report=None):
        """
        评估技能
        
        Args:
            skill_path: 技能目录路径
            cras_report: CRAS 用户意图洞察报告（可选）
            
        Returns:
            评估结果
        """
        print(f'  📋 评估技能: {skill_path}')
        
        # 1. 文件完整性检查
        integrity = self._check_file_integrity(skill_path)
        self.results['metrics']['integrity'] = integrity
        
        # 2. 文档结构检查
        doc_structure = self._check_document_structure(skill_path)
        self.results['metrics']['doc_structure'] = doc_structure
        
        # 3. 标准符合性检查
        standard_compliance = self._check_standard_compliance(skill_path)
        self.results['metrics']['standard_compliance'] = standard_compliance
        
        # 4. 融合 CRAS 报告（如有）
        if cras_report:
            user_behavior = self._analyze_user_behavior(cras_report)
            self.results['metrics']['user_behavior'] = user_behavior
        else:
            self.results['findings'].append({
                'level': 'warning',
                'message': '缺乏用户侧依据（CRAS报告缺失）',
                'recommendation': '建议启用 CRAS 用户洞察模块'
            })
        
        # 5. 综合评估
        exit_status = self._determine_exit_status()
        self.results['exit_status'] = exit_status
        
        return self.results
    
    def _check_file_integrity(self, skill_path):
        """文件完整性检查"""
        path = Path(skill_path)
        
        required_files = ['SKILL.md']
        optional_files = ['README.md', 'index.js', 'package.json']
        
        findings = []
        
        for f in required_files:
            if not (path / f).exists():
                findings.append({
                    'level': 'error',
                    'type': 'missing_file',
                    'file': f,
                    'message': f'缺少必需文件: {f}'
                })
        
        # 计算哈希
        hashes = {}
        for f in required_files + optional_files:
            file_path = path / f
            if file_path.exists():
                with open(file_path, 'rb') as fp:
                    hashes[f] = hashlib.sha256(fp.read()).hexdigest()[:16]
        
        return {
            'status': 'passed' if not any(f['level'] == 'error' for f in findings) else 'failed',
            'findings': findings,
            'hashes': hashes
        }
    
    def _check_document_structure(self, skill_path):
        """文档结构检查"""
        skill_md = Path(skill_path) / 'SKILL.md'
        
        if not skill_md.exists():
            return {'status': 'failed', 'error': 'SKILL.md 不存在'}
        
        with open(skill_md, 'r', encoding='utf-8') as f:
            content = f.read()
        
        required_sections = ['name', 'description', 'version']
        findings = []
        
        for section in required_sections:
            if section not in content.lower():
                findings.append({
                    'level': 'error',
                    'type': 'missing_section',
                    'section': section,
                    'message': f'SKILL.md 缺少必需字段: {section}'
                })
        
        return {
            'status': 'passed' if not findings else 'failed',
            'findings': findings,
            'content_length': len(content)
        }
    
    def _check_standard_compliance(self, skill_path):
        """标准符合性检查 - 接入真实 ISC 规则校验"""
        try:
            # 延迟加载规则（只加载一次）
            if self._isc_rules is None:
                self._isc_rules = isc_load_rules()

            isc_result = isc_check_skill(skill_path, self._isc_rules)

            # 将 ISC 校验的 failed 项转为 evaluator findings
            for failure in isc_result.get('failed', []):
                self.results['findings'].append({
                    'level': 'error',
                    'source': 'isc_bridge',
                    'rule': failure.get('rule', 'UNKNOWN'),
                    'message': failure.get('message', ''),
                    'recommendation': f'修复 ISC 规则 {failure.get("rule", "")} 的不符合项'
                })

            # warnings 也记录
            for warning in isc_result.get('warnings', []):
                self.results['findings'].append({
                    'level': 'warning',
                    'source': 'isc_bridge',
                    'rule': warning.get('rule', 'UNKNOWN'),
                    'message': warning.get('message', '')
                })

            compliance_score = isc_result.get('score', 0)
            return {
                'status': 'passed' if compliance_score >= 0.7 else 'failed',
                'compliance_score': round(compliance_score, 4),
                'isc_rules_loaded': isc_result.get('total_rules_evaluated', 0),
                'passed_count': len(isc_result.get('passed', [])),
                'failed_count': len(isc_result.get('failed', [])),
                'warning_count': len(isc_result.get('warnings', [])),
                'skipped_count': len(isc_result.get('skipped', [])),
                'findings': isc_result.get('failed', []) + isc_result.get('warnings', [])
            }
        except Exception as e:
            # 降级：ISC 桥接不可用时返回 degraded 状态
            self.results['findings'].append({
                'level': 'warning',
                'source': 'isc_bridge',
                'message': f'ISC 规则桥接异常，已降级: {str(e)}',
                'recommendation': '检查 isc_bridge.py 和 isc-core/rules/ 目录'
            })
            return {
                'status': 'degraded',
                'compliance_score': 0,
                'error': str(e),
                'findings': []
            }
    
    def _analyze_user_behavior(self, cras_report):
        """分析用户行为（基于真实 CRAS 报告数据）"""
        pain_points = cras_report.get('pain_points', [])
        workaround_count = cras_report.get('workaround_count', 0)
        success_rate = cras_report.get('success_rate', None)

        # 根据实际数据生成 findings
        if workaround_count > 3:
            self.results['findings'].append({
                'level': 'warning',
                'source': 'cras_analysis',
                'message': f'用户存在 {workaround_count} 个变通方案，表明技能存在功能缺口',
                'recommendation': '分析变通方案覆盖的场景，补充技能能力'
            })

        if success_rate is not None and success_rate < 0.8:
            self.results['findings'].append({
                'level': 'error',
                'source': 'cras_analysis',
                'message': f'用户成功率偏低: {success_rate:.0%}',
                'recommendation': '优先修复高频失败路径'
            })

        return {
            'status': 'analyzed',
            'pain_points': pain_points,
            'workaround_count': workaround_count,
            'success_rate': success_rate if success_rate is not None else 'unknown',
            'pain_point_count': len(pain_points)
        }
    
    def _determine_exit_status(self):
        """确定准出状态"""
        findings = self.results['findings']
        
        errors = [f for f in findings if f['level'] == 'error']
        warnings = [f for f in findings if f['level'] == 'warning']
        
        if errors:
            return 'need_investigation'
        elif warnings:
            return 'ready_for_next'
        else:
            return 'skip'

def main():
    """命令行入口"""
    import sys
    
    if len(sys.argv) < 2:
        print('Usage: evaluator.py <skill_path> [cras_report.json]')
        sys.exit(1)
    
    skill_path = sys.argv[1]
    cras_report = None
    
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'r') as f:
            cras_report = json.load(f)
    
    evaluator = SkillEvaluator()
    result = evaluator.evaluate(skill_path, cras_report)
    
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
