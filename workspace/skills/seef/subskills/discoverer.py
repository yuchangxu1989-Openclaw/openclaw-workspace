#!/usr/bin/env python3
"""
SEEF Subskill: Skill Discoverer v2.0
技能发现器 - 识别能力空白、冗余建设及潜在协同机会

功能特性：
- 扫描技能目录，分析能力覆盖
- 识别能力空白和冗余
- 检测潜在技能协同机会
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
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from collections import defaultdict
import subprocess

# DTO事件总线集成
class DTOEventBus:
    """DTO事件总线客户端"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or os.path.expanduser('~/.openclaw/workspace/skills/dto-core/config/event-bus.json')
        self.events = []
        self._connected = False
        
    def connect(self) -> bool:
        """连接到事件总线"""
        try:
            # 尝试连接到DTO事件总线
            config_file = Path(self.config_path)
            if config_file.exists():
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    self._connected = config.get('enabled', True)
            else:
                # 降级到内存事件模式
                self._connected = True
            return True
        except Exception as e:
            print(f"  ⚠️  事件总线连接失败: {e}，降级到本地模式")
            self._connected = True  # 本地模式仍可工作
            return True
    
    def publish(self, event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """发布事件到总线"""
        event = {
            'event_type': event_type,
            'data': data,
            'timestamp': datetime.now().isoformat(),
            'source': 'seef.discoverer'
        }
        self.events.append(event)
        
        # 尝试写入共享事件文件
        try:
            events_dir = Path(OPENCLAW_HOME) / 'workspace/skills/seef/events'
            events_dir.mkdir(parents=True, exist_ok=True)
            
            event_file = events_dir / f"{event_type}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.json"
            with open(event_file, 'w') as f:
                json.dump(event, f, ensure_ascii=False, indent=2)
        except Exception:
            pass  # 降级：不写入文件
            
        return event
    
    def subscribe(self, event_type: str, handler: callable):
        """订阅事件（预留接口）"""
        pass


@dataclass
class SkillCapability:
    """技能能力定义"""
    skill_name: str
    capabilities: List[str]
    inputs: List[str]
    outputs: List[str]
    triggers: List[str]
    complexity: int
    last_modified: str


@dataclass
class CapabilityGap:
    """能力空白"""
    gap_id: str
    description: str
    severity: str  # critical, high, medium, low
    suggested_skills: List[str]
    estimated_effort: str


@dataclass
class RedundancyFinding:
    """冗余发现"""
    redundancy_id: str
    skills_involved: List[str]
    overlap_area: str
    recommendation: str
    consolidation_potential: str


@dataclass
class SynergyOpportunity:
    """协同机会"""
    synergy_id: str
    skills: List[str]
    synergy_type: str
    description: str
    value_estimate: str


class SkillDiscoverer:
    """
    技能发现器 - 核心实现类
    """
    
    VERSION = "2.0.0"
    
    # 必需文件列表
    REQUIRED_FILES = ['SKILL.md']
    OPTIONAL_FILES = ['README.md', 'index.js', 'index.py', 'package.json', 'requirements.txt']
    
    # 能力触发词映射
    CAPABILITY_TRIGGERS = {
        'vision': ['图像', '图片', '识别', 'OCR', '视觉', '检测', '分类'],
        'audio': ['音频', '语音', 'ASR', 'TTS', '声音', '录音'],
        'text': ['文本', '写作', '生成', '总结', '翻译', 'NLP'],
        'code': ['代码', '编程', '重构', '生成', '分析', '审查'],
        'data': ['数据', '分析', '处理', '转换', '清洗', 'ETL'],
        'automation': ['自动化', '定时', '触发', '调度', '流程'],
        'integration': ['集成', '连接', '同步', 'API', 'Webhook'],
        'memory': ['记忆', '存储', '检索', '知识', '历史']
    }
    
    def __init__(self, event_bus: Optional[DTOEventBus] = None):
        self.event_bus = event_bus or DTOEventBus()
        self.event_bus.connect()
        
        self.skills_base_path = Path(SKILLS_PATH)
        self.discovery_results = {
            'subskill': 'discoverer',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'ready_for_next',
            'capabilities': [],
            'gaps': [],
            'redundancies': [],
            'synergies': [],
            'metrics': {},
            'errors': []
        }
        
    def run(self, skill_path: Optional[str] = None, context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        运行技能发现流程
        
        Args:
            skill_path: 特定技能路径（可选，默认扫描所有）
            context: 执行上下文，包含CRAS报告等
            
        Returns:
            发现结果
        """
        print(f"\n🔍 开始技能发现扫描...")
        print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   目标: {'全部技能' if skill_path is None else skill_path}")
        
        try:
            # 1. 扫描技能目录
            skills = self._scan_skills(skill_path)
            print(f"   发现 {len(skills)} 个技能")
            
            # 2. 提取能力矩阵
            capabilities = self._extract_capabilities(skills)
            self.discovery_results['capabilities'] = [asdict(c) for c in capabilities]
            print(f"   提取 {len(capabilities)} 个能力定义")
            
            # 3. 识别能力空白
            gaps = self._identify_capability_gaps(capabilities, context)
            self.discovery_results['gaps'] = [asdict(g) for g in gaps]
            print(f"   识别 {len(gaps)} 个能力空白")
            
            # 4. 检测冗余
            redundancies = self._detect_redundancies(capabilities)
            self.discovery_results['redundancies'] = [asdict(r) for r in redundancies]
            print(f"   检测 {len(redundancies)} 个冗余")
            
            # 5. 发现协同机会
            synergies = self._find_synergies(capabilities)
            self.discovery_results['synergies'] = [asdict(s) for s in synergies]
            print(f"   发现 {len(synergies)} 个协同机会")
            
            # 6. 计算指标
            metrics = self._calculate_metrics(skills, capabilities, gaps, redundancies)
            self.discovery_results['metrics'] = metrics
            
            # 7. 确定准出状态
            exit_status = self._determine_exit_status(gaps, redundancies)
            self.discovery_results['exit_status'] = exit_status
            
            # 8. 发布发现事件
            self._publish_discovery_event()
            
            print(f"   ✓ 发现扫描完成，状态: {exit_status}")
            
        except Exception as e:
            error_msg = f"发现过程出错: {str(e)}"
            self.discovery_results['errors'].append(error_msg)
            self.discovery_results['exit_status'] = 'failed'
            print(f"   ✗ {error_msg}")
            
            # 发布错误事件
            self.event_bus.publish('seef.discoverer.error', {
                'error': error_msg,
                'traceback': self._get_traceback()
            })
            
            # 降级：返回部分结果
            return self._degraded_result()
        
        return self.discovery_results
    
    def _scan_skills(self, target_path: Optional[str] = None) -> List[Dict[str, Any]]:
        """扫描技能目录"""
        skills = []
        
        if target_path:
            skill_dirs = [Path(target_path)]
        else:
            skill_dirs = [d for d in self.skills_base_path.iterdir() if d.is_dir()]
        
        for skill_dir in skill_dirs:
            try:
                skill_info = self._analyze_skill(skill_dir)
                if skill_info:
                    skills.append(skill_info)
            except Exception as e:
                self.discovery_results['errors'].append(f"扫描技能 {skill_dir.name} 失败: {e}")
                continue
        
        return skills
    
    def _analyze_skill(self, skill_dir: Path) -> Optional[Dict[str, Any]]:
        """分析单个技能"""
        if not (skill_dir / 'SKILL.md').exists():
            return None
        
        skill_info = {
            'name': skill_dir.name,
            'path': str(skill_dir),
            'files': [],
            'has_readme': (skill_dir / 'README.md').exists(),
            'has_index': (skill_dir / 'index.js').exists() or (skill_dir / 'index.py').exists(),
            'last_modified': datetime.fromtimestamp(skill_dir.stat().st_mtime).isoformat(),
            'size_kb': self._calculate_dir_size(skill_dir)
        }
        
        # 收集文件信息
        for f in self.REQUIRED_FILES + self.OPTIONAL_FILES:
            file_path = skill_dir / f
            if file_path.exists():
                skill_info['files'].append({
                    'name': f,
                    'size': file_path.stat().st_size,
                    'modified': datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                })
        
        # 读取SKILL.md内容
        try:
            with open(skill_dir / 'SKILL.md', 'r', encoding='utf-8') as f:
                skill_info['skill_md_content'] = f.read()
        except Exception:
            skill_info['skill_md_content'] = ''
        
        return skill_info
    
    def _calculate_dir_size(self, path: Path) -> int:
        """计算目录大小"""
        total = 0
        try:
            for entry in path.rglob('*'):
                if entry.is_file():
                    total += entry.stat().st_size
        except Exception:
            pass
        return total // 1024  # KB
    
    def _extract_capabilities(self, skills: List[Dict]) -> List[SkillCapability]:
        """提取能力矩阵"""
        capabilities = []
        
        for skill in skills:
            try:
                cap = self._parse_skill_capabilities(skill)
                capabilities.append(cap)
            except Exception as e:
                self.discovery_results['errors'].append(f"解析技能 {skill['name']} 能力失败: {e}")
                continue
        
        return capabilities
    
    def _parse_skill_capabilities(self, skill: Dict) -> SkillCapability:
        """解析单个技能的能力"""
        content = skill.get('skill_md_content', '').lower()
        name = skill['name']
        
        # 提取能力标签
        caps = []
        for cap_type, triggers in self.CAPABILITY_TRIGGERS.items():
            for trigger in triggers:
                if trigger in content or trigger in name.lower():
                    caps.append(cap_type)
                    break
        
        # 提取输入输出
        inputs = self._extract_io_patterns(content, 'input')
        outputs = self._extract_io_patterns(content, 'output')
        
        # 提取触发器
        triggers = self._extract_triggers(content)
        
        # 计算复杂度
        complexity = self._calculate_complexity(skill)
        
        return SkillCapability(
            skill_name=name,
            capabilities=list(set(caps)),
            inputs=inputs,
            outputs=outputs,
            triggers=triggers,
            complexity=complexity,
            last_modified=skill.get('last_modified', datetime.now().isoformat())
        )
    
    def _extract_io_patterns(self, content: str, io_type: str) -> List[str]:
        """提取输入输出模式"""
        patterns = []
        
        # 查找输入/输出声明
        io_keywords = {
            'input': ['输入', 'input', '接收', 'accept', '参数', 'parameter'],
            'output': ['输出', 'output', '返回', 'return', '结果', 'result']
        }
        
        keywords = io_keywords.get(io_type, [])
        for keyword in keywords:
            matches = re.findall(rf'{keyword}[:：]\s*(.+?)(?:\n|$)', content, re.IGNORECASE)
            for match in matches:
                patterns.extend([p.strip() for p in match.split(',')])
        
        return list(set(patterns))[:10]  # 限制数量
    
    def _extract_triggers(self, content: str) -> List[str]:
        """提取触发器"""
        triggers = []
        trigger_patterns = ['触发', 'trigger', '定时', 'cron', '事件', 'event', 'Webhook', 'HTTP']
        
        for pattern in trigger_patterns:
            if pattern.lower() in content.lower():
                triggers.append(pattern)
        
        return triggers
    
    def _calculate_complexity(self, skill: Dict) -> int:
        """计算技能复杂度评分 (1-10)"""
        score = 1
        
        # 文件数量
        score += min(len(skill.get('files', [])), 3)
        
        # 代码规模
        size_kb = skill.get('size_kb', 0)
        if size_kb > 1000:
            score += 3
        elif size_kb > 500:
            score += 2
        elif size_kb > 100:
            score += 1
        
        # 内容长度
        content_length = len(skill.get('skill_md_content', ''))
        if content_length > 5000:
            score += 2
        elif content_length > 2000:
            score += 1
        
        return min(score, 10)
    
    def _identify_capability_gaps(self, capabilities: List[SkillCapability], 
                                   context: Optional[Dict]) -> List[CapabilityGap]:
        """识别能力空白"""
        gaps = []
        
        # 获取现有能力集合
        existing_caps = set()
        for cap in capabilities:
            existing_caps.update(cap.capabilities)
        
        # 检查标准能力集合
        standard_caps = set(self.CAPABILITY_TRIGGERS.keys())
        missing_caps = standard_caps - existing_caps
        
        # 生成能力空白报告
        for i, missing in enumerate(missing_caps):
            gap = CapabilityGap(
                gap_id=f"GAP_{datetime.now().strftime('%Y%m%d')}_{i:03d}",
                description=f"缺少 {missing} 类型能力",
                severity='high' if missing in ['vision', 'text', 'automation'] else 'medium',
                suggested_skills=self._suggest_skills_for_gap(missing),
                estimated_effort='2-3天'
            )
            gaps.append(gap)
        
        # 基于CRAS报告识别需求空白
        if context and 'cras_report' in context:
            cras_gaps = self._analyze_cras_gaps(context['cras_report'], capabilities)
            gaps.extend(cras_gaps)
        
        return gaps
    
    def _suggest_skills_for_gap(self, cap_type: str) -> List[str]:
        """为能力空白建议技能"""
        suggestions = {
            'vision': ['图像识别器', 'OCR处理器', '视觉分析器'],
            'audio': ['语音识别器', '语音合成器', '音频处理器'],
            'text': ['文本生成器', '摘要提取器', '翻译器'],
            'code': ['代码审查器', '代码生成器', '重构助手'],
            'data': ['数据清洗器', 'ETL处理器', '数据转换器'],
            'automation': ['定时任务器', '工作流引擎', '触发器管理'],
            'integration': ['API连接器', 'Webhook处理器', '同步器'],
            'memory': ['记忆管理器', '知识检索器', '历史记录器']
        }
        return suggestions.get(cap_type, [f'{cap_type}-skill'])
    
    def _analyze_cras_gaps(self, cras_report: Dict, 
                           capabilities: List[SkillCapability]) -> List[CapabilityGap]:
        """分析CRAS报告识别需求空白"""
        gaps = []
        
        # 提取用户痛点
        pain_points = cras_report.get('pain_points', [])
        
        for i, pain in enumerate(pain_points):
            gap = CapabilityGap(
                gap_id=f"CRAS_GAP_{datetime.now().strftime('%Y%m%d')}_{i:03d}",
                description=f"用户需求: {pain}",
                severity='critical',
                suggested_skills=['待分析'],
                estimated_effort='待评估'
            )
            gaps.append(gap)
        
        return gaps
    
    def _detect_redundancies(self, capabilities: List[SkillCapability]) -> List[RedundancyFinding]:
        """检测能力冗余"""
        redundancies = []
        
        # 按能力类型分组
        cap_groups = defaultdict(list)
        for cap in capabilities:
            for cap_type in cap.capabilities:
                cap_groups[cap_type].append(cap)
        
        # 检测同一能力类型的多个技能
        for cap_type, skills in cap_groups.items():
            if len(skills) > 2:
                redundancy = RedundancyFinding(
                    redundancy_id=f"RED_{cap_type}_{datetime.now().strftime('%Y%m%d')}",
                    skills_involved=[s.skill_name for s in skills],
                    overlap_area=cap_type,
                    recommendation=f"考虑整合 {cap_type} 相关技能",
                    consolidation_potential='high' if len(skills) > 3 else 'medium'
                )
                redundancies.append(redundancy)
        
        # 检测相似触发器
        trigger_groups = defaultdict(list)
        for cap in capabilities:
            for trigger in cap.triggers:
                trigger_groups[trigger].append(cap)
        
        for trigger, skills in trigger_groups.items():
            if len(skills) > 2:
                redundancy = RedundancyFinding(
                    redundancy_id=f"RED_TRIG_{trigger}_{datetime.now().strftime('%Y%m%d')}",
                    skills_involved=[s.skill_name for s in skills],
                    overlap_area=f"触发器: {trigger}",
                    recommendation=f"考虑统一 {trigger} 触发处理",
                    consolidation_potential='medium'
                )
                redundancies.append(redundancy)
        
        return redundancies
    
    def _find_synergies(self, capabilities: List[SkillCapability]) -> List[SynergyOpportunity]:
        """发现协同机会"""
        synergies = []
        synergy_id = 0
        
        # 检测输入-输出匹配
        for i, cap1 in enumerate(capabilities):
            for cap2 in capabilities[i+1:]:
                # 检查输出-输入匹配
                matching_io = set(cap1.outputs) & set(cap2.inputs)
                if matching_io:
                    synergy = SynergyOpportunity(
                        synergy_id=f"SYN_{synergy_id:03d}",
                        skills=[cap1.skill_name, cap2.skill_name],
                        synergy_type='pipeline',
                        description=f"{cap1.skill_name} 的输出可作为 {cap2.skill_name} 的输入",
                        value_estimate='高 - 形成处理能力链'
                    )
                    synergies.append(synergy)
                    synergy_id += 1
                
                # 检查互补能力
                complementary = self._check_complementary(cap1, cap2)
                if complementary:
                    synergy = SynergyOpportunity(
                        synergy_id=f"SYN_{synergy_id:03d}",
                        skills=[cap1.skill_name, cap2.skill_name],
                        synergy_type='complementary',
                        description=complementary,
                        value_estimate='中 - 能力互补'
                    )
                    synergies.append(synergy)
                    synergy_id += 1
        
        return synergies
    
    def _check_complementary(self, cap1: SkillCapability, cap2: SkillCapability) -> Optional[str]:
        """检查技能是否互补"""
        # 定义互补能力对
        complementary_pairs = [
            ('vision', 'text'),
            ('audio', 'text'),
            ('data', 'visualization'),
            ('automation', 'integration')
        ]
        
        for type1, type2 in complementary_pairs:
            if type1 in cap1.capabilities and type2 in cap2.capabilities:
                return f"{type1} + {type2} 能力互补"
            if type2 in cap1.capabilities and type1 in cap2.capabilities:
                return f"{type2} + {type1} 能力互补"
        
        return None
    
    def _calculate_metrics(self, skills: List[Dict], capabilities: List[SkillCapability],
                          gaps: List[CapabilityGap], redundancies: List[RedundancyFinding]) -> Dict:
        """计算发现指标"""
        return {
            'total_skills': len(skills),
            'total_capabilities': sum(len(c.capabilities) for c in capabilities),
            'avg_complexity': sum(c.complexity for c in capabilities) / max(len(capabilities), 1),
            'critical_gaps': len([g for g in gaps if g.severity == 'critical']),
            'high_gaps': len([g for g in gaps if g.severity == 'high']),
            'total_redundancies': len(redundancies),
            'high_consolidation_potential': len([r for r in redundancies if r.consolidation_potential == 'high']),
            'coverage_score': self._calculate_coverage_score(capabilities, gaps)
        }
    
    def _calculate_coverage_score(self, capabilities: List[SkillCapability], 
                                   gaps: List[CapabilityGap]) -> float:
        """计算能力覆盖评分"""
        existing_caps = set()
        for cap in capabilities:
            existing_caps.update(cap.capabilities)
        
        standard_caps = set(self.CAPABILITY_TRIGGERS.keys())
        
        if not standard_caps:
            return 1.0
        
        coverage = len(existing_caps & standard_caps) / len(standard_caps)
        return round(coverage, 2)
    
    def _determine_exit_status(self, gaps: List[CapabilityGap], 
                                redundancies: List[RedundancyFinding]) -> str:
        """确定准出状态"""
        critical_gaps = [g for g in gaps if g.severity == 'critical']
        high_gaps = [g for g in gaps if g.severity == 'high']
        
        if critical_gaps:
            return 'critical_gaps_found'
        elif high_gaps or len(redundancies) > 3:
            return 'optimization_needed'
        else:
            return 'ready_for_next'
    
    def _publish_discovery_event(self):
        """发布发现事件"""
        self.event_bus.publish('seef.discovery.completed', {
            'timestamp': datetime.now().isoformat(),
            'total_skills': self.discovery_results['metrics'].get('total_skills', 0),
            'gaps_count': len(self.discovery_results['gaps']),
            'redundancies_count': len(self.discovery_results['redundancies']),
            'synergies_count': len(self.discovery_results['synergies']),
            'coverage_score': self.discovery_results['metrics'].get('coverage_score', 0)
        })
    
    def _get_traceback(self) -> str:
        """获取异常跟踪信息"""
        import traceback
        return traceback.format_exc()
    
    def _degraded_result(self) -> Dict[str, Any]:
        """降级结果"""
        return {
            'subskill': 'discoverer',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'degraded',
            'error': '执行过程中发生错误，返回降级结果',
            'partial_results': self.discovery_results
        }


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='SEEF 技能发现器')
    parser.add_argument('skill_path', nargs='?', default=None, help='技能路径（可选）')
    parser.add_argument('--context', '-c', type=str, help='上下文JSON文件路径')
    parser.add_argument('--output', '-o', type=str, help='输出结果到文件')
    
    args = parser.parse_args()
    
    # 加载上下文
    context = None
    if args.context:
        with open(args.context, 'r') as f:
            context = json.load(f)
    
    # 运行发现器
    discoverer = SkillDiscoverer()
    result = discoverer.run(args.skill_path, context)
    
    # 输出结果
    output_json = json.dumps(result, ensure_ascii=False, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"\n💾 结果已保存: {args.output}")
    else:
        print("\n📊 发现结果:")
        print(output_json)
    
    return result['exit_status'] == 'ready_for_next' or result['exit_status'] == 'optimization_needed'


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
