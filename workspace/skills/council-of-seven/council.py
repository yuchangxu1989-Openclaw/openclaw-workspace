#!/usr/bin/env python3
"""
Council of Seven v2.1 - 七人议会决策机制
来源: EvoMap 进化网络
Capsule ID: sha256:3affd21fc55ca97c7e469ee6f3e2a106ae9f41885d3f5d298c40ba5b28e6fb78
"""

import sys
import json
import random
from datetime import datetime
from typing import List, Dict, Any

class CouncilMember:
    """议会成员"""
    def __init__(self, role: str, perspective: str, weight: float):
        self.role = role
        self.perspective = perspective
        self.weight = weight
        self.opinion = None
        self.reasoning = ""
    
    def deliberate(self, topic: str, context: str = '') -> Dict[str, Any]:
        """发表意见"""
        # 基于角色视角生成意见模板
        templates = {
            'Strategist': [
                f'从战略角度看，"{topic}"符合长期发展方向，建议推进。',
                f'战略层面，"{topic}"有助于构建竞争壁垒，值得投入。',
                f'长远来看，"{topic}"是必要的一步，但需分阶段实施。'
            ],
            'Critic': [
                f'质疑点："{topic}"的假设是否成立？需要更多验证。',
                f'潜在问题："{topic}"可能带来未预期的副作用。',
                f'反对理由：当前条件下，"{topic}"风险大于收益。'
            ],
            'Optimist': [
                f'积极面："{topic}"将带来显著的机会和增长。',
                f'乐观估计："{topic}"成功率很高，值得尝试。',
                f'机会视角："{topic}"是难得的突破机会。'
            ],
            'Pessimist': [
                f'风险预警："{topic}"存在执行失败的可能性。',
                f'保守观点：建议暂缓"{topic}"，等待更好时机。',
                f'最坏情况：如果"{topic}"失败，损失可能很大。'
            ],
            'Analyst': [
                f'数据分析：基于现有信息，"{topic}"可行性为65%。',
                f'逻辑推理："{topic}"的前提条件基本满足。',
                f'客观评估："{topic}"的ROI预计在1.5-2.0之间。'
            ],
            'Creative': [
                f'创新方案：可以考虑用全新方式实现"{topic}"。',
                f'跳出框架："{topic}"或许可以与其他领域结合。',
                f'创意视角：这是重新定义"{topic}"的机会。'
            ],
            'Executive': [
                f'执行评估："{topic}"需要3-4周实施周期。',
                f'资源需求：完成"{topic}"需要2名开发+1名测试。',
                f'落地可行："{topic}"可以分阶段交付，风险可控。'
            ]
        }
        
        self.reasoning = random.choice(templates.get(self.role, ['需要更多信息。']))
        
        # 基于角色倾向投票
        vote_tendency = {
            'Strategist': 0.7,
            'Critic': 0.3,
            'Optimist': 0.9,
            'Pessimist': 0.2,
            'Analyst': 0.6,
            'Creative': 0.8,
            'Executive': 0.5
        }
        
        self.opinion = 'support' if random.random() < vote_tendency.get(self.role, 0.5) else 'oppose'
        
        return {
            'role': self.role,
            'perspective': self.perspective,
            'opinion': self.opinion,
            'reasoning': self.reasoning,
            'weight': self.weight
        }

class CouncilOfSeven:
    """七人议会"""
    def __init__(self):
        self.members = [
            CouncilMember('Strategist', '战略视角', 1.2),
            CouncilMember('Critic', '批判视角', 1.0),
            CouncilMember('Optimist', '乐观视角', 1.0),
            CouncilMember('Pessimist', '悲观视角', 0.9),
            CouncilMember('Analyst', '分析视角', 1.1),
            CouncilMember('Creative', '创意视角', 1.0),
            CouncilMember('Executive', '执行视角', 1.1)
        ]
        self.decisions = []
    
    def deliberate(self, topic: str, context: str = '') -> Dict[str, Any]:
        """
        议会审议
        
        Args:
            topic: 议题
            context: 背景信息
            
        Returns:
            决策结果
        """
        print(f"\n{'='*60}")
        print(f'🏛️  Council of Seven v2.1')
        print(f'议题: {topic}')
        if context:
            print(f'背景: {context}')
        print(f"{'='*60}\n")
        
        # 各成员发表意见
        perspectives = []
        total_weight = 0
        support_weight = 0
        
        for member in self.members:
            vote = member.deliberate(topic, context)
            perspectives.append(vote)
            
            icon = '✓' if vote['opinion'] == 'support' else '✗'
            print(f"[{member.role}] {member.perspective}")
            print(f"  {icon} {vote['reasoning'][:60]}...")
            print()
            
            total_weight += member.weight
            if vote['opinion'] == 'support':
                support_weight += member.weight
        
        # 计算结果
        support_ratio = support_weight / total_weight
        confidence = abs(support_ratio - 0.5) * 2  # 信心度
        
        if support_ratio >= 0.6:
            decision = 'approved'
            decision_text = '✓ 建议通过'
        elif support_ratio >= 0.4:
            decision = 'deferred'
            decision_text = '○ 建议暂缓'
        else:
            decision = 'rejected'
            decision_text = '✗ 建议否决'
        
        result = {
            'id': f'dec_{datetime.now().strftime("%Y%m%d_%H%M%S")}',
            'timestamp': datetime.now().isoformat(),
            'topic': topic,
            'context': context,
            'perspectives': perspectives,
            'statistics': {
                'total_weight': round(total_weight, 1),
                'support_weight': round(support_weight, 1),
                'support_ratio': round(support_ratio, 2),
                'confidence': round(confidence, 2)
            },
            'decision': decision,
            'decision_text': decision_text
        }
        
        self.decisions.append(result)
        
        # 输出结果
        print(f"{'='*60}")
        print('📊 投票统计:')
        print(f"  支持权重: {support_weight:.1f} / {total_weight:.1f}")
        print(f"  支持比例: {support_ratio*100:.1f}%")
        print(f"  信心指数: {confidence*100:.1f}%")
        print(f"  决策建议: {decision_text}")
        print(f"{'='*60}\n")
        
        return result
    
    def get_decision_history(self) -> List[Dict]:
        """获取决策历史"""
        return self.decisions
    
    def export_decision(self, decision_id: str, filepath: str):
        """导出决策记录"""
        decision = next((d for d in self.decisions if d['id'] == decision_id), None)
        if decision:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(decision, f, ensure_ascii=False, indent=2)
            print(f'💾 决策已导出: {filepath}')

def main():
    """主函数"""
    council = CouncilOfSeven()
    
    # 获取命令行参数
    if len(sys.argv) > 1:
        topic = sys.argv[1]
    else:
        topic = '是否引入新技能到系统中'
    
    context = sys.argv[2] if len(sys.argv) > 2 else ''
    
    # 执行审议
    decision = council.deliberate(topic, context)
    
    # 导出结果
    if decision:
        output_file = f'/tmp/council_decision_{decision["id"]}.json'
        council.export_decision(decision['id'], output_file)

if __name__ == '__main__':
    main()
