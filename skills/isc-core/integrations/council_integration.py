#!/usr/bin/env python3
"""
ISC与Council of Seven集成模块
关键决策必经七人议会审议
"""

import sys
import json
import subprocess
from datetime import datetime
from pathlib import Path

class ISCCouncilIntegration:
    """ISC与七人议会集成"""
    
    def __init__(self):
        self.council_script = '/root/.openclaw/workspace/skills/council-of-seven/council.py'
        self.decisions_dir = '/root/.openclaw/workspace/skills/isc-core/council-decisions'
        Path(self.decisions_dir).mkdir(parents=True, exist_ok=True)
    
    def requires_council_review(self, proposal):
        """
        判断是否需要七人议会审议
        
        触发条件 (全部需要审议):
        - 影响 >3 个子系统
        - 优先级 P9+
        - 安全/架构相关
        - 新增/合并技能
        - **新增规则 (new_rule)**
        - **订阅变更 (subscription_change)**
        - **流水线模块更新 (pipeline_update)**
        """
        triggers = {
            'high_impact': proposal.get('impact', 0) > 3,
            'high_priority': proposal.get('priority', 0) >= 9,
            'security': proposal.get('type') == 'security',
            'architecture': proposal.get('type') == 'architecture',
            'new_skill': proposal.get('type') == 'new_skill',
            'merge_skill': proposal.get('type') == 'merge_skill',
            'critical_rule': proposal.get('type') == 'critical_rule',
            'new_rule': proposal.get('type') == 'new_rule',           # 新增规则
            'subscription_change': proposal.get('type') == 'subscription_change',  # 订阅变更
            'pipeline_update': proposal.get('type') == 'pipeline_update'           # 流水线更新
        }
        
        return any(triggers.values()), triggers
    
    def call_council(self, title, context=''):
        """调用七人议会"""
        try:
            result = subprocess.run(
                ['python3', self.council_script, title, context],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            # 读取决策结果
            import glob
            decision_files = glob.glob('/tmp/council_decision_*.json')
            if decision_files:
                latest = max(decision_files, key=lambda x: Path(x).stat().st_mtime)
                with open(latest, 'r') as f:
                    return json.load(f)
            
            return None
        except Exception as e:
            print(f'[ISC-Council] 调用失败: {e}')
            return None
    
    def save_decision(self, proposal, council_result):
        """保存决策记录"""
        record = {
            'id': f"isc_council_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            'timestamp': datetime.now().isoformat(),
            'proposal': proposal,
            'council_decision': council_result.get('decision'),
            'support_ratio': council_result.get('statistics', {}).get('support_ratio'),
            'perspectives': council_result.get('perspectives', []),
            'status': 'approved' if council_result.get('decision') == 'approved' else 'rejected'
        }
        
        filepath = Path(self.decisions_dir) / f"{record['id']}.json"
        with open(filepath, 'w') as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
        
        return record
    
    def process_proposal(self, proposal):
        """
        处理提案
        
        完整流程:
        1. 检查是否需要审议
        2. 如需要，调用七人议会
        3. 保存决策记录
        4. 返回结果
        """
        print(f"\n{'='*60}")
        print(f'[ISC-Council] 处理提案: {proposal.get("title", "Unknown")}')
        print(f"{'='*60}\n")
        
        # 1. 检查是否需要审议
        needs_review, triggers = self.requires_council_review(proposal)
        
        print('触发条件检查:')
        for condition, triggered in triggers.items():
            status = '✓' if triggered else '✗'
            print(f'  {status} {condition}')
        
        if not needs_review:
            print('\n[ISC-Council] 无需审议，直接执行')
            return {
                'status': 'direct_execution',
                'proposal': proposal,
                'message': '未达到审议门槛'
            }
        
        print('\n[ISC-Council] 需要七人议会审议')
        
        # 2. 调用七人议会
        council_result = self.call_council(
            proposal.get('title', '未命名提案'),
            proposal.get('description', '')
        )
        
        if not council_result:
            print('[ISC-Council] 审议失败')
            return {
                'status': 'error',
                'message': '七人议会调用失败'
            }
        
        # 3. 保存决策记录
        record = self.save_decision(proposal, council_result)
        
        # 4. 返回结果
        decision = council_result.get('decision')
        support_ratio = council_result.get('statistics', {}).get('support_ratio', 0)
        
        print(f'\n[ISC-Council] 审议完成')
        print(f'  决策: {decision}')
        print(f'  支持率: {support_ratio*100:.1f}%')
        print(f'  记录: {record["id"]}')
        
        if decision == 'approved':
            return {
                'status': 'approved',
                'proposal': proposal,
                'council_result': council_result,
                'record': record,
                'message': '七人议会通过，可以执行'
            }
        else:
            return {
                'status': 'rejected',
                'proposal': proposal,
                'council_result': council_result,
                'record': record,
                'message': f'七人议会{decision}，终止执行'
            }

def main():
    """测试"""
    integration = ISCCouncilIntegration()
    
    # 测试1: 高优先级提案（需要审议）
    print('\n=== 测试1: 高优先级提案 ===')
    proposal1 = {
        'title': '新增技能 isc-council-integration',
        'description': '将七人议会集成到ISC关键决策流程',
        'type': 'new_skill',
        'priority': 9,
        'impact': 5
    }
    result1 = integration.process_proposal(proposal1)
    print(f'结果: {result1["status"]}')
    
    # 测试2: 低优先级提案（无需审议）
    print('\n=== 测试2: 低优先级提案 ===')
    proposal2 = {
        'title': '更新文档注释',
        'description': '补充代码注释',
        'type': 'documentation',
        'priority': 5,
        'impact': 1
    }
    result2 = integration.process_proposal(proposal2)
    print(f'结果: {result2["status"]}')
    
    print('\n=== 测试完成 ===')

if __name__ == '__main__':
    main()
