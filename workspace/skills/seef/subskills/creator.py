#!/usr/bin/env python3
"""
SEEF Subskill: Skill Creator v2.0
技能创造器 - 基于模板自动生成符合规范的新技能原型

功能特性：
- 基于优化方案自动生成新技能
- 多种技能模板支持
- ISC标准自动符合
- 版本控制和文档生成
- DTO事件总线集成
- 输入输出数据管道
- 错误处理和降级机制
"""

import os

OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", "/root/.openclaw")
WORKSPACE_PATH = os.path.join(OPENCLAW_HOME, "workspace")
SKILLS_PATH = os.path.join(WORKSPACE_PATH, "skills")
import sys
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from string import Template
import hashlib

from distribution_classifier import classify_skill_distribution

# DTO事件总线集成
class DTOEventBus:
    """DTO事件总线客户端"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or str(Path(OPENCLAW_HOME) / 'workspace/skills/dto-core/config/event-bus.json')
        self.events = []
        self._connected = False
        
    def connect(self) -> bool:
        """连接到事件总线"""
        try:
            config_file = Path(self.config_path)
            if config_file.exists():
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    self._connected = config.get('enabled', True)
            else:
                self._connected = True
            return True
        except Exception as e:
            print(f"  ⚠️  事件总线连接失败: {e}，降级到本地模式")
            self._connected = True
            return True
    
    def publish(self, event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """发布事件到总线"""
        event = {
            'event_type': event_type,
            'data': data,
            'timestamp': datetime.now().isoformat(),
            'source': 'seef.creator'
        }
        self.events.append(event)
        
        try:
            events_dir = Path(OPENCLAW_HOME) / 'workspace/skills/seef/events'
            events_dir.mkdir(parents=True, exist_ok=True)
            
            event_file = events_dir / f"{event_type}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.json"
            with open(event_file, 'w') as f:
                json.dump(event, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
            
        return event


@dataclass
class CreatedSkill:
    """创建的技能信息"""
    skill_name: str
    skill_path: str
    template_type: str
    distribution: str
    distribution_details: Dict[str, Any]
    files_created: List[str]
    isc_compliant: bool
    creation_timestamp: str
    estimated_completion: str


class SkillCreator:
    """
    技能创造器 - 核心实现类
    """
    
    VERSION = "2.0.0"
    
    # 技能模板库
    TEMPLATES = {
        'standard': {
            'description': '标准JavaScript技能模板',
            'language': 'javascript',
            'files': ['SKILL.md', 'index.js', 'package.json', 'README.md']
        },
        'python': {
            'description': 'Python技能模板',
            'language': 'python',
            'files': ['SKILL.md', 'index.py', 'requirements.txt', 'README.md']
        },
        'api': {
            'description': 'API集成技能模板',
            'language': 'javascript',
            'files': ['SKILL.md', 'index.js', 'package.json', 'config.yaml', 'README.md']
        },
        'automation': {
            'description': '自动化任务技能模板',
            'language': 'javascript',
            'files': ['SKILL.md', 'index.js', 'package.json', 'schedule.yaml', 'README.md']
        },
        'ml': {
            'description': '机器学习技能模板',
            'language': 'python',
            'files': ['SKILL.md', 'index.py', 'requirements.txt', 'model/.gitkeep', 'README.md']
        }
    }
    
    # ISC标准检查点
    ISC_REQUIREMENTS = {
        'required_sections': ['name', 'description', 'version', 'input', 'output'],
        'optional_sections': ['dependencies', 'examples', 'notes'],
        'required_files': ['SKILL.md'],
        'recommended_files': ['README.md', 'index.js', 'index.py']
    }
    
    def __init__(self, event_bus: Optional[DTOEventBus] = None):
        self.event_bus = event_bus or DTOEventBus()
        self.event_bus.connect()
        
        self.skills_base_path = Path(SKILLS_PATH)
        self.templates_path = Path(SKILLS_PATH) / 'seef/templates'
        
        self.creation_results = {
            'subskill': 'creator',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'ready_for_next',
            'input_requests': [],
            'created_skills': [],
            'failed_creations': [],
            'isc_compliance_reports': [],
            'metrics': {},
            'errors': []
        }
        
    def run(self, skill_path: Optional[str] = None,
            optimizer_results: Optional[Dict] = None,
            requests: Optional[List[Dict]] = None,
            context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        运行技能创建流程
        
        Args:
            skill_path: 特定技能路径（可选）
            optimizer_results: 优化器结果
            requests: 直接创建请求列表
            context: 执行上下文
            
        Returns:
            创建结果
        """
        print(f"\n🛠️  开始技能创建流程...")
        print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        try:
            # 1. 收集创建请求
            creation_requests = self._collect_requests(optimizer_results, requests, context)
            self.creation_results['input_requests'] = [r.get('request_id') for r in creation_requests]
            print(f"   收集到 {len(creation_requests)} 个创建请求")
            
            # 2. 处理每个创建请求
            for request in creation_requests:
                try:
                    created = self._process_creation_request(request)
                    if created:
                        self.creation_results['created_skills'].append(asdict(created))
                        print(f"   ✓ 创建技能: {created.skill_name}")
                except Exception as e:
                    error_msg = f"创建请求 {request.get('request_id', 'unknown')} 失败: {e}"
                    self.creation_results['failed_creations'].append({
                        'request': request,
                        'error': error_msg
                    })
                    print(f"   ✗ {error_msg}")
                    continue
            
            # 3. ISC标准检查
            for skill in self.creation_results['created_skills']:
                compliance = self._check_isc_compliance(skill)
                self.creation_results['isc_compliance_reports'].append(compliance)
            
            # 4. 计算指标
            metrics = self._calculate_metrics()
            self.creation_results['metrics'] = metrics
            
            # 5. 确定准出状态
            exit_status = self._determine_exit_status()
            self.creation_results['exit_status'] = exit_status
            
            # 6. 发布创建事件
            self._publish_creation_event()
            
            print(f"   ✓ 技能创建完成，状态: {exit_status}")
            
        except Exception as e:
            error_msg = f"创建过程出错: {str(e)}"
            self.creation_results['errors'].append(error_msg)
            self.creation_results['exit_status'] = 'failed'
            print(f"   ✗ {error_msg}")
            
            self.event_bus.publish('seef.creator.error', {
                'error': error_msg,
                'traceback': self._get_traceback()
            })
            
            return self._degraded_result()
        
        return self.creation_results
    
    def _collect_requests(self, optimizer_results: Optional[Dict],
                          requests: Optional[List[Dict]],
                          context: Optional[Dict]) -> List[Dict]:
        """收集创建请求"""
        all_requests = []
        
        # 从优化器结果中提取
        if optimizer_results:
            plans = optimizer_results.get('optimization_plans', [])
            for plan in plans:
                if plan.get('plan_type') == 'enhance':
                    request = self._plan_to_request(plan)
                    if request:
                        all_requests.append(request)
        
        # 直接传入的请求
        if requests:
            for i, req in enumerate(requests):
                if 'request_id' not in req:
                    req['request_id'] = f"REQ_{datetime.now().strftime('%Y%m%d')}_{i:03d}"
                all_requests.append(req)
        
        # 从上下文提取
        if context and 'creation_requests' in context:
            all_requests.extend(context['creation_requests'])
        
        return all_requests
    
    def _plan_to_request(self, plan: Dict) -> Optional[Dict]:
        """将优化计划转换为创建请求"""
        changes = plan.get('changes', [])
        
        for change in changes:
            if change.get('type') == 'create_skill':
                suggested_names = change.get('suggested_names', [])
                if suggested_names:
                    return {
                        'request_id': plan.get('plan_id', f"REQ_{datetime.now().strftime('%Y%m%d')}"),
                        'skill_name': suggested_names[0],
                        'skill_name_alternatives': suggested_names[1:],
                        'template_type': change.get('template', 'standard'),
                        'description': plan.get('description', ''),
                        'source_plan': plan.get('plan_id'),
                        'capabilities': plan.get('expected_outcome', {}).get('fills_gap', '')
                    }
        
        return None
    
    def _process_creation_request(self, request: Dict) -> Optional[CreatedSkill]:
        """处理创建请求"""
        skill_name = self._sanitize_skill_name(request.get('skill_name', 'new-skill'))
        template_type = request.get('template_type', 'standard')
        
        # 检查模板有效性
        if template_type not in self.TEMPLATES:
            print(f"   ⚠️  未知模板 {template_type}，使用标准模板")
            template_type = 'standard'
        
        # 检查技能是否已存在
        skill_path = self.skills_base_path / skill_name
        if skill_path.exists():
            # 尝试使用替代名称
            alternatives = request.get('skill_name_alternatives', [])
            for alt in alternatives:
                alt_path = self.skills_base_path / self._sanitize_skill_name(alt)
                if not alt_path.exists():
                    skill_name = self._sanitize_skill_name(alt)
                    skill_path = alt_path
                    break
            else:
                # 添加版本号
                skill_name = f"{skill_name}-v2"
                skill_path = self.skills_base_path / skill_name
        
        # 创建技能目录
        skill_path.mkdir(parents=True, exist_ok=True)
        
        # 生成文件
        files_created = self._generate_skill_files(
            skill_path, 
            skill_name, 
            template_type,
            request
        )

        # 自动分类：local / public，并写回 SKILL.md
        distribution_details = classify_skill_distribution(skill_path)
        distribution = distribution_details['distribution']
        self._apply_distribution_to_skill_md(skill_path, distribution)
        if 'SKILL.md' not in files_created and (skill_path / 'SKILL.md').exists():
            files_created.append('SKILL.md')
        
        # 验证ISC合规性
        isc_compliant = self._verify_isc_compliance(skill_path)
        
        return CreatedSkill(
            skill_name=skill_name,
            skill_path=str(skill_path),
            template_type=template_type,
            distribution=distribution,
            distribution_details=distribution_details,
            files_created=files_created,
            isc_compliant=isc_compliant,
            creation_timestamp=datetime.now().isoformat(),
            estimated_completion='80%'  # 需要人工完善
        )
    
    def _sanitize_skill_name(self, name: str) -> str:
        """清理技能名称"""
        # 转换为小写，替换空格和特殊字符
        sanitized = re.sub(r'[^a-zA-Z0-9\-_]', '-', name.lower())
        sanitized = re.sub(r'-+', '-', sanitized)  # 合并多个连字符
        sanitized = sanitized.strip('-')
        
        # 限制长度
        if len(sanitized) > 50:
            sanitized = sanitized[:50]
        
        return sanitized or 'new-skill'
    
    def _apply_distribution_to_skill_md(self, skill_path: Path, distribution: str) -> None:
        """将自动分类结果写入 SKILL.md。"""
        skill_md = skill_path / 'SKILL.md'
        if not skill_md.exists():
            return

        content = skill_md.read_text(encoding='utf-8')
        if re.search(r'^distribution:\s*(local|public)\s*$', content, flags=re.MULTILINE):
            content = re.sub(
                r'^distribution:\s*(local|public)\s*$',
                f'distribution: {distribution}',
                content,
                count=1,
                flags=re.MULTILINE,
            )
        else:
            lines = content.splitlines()
            if lines:
                lines.insert(1, '')
                lines.insert(2, f'distribution: {distribution}')
                content = '\n'.join(lines)
                if not content.endswith('\n'):
                    content += '\n'
            else:
                content = f'distribution: {distribution}\n'

        skill_md.write_text(content, encoding='utf-8')

    def _generate_skill_files(self, skill_path: Path, skill_name: str,
                               template_type: str, request: Dict) -> List[str]:
        """生成技能文件"""
        files_created = []
        template = self.TEMPLATES[template_type]
        
        # 准备模板变量
        template_vars = {
            'skill_name': skill_name,
            'skill_name_camel': self._to_camel_case(skill_name),
            'skill_name_title': skill_name.replace('-', ' ').title(),
            'description': request.get('description', f'{skill_name} skill'),
            'capabilities': request.get('capabilities', ''),
            'version': '1.0.0',
            'created_date': datetime.now().strftime('%Y-%m-%d'),
            'author': 'SEEF-Creator'
        }
        
        for file_name in template['files']:
            try:
                content = self._get_file_content(file_name, template_type, template_vars)
                file_path = skill_path / file_name
                
                # 确保父目录存在
                file_path.parent.mkdir(parents=True, exist_ok=True)
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                files_created.append(file_name)
            except Exception as e:
                print(f"   ⚠️  创建文件 {file_name} 失败: {e}")
                continue
        
        return files_created
    
    def _get_file_content(self, file_name: str, template_type: str, 
                          vars: Dict[str, str]) -> str:
        """获取文件内容"""
        content_generators = {
            'SKILL.md': self._generate_skill_md,
            'index.js': self._generate_index_js,
            'index.py': self._generate_index_py,
            'package.json': self._generate_package_json,
            'requirements.txt': self._generate_requirements_txt,
            'README.md': self._generate_readme_md,
            'config.yaml': self._generate_config_yaml,
            'schedule.yaml': self._generate_schedule_yaml
        }
        
        generator = content_generators.get(file_name)
        if generator:
            return generator(template_type, vars)
        
        # 默认.gitkeep
        if file_name.endswith('.gitkeep'):
            return '# Keep this directory\n'
        
        return ''
    
    def _generate_skill_md(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成SKILL.md"""
        return f"""# {vars['skill_name_title']}

distribution: local

## Name

{vars['skill_name']}

## Description

{vars['description']}

## Version

{vars['version']}

## Input

- input: Description of expected input
- options: Optional parameters

## Output

- result: Description of output
- status: Operation status

## Dependencies

- List of dependencies

## Examples

### Example 1
```
Input: example input
Output: example output
```

## Notes

Created by SEEF Skill Creator v{self.VERSION} on {vars['created_date']}
Capability: {vars['capabilities']}
"""
    
    def _generate_index_js(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成index.js"""
        if template_type == 'api':
            return f"""/**
 * {vars['skill_name_title']}
 * {vars['description']}
 */

const axios = require('axios');

class {vars['skill_name_camel']} {{
  constructor(config = {{}}) {{
    this.config = config;
    this.apiEndpoint = config.apiEndpoint || process.env.API_ENDPOINT;
  }}

  async execute(input, options = {{}}) {{
    try {{
      // TODO: Implement API integration
      console.log(`[{vars['skill_name']}] Executing with input:`, input);
      
      return {{
        result: 'success',
        data: {{}},
        timestamp: new Date().toISOString()
      }};
    }} catch (error) {{
      return {{
        result: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }};
    }}
  }}
}}

module.exports = {vars['skill_name_camel']};
"""
        elif template_type == 'automation':
            return f"""/**
 * {vars['skill_name_title']}
 * {vars['description']}
 */

class {vars['skill_name_camel']} {{
  constructor(config = {{}}) {{
    this.config = config;
    this.name = '{vars['skill_name']}';
  }}

  async execute(context = {{}}) {{
    try {{
      console.log(`[{vars['skill_name']}] Automation task started`);
      
      // TODO: Implement automation logic
      
      return {{
        result: 'success',
        executed: true,
        timestamp: new Date().toISOString()
      }};
    }} catch (error) {{
      console.error(`[{vars['skill_name']}] Error:`, error);
      return {{
        result: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }};
    }}
  }}
}}

module.exports = {vars['skill_name_camel']};
"""
        else:
            return f"""/**
 * {vars['skill_name_title']}
 * {vars['description']}
 */

class {vars['skill_name_camel']} {{
  constructor(config = {{}}) {{
    this.config = config;
    this.name = '{vars['skill_name']}';
  }}

  async execute(input, options = {{}}) {{
    try {{
      console.log(`[{vars['skill_name']}] Executing...`);
      
      // TODO: Implement skill logic
      const result = await this.process(input, options);
      
      return {{
        result: 'success',
        data: result,
        timestamp: new Date().toISOString()
      }};
    }} catch (error) {{
      console.error(`[{vars['skill_name']}] Error:`, error);
      return {{
        result: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }};
    }}
  }}

  async process(input, options) {{
    // TODO: Implement processing logic
    return {{}};
  }}
}}

module.exports = {vars['skill_name_camel']};
"""
    
    def _generate_index_py(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成index.py"""
        return f"""#!/usr/bin/env python3
\"\"\"
{vars['skill_name_title']}
{vars['description']}
\"\"\"

import json
import argparse
from datetime import datetime
from typing import Dict, Any, Optional


class {vars['skill_name_camel']}:
    \"\"\"{vars['description']}\"\"\"
    
    VERSION = "{vars['version']}"
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or {{}}
        self.name = "{vars['skill_name']}"
    
    def execute(self, input_data: Dict[str, Any], options: Optional[Dict] = None) -> Dict[str, Any]:
        \"\"\"
        执行技能
        
        Args:
            input_data: 输入数据
            options: 可选参数
            
        Returns:
            执行结果
        \"\"\"
        try:
            print(f"[{{self.name}}] Executing...")
            
            # TODO: Implement skill logic
            result = self.process(input_data, options or {{}})
            
            return {{
                'result': 'success',
                'data': result,
                'timestamp': datetime.now().isoformat()
            }}
        except Exception as e:
            print(f"[{{self.name}}] Error: {{e}}")
            return {{
                'result': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }}
    
    def process(self, input_data: Dict[str, Any], options: Dict[str, Any]) -> Any:
        \"\"\"处理逻辑\"\"\"
        # TODO: Implement processing logic
        return {{}}


def main():
    parser = argparse.ArgumentParser(description='{vars['skill_name_title']}')
    parser.add_argument('--input', '-i', type=str, help='Input JSON file')
    parser.add_argument('--output', '-o', type=str, help='Output JSON file')
    
    args = parser.parse_args()
    
    # 加载输入
    input_data = {{}}
    if args.input:
        with open(args.input, 'r') as f:
            input_data = json.load(f)
    
    # 执行
    skill = {vars['skill_name_camel']}()
    result = skill.execute(input_data)
    
    # 输出结果
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
"""
    
    def _generate_package_json(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成package.json"""
        return f"""{{
  "name": "{vars['skill_name']}",
  "version": "{vars['version']}",
  "description": "{vars['description']}",
  "main": "index.js",
  "scripts": {{
    "test": "echo \\"Error: no test specified\\" && exit 1"
  }},
  "keywords": [
    "skill",
    "openclaw"
  ],
  "author": "{vars['author']}",
  "license": "MIT",
  "dependencies": {{}},
  "devDependencies": {{}}
}}
"""
    
    def _generate_requirements_txt(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成requirements.txt"""
        base_requirements = """# Python dependencies for {skill_name}
# Add your dependencies below

# Example:
# requests>=2.28.0
# pydantic>=1.10.0
""".format(skill_name=vars['skill_name'])
        
        if template_type == 'ml':
            base_requirements += """
# Machine learning
# numpy>=1.24.0
# pandas>=1.5.0
# scikit-learn>=1.2.0
"""
        
        return base_requirements
    
    def _generate_readme_md(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成README.md"""
        return f"""# {vars['skill_name_title']}

{vars['description']}

## Installation

```bash
# Install dependencies
npm install  # for JavaScript skills
# or
pip install -r requirements.txt  # for Python skills
```

## Usage

```javascript
// JavaScript
const Skill = require('./index.js');
const skill = new Skill();
const result = await skill.execute(input);
```

```python
# Python
from index import {vars['skill_name_camel']}
skill = {vars['skill_name_camel']}()
result = skill.execute(input_data)
```

## Configuration

See `SKILL.md` for detailed configuration options.

## License

MIT
"""
    
    def _generate_config_yaml(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成config.yaml"""
        return f"""# Configuration for {vars['skill_name']}

skill:
  name: {vars['skill_name']}
  version: {vars['version']}
  
api:
  endpoint: ${{API_ENDPOINT}}
  timeout: 30000
  retries: 3

options:
  # Add configuration options here
  
logging:
  level: info
  format: json
"""
    
    def _generate_schedule_yaml(self, template_type: str, vars: Dict[str, str]) -> str:
        """生成schedule.yaml"""
        return f"""# Schedule configuration for {vars['skill_name']}

schedule:
  enabled: false
  cron: "0 2 * * *"  # Daily at 2 AM
  timezone: "Asia/Shanghai"
  
options:
  retry_on_failure: true
  max_retries: 3
  timeout: 300

notification:
  on_success: false
  on_failure: true
"""
    
    def _to_camel_case(self, name: str) -> str:
        """转换为驼峰命名"""
        parts = name.replace('-', '_').split('_')
        return ''.join(p.capitalize() for p in parts)
    
    def _verify_isc_compliance(self, skill_path: Path) -> bool:
        """验证ISC合规性"""
        # 检查必需文件
        for file_name in self.ISC_REQUIREMENTS['required_files']:
            if not (skill_path / file_name).exists():
                return False
        
        # 检查必需章节
        skill_md = skill_path / 'SKILL.md'
        if skill_md.exists():
            content = skill_md.read_text(encoding='utf-8').lower()
            for section in self.ISC_REQUIREMENTS['required_sections']:
                if section not in content:
                    return False
        
        return True
    
    def _check_isc_compliance(self, skill: Dict) -> Dict:
        """检查ISC合规性详细报告"""
        skill_path = Path(skill['skill_path'])
        
        report = {
            'skill_name': skill['skill_name'],
            'compliant': True,
            'missing_required_files': [],
            'missing_required_sections': [],
            'recommendations': []
        }
        
        # 检查必需文件
        for file_name in self.ISC_REQUIREMENTS['required_files']:
            if not (skill_path / file_name).exists():
                report['missing_required_files'].append(file_name)
                report['compliant'] = False
        
        # 检查推荐文件
        for file_name in self.ISC_REQUIREMENTS['recommended_files']:
            if not (skill_path / file_name).exists():
                report['recommendations'].append(f"建议添加文件: {file_name}")
        
        return report
    
    def _calculate_metrics(self) -> Dict:
        """计算创建指标"""
        created = self.creation_results['created_skills']
        failed = self.creation_results['failed_creations']
        
        return {
            'total_requests': len(self.creation_results['input_requests']),
            'created_count': len(created),
            'failed_count': len(failed),
            'success_rate': len(created) / max(len(created) + len(failed), 1),
            'isc_compliant_count': len([s for s in created if s.get('isc_compliant')]),
            'by_template': self._count_by_template(created)
        }
    
    def _count_by_template(self, skills: List[Dict]) -> Dict[str, int]:
        """按模板统计"""
        counts = {}
        for skill in skills:
            template = skill.get('template_type', 'unknown')
            counts[template] = counts.get(template, 0) + 1
        return counts
    
    def _determine_exit_status(self) -> str:
        """确定准出状态"""
        created = self.creation_results['created_skills']
        failed = self.creation_results['failed_creations']
        
        if not created and not failed:
            return 'no_requests'
        
        if failed and not created:
            return 'failed'
        
        if failed:
            return 'partial_success'
        
        return 'ready_for_next'
    
    def _publish_creation_event(self):
        """发布创建事件"""
        self.event_bus.publish('seef.creation.completed', {
            'timestamp': datetime.now().isoformat(),
            'created_count': self.creation_results['metrics'].get('created_count', 0),
            'failed_count': self.creation_results['metrics'].get('failed_count', 0),
            'success_rate': self.creation_results['metrics'].get('success_rate', 0)
        })
    
    def _get_traceback(self) -> str:
        """获取异常跟踪信息"""
        import traceback
        return traceback.format_exc()
    
    def _degraded_result(self) -> Dict[str, Any]:
        """降级结果"""
        return {
            'subskill': 'creator',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'degraded',
            'error': '执行过程中发生错误，返回降级结果',
            'partial_results': self.creation_results
        }


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='SEEF 技能创造器')
    parser.add_argument('--name', '-n', type=str, required=True, help='技能名称')
    parser.add_argument('--template', '-t', type=str, default='standard', 
                       choices=list(SkillCreator.TEMPLATES.keys()),
                       help='模板类型')
    parser.add_argument('--description', '-d', type=str, help='技能描述')
    parser.add_argument('--output', '-o', type=str, help='输出结果到文件')
    
    args = parser.parse_args()
    
    # 构建请求
    request = {
        'request_id': f"CLI_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        'skill_name': args.name,
        'template_type': args.template,
        'description': args.description or f'{args.name} skill'
    }
    
    # 运行创造器
    creator = SkillCreator()
    result = creator.run(requests=[request])
    
    # 输出结果
    output_json = json.dumps(result, ensure_ascii=False, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"\n💾 结果已保存: {args.output}")
    else:
        print("\n📊 创建结果:")
        print(output_json)
    
    return result['exit_status'] != 'failed'


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
