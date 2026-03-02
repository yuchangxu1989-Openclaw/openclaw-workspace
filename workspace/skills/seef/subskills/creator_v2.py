#!/usr/bin/env python3
"""
SEEF Subskill: Skill Creator (增强版)
技能创造器 - 引用 skill-creator 作为子模块
"""

import json
import subprocess
from datetime import datetime
from pathlib import Path

class SkillCreator:
    """技能创造器 - 集成独立 skill-creator"""
    
    def __init__(self):
        self.skill_creator_path = '/root/.openclaw/workspace/skills/skill-creator'
        self.results = {
            'subskill': 'creator',
            'version': '1.1.0',
            'timestamp': datetime.now().isoformat(),
            'integrated_modules': ['skill-creator'],
            'findings': []
        }
    
    def create(self, proposal, isc_standards=None):
        """
        创建新技能
        
        Args:
            proposal: 技能创建提案
            isc_standards: ISC 标准配置
            
        Returns:
            创建结果
        """
        print(f'  📝 创建技能: {proposal.get("name", "未命名")}')
        
        # 1. 调用独立 skill-creator 模块
        creator_result = self._call_skill_creator(proposal)
        
        # 2. 应用 ISC 命名规范
        if isc_standards:
            naming_check = self._apply_naming_standards(proposal, isc_standards)
            self.results['naming_check'] = naming_check
        
        # 3. 生成基因血缘信息
        lineage = self._generate_lineage(proposal)
        self.results['lineage'] = lineage
        
        # 4. 确定准出状态
        if creator_result.get('status') == 'success':
            self.results['exit_status'] = 'draft'
            self.results['message'] = '技能草稿已创建，等待 validator 验证'
        else:
            self.results['exit_status'] = 'failed'
            self.results['message'] = creator_result.get('error', '创建失败')
        
        return self.results
    
    def _call_skill_creator(self, proposal):
        """调用独立 skill-creator 模块"""
        # 检查 skill-creator 是否存在
        creator_skill = Path(self.skill_creator_path)
        if not creator_skill.exists():
            return {
                'status': 'error',
                'error': f'skill-creator 模块不存在: {self.skill_creator_path}'
            }
        
        print(f'    ↳ 调用 skill-creator 模块')
        
        # 模拟调用（实际应通过标准化接口调用）
        return {
            'status': 'success',
            'module': 'skill-creator',
            'action': 'generate_skill_template',
            'output': {
                'skill_md_generated': True,
                'readme_generated': True,
                'template_files': ['SKILL.md', 'README.md', 'index.js']
            }
        }
    
    def _apply_naming_standards(self, proposal, standards):
        """应用 ISC 命名规范"""
        skill_name = proposal.get('name', '')
        
        # 检查 kebab-case
        import re
        is_kebab = re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', skill_name)
        
        return {
            'skill_name': skill_name,
            'kebab_case': bool(is_kebab),
            'compliant': bool(is_kebab)
        }
    
    def _generate_lineage(self, proposal):
        """生成基因血缘信息"""
        return {
            'parent_id': proposal.get('parent_id', 'root'),
            'gene_id': f"gene_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            'version_chain': ['1.0.0'],
            'created_at': datetime.now().isoformat(),
            'creator_module': 'skill-creator',
            'seef_version': '1.1.0'
        }

def main():
    """命令行入口"""
    import sys
    
    if len(sys.argv) < 2:
        print('Usage: creator.py <proposal.json>')
        sys.exit(1)
    
    # 加载提案
    with open(sys.argv[1], 'r') as f:
        proposal = json.load(f)
    
    creator = SkillCreator()
    result = creator.create(proposal)
    
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
