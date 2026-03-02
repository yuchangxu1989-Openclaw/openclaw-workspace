#!/usr/bin/env python3
"""
SEEF Subskill: Skill Evaluator (增强版)
技能评估器 - 引用 healthcheck 作为子模块
"""

import json
import subprocess
from datetime import datetime
from pathlib import Path

class SkillEvaluator:
    """技能评估器 - 集成独立 healthcheck"""
    
    def __init__(self):
        self.healthcheck_path = '/usr/lib/node_modules/openclaw/skills/healthcheck'
        self.results = {
            'subskill': 'evaluator',
            'version': '1.1.0',
            'timestamp': datetime.now().isoformat(),
            'integrated_modules': ['healthcheck'],
            'findings': [],
            'metrics': {}
        }
    
    def evaluate(self, skill_path, cras_report=None):
        """
        评估技能
        
        Args:
            skill_path: 技能目录路径
            cras_report: CRAS 用户意图洞察报告
            
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
        
        # 3. 调用独立 healthcheck 模块
        health_result = self._call_healthcheck(skill_path)
        self.results['metrics']['health_check'] = health_result
        
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
        import hashlib
        path = Path(skill_path)
        
        required_files = ['SKILL.md']
        findings = []
        hashes = {}
        
        for f in required_files:
            file_path = path / f
            if file_path.exists():
                with open(file_path, 'rb') as fp:
                    hashes[f] = hashlib.sha256(fp.read()).hexdigest()[:16]
            else:
                findings.append({
                    'level': 'error',
                    'type': 'missing_file',
                    'file': f
                })
        
        return {
            'status': 'passed' if not findings else 'failed',
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
                    'section': section
                })
        
        return {
            'status': 'passed' if not findings else 'failed',
            'findings': findings,
            'content_length': len(content)
        }
    
    def _call_healthcheck(self, skill_path):
        """调用独立 healthcheck 模块"""
        # 检查 healthcheck 是否可用
        try:
            result = subprocess.run(
                ['openclaw', 'doctor', '--quick'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            return {
                'status': 'completed',
                'module': 'healthcheck',
                'exit_code': result.returncode,
                'summary': '安全健康检查已执行'
            }
        except Exception as e:
            return {
                'status': 'error',
                'module': 'healthcheck',
                'error': str(e)
            }
    
    def _analyze_user_behavior(self, cras_report):
        """分析用户行为"""
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
        
        if errors:
            return 'need_investigation'
        return 'ready_for_next'

def main():
    """命令行入口"""
    import sys
    
    if len(sys.argv) < 2:
        print('Usage: evaluator_v2.py <skill_path> [cras_report.json]')
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
