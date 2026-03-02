#!/usr/bin/env python3
"""
SEEF Subskill: Skill Evaluator
技能评估器 - 对现有技能进行多维质量诊断
"""

import json
import hashlib
from datetime import datetime
from pathlib import Path

class SkillEvaluator:
    """技能评估器"""
    
    def __init__(self, isc_client=None, cras_client=None):
        self.isc_client = isc_client
        self.cras_client = cras_client
        self.results = {
            'subskill': 'evaluator',
            'version': '1.0.0',
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
        """标准符合性检查"""
        # 模拟 ISC 标准检查
        return {
            'status': 'passed',
            'compliance_score': 0.85,
            'findings': []
        }
    
    def _analyze_user_behavior(self, cras_report):
        """分析用户行为"""
        # 模拟 CRAS 报告分析
        return {
            'status': 'analyzed',
            'pain_points': cras_report.get('pain_points', []),
            'workaround_count': cras_report.get('workaround_count', 0),
            'success_rate': cras_report.get('success_rate', 0.95)
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
