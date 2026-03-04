#!/usr/bin/env python3
"""
SEEF Subskill: Skill Optimizer v2.0
技能优化器 - 自动生成安全、可逆、低风险的修复方案

功能特性：
- 分析评估结果和发现结果
- 生成优化方案（修复、重构、整合）
- 安全策略评估（影响范围、回滚方案）
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
from enum import Enum
import hashlib
import copy

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
            'source': 'seef.optimizer'
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


class OptimizationType(Enum):
    """优化类型"""
    FIX = "fix"                    # 修复
    REFACTOR = "refactor"          # 重构
    CONSOLIDATE = "consolidate"    # 整合
    DEPRECATE = "deprecate"        # 弃用
    ENHANCE = "enhance"            # 增强


class RiskLevel(Enum):
    """风险等级"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class OptimizationPlan:
    """优化计划"""
    plan_id: str
    plan_type: str
    target_skill: str
    description: str
    changes: List[Dict[str, Any]]
    risk_level: str
    impact_analysis: Dict[str, Any]
    rollback_plan: Dict[str, Any]
    estimated_time: str
    prerequisites: List[str]
    expected_outcome: Dict[str, Any]


@dataclass
class SafetyReport:
    """安全评估报告"""
    report_id: str
    plan_id: str
    safety_score: float  # 0-100
    risk_factors: List[Dict[str, Any]]
    mitigation_strategies: List[str]
    approval_required: bool
    auto_approvable: bool


class SkillOptimizer:
    """
    技能优化器 - 核心实现类
    """
    
    VERSION = "2.0.0"
    
    # 备份目录
    BACKUP_DIR = Path(SKILLS_PATH) / 'seef/backups'
    
    # 变更模板
    CHANGE_TEMPLATES = {
        'fix_doc': {
            'description': '修复文档结构',
            'action': 'update_file',
            'safe': True
        },
        'add_file': {
            'description': '添加缺失文件',
            'action': 'create_file',
            'safe': True
        },
        'merge_skills': {
            'description': '合并技能',
            'action': 'merge_directory',
            'safe': False
        },
        'update_deps': {
            'description': '更新依赖',
            'action': 'modify_json',
            'safe': True
        },
        'refactor_code': {
            'description': '重构代码',
            'action': 'replace_content',
            'safe': False
        }
    }
    
    def __init__(self, event_bus: Optional[DTOEventBus] = None):
        self.event_bus = event_bus or DTOEventBus()
        self.event_bus.connect()
        
        self.skills_base_path = Path(SKILLS_PATH)
        self.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        
        self.optimization_results = {
            'subskill': 'optimizer',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'ready_for_next',
            'input_summary': {},
            'optimization_plans': [],
            'safety_reports': [],
            'execution_queue': [],
            'metrics': {},
            'errors': []
        }
        
    def run(self, skill_path: Optional[str] = None, 
            evaluator_results: Optional[Dict] = None,
            discoverer_results: Optional[Dict] = None,
            context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        运行优化流程
        
        Args:
            skill_path: 特定技能路径（可选）
            evaluator_results: 评估器结果
            discoverer_results: 发现器结果
            context: 执行上下文
            
        Returns:
            优化结果
        """
        print(f"\n🔧 开始技能优化分析...")
        print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        try:
            # 1. 验证输入
            if not self._validate_inputs(evaluator_results, discoverer_results):
                self.optimization_results['exit_status'] = 'insufficient_input'
                return self.optimization_results
            
            # 2. 记录输入摘要
            self._record_input_summary(evaluator_results, discoverer_results)
            
            # 3. 分析评估结果生成修复计划
            if evaluator_results:
                fix_plans = self._generate_fix_plans(evaluator_results, skill_path)
                self.optimization_results['optimization_plans'].extend(fix_plans)
                print(f"   生成 {len(fix_plans)} 个修复计划")
            
            # 4. 分析发现结果生成优化计划
            if discoverer_results:
                improve_plans = self._generate_improvement_plans(discoverer_results)
                self.optimization_results['optimization_plans'].extend(improve_plans)
                print(f"   生成 {len(improve_plans)} 个改进计划")
                
                # 生成整合计划
                consolidate_plans = self._generate_consolidation_plans(discoverer_results)
                self.optimization_results['optimization_plans'].extend(consolidate_plans)
                print(f"   生成 {len(consolidate_plans)} 个整合计划")
            
            # 5. 安全评估
            for plan in self.optimization_results['optimization_plans']:
                safety_report = self._assess_safety(plan)
                self.optimization_results['safety_reports'].append(asdict(safety_report))
            
            print(f"   完成 {len(self.optimization_results['safety_reports'])} 个安全评估")
            
            # 6. 生成执行队列（按风险排序）
            execution_queue = self._build_execution_queue()
            self.optimization_results['execution_queue'] = execution_queue
            print(f"   构建执行队列: {len(execution_queue)} 个任务")
            
            # 7. 计算指标
            metrics = self._calculate_metrics()
            self.optimization_results['metrics'] = metrics
            
            # 8. 确定准出状态
            exit_status = self._determine_exit_status()
            self.optimization_results['exit_status'] = exit_status
            
            # 9. 发布优化事件
            self._publish_optimization_event()
            
            print(f"   ✓ 优化分析完成，状态: {exit_status}")
            
        except Exception as e:
            error_msg = f"优化过程出错: {str(e)}"
            self.optimization_results['errors'].append(error_msg)
            self.optimization_results['exit_status'] = 'failed'
            print(f"   ✗ {error_msg}")
            
            self.event_bus.publish('seef.optimizer.error', {
                'error': error_msg,
                'traceback': self._get_traceback()
            })
            
            return self._degraded_result()
        
        return self.optimization_results
    
    def _validate_inputs(self, evaluator_results: Optional[Dict], 
                         discoverer_results: Optional[Dict]) -> bool:
        """验证输入数据"""
        has_valid_input = False
        
        if evaluator_results and isinstance(evaluator_results, dict):
            if 'metrics' in evaluator_results or 'findings' in evaluator_results:
                has_valid_input = True
        
        if discoverer_results and isinstance(discoverer_results, dict):
            if 'gaps' in discoverer_results or 'redundancies' in discoverer_results:
                has_valid_input = True
        
        if not has_valid_input:
            print("   ⚠️  缺少有效输入数据，至少需要评估器或发现器结果")
        
        return has_valid_input
    
    def _record_input_summary(self, evaluator_results: Optional[Dict],
                              discoverer_results: Optional[Dict]):
        """记录输入摘要"""
        summary = {
            'has_evaluator_results': evaluator_results is not None,
            'has_discoverer_results': discoverer_results is not None
        }
        
        if evaluator_results:
            summary['evaluator_findings'] = len(evaluator_results.get('findings', []))
            summary['evaluator_metrics'] = list(evaluator_results.get('metrics', {}).keys())
        
        if discoverer_results:
            summary['gaps_count'] = len(discoverer_results.get('gaps', []))
            summary['redundancies_count'] = len(discoverer_results.get('redundancies', []))
            summary['synergies_count'] = len(discoverer_results.get('synergies', []))
        
        self.optimization_results['input_summary'] = summary
    
    def _generate_fix_plans(self, evaluator_results: Dict, 
                           skill_path: Optional[str]) -> List[Dict]:
        """生成修复计划"""
        plans = []
        findings = evaluator_results.get('findings', [])
        
        for i, finding in enumerate(findings):
            plan = self._finding_to_plan(finding, skill_path, i)
            if plan:
                plans.append(asdict(plan))
        
        return plans
    
    def _finding_to_plan(self, finding: Dict, skill_path: Optional[str], 
                         index: int) -> Optional[OptimizationPlan]:
        """将发现转换为优化计划"""
        level = finding.get('level', 'warning')
        ftype = finding.get('type', 'unknown')
        
        # 只处理error和warning级别
        if level not in ['error', 'warning']:
            return None
        
        plan_id = f"FIX_{datetime.now().strftime('%Y%m%d')}_{index:03d}"
        
        # 根据发现类型生成计划
        if ftype == 'missing_file':
            return self._create_missing_file_plan(finding, plan_id, skill_path)
        elif ftype == 'missing_section':
            return self._create_doc_fix_plan(finding, plan_id, skill_path)
        elif ftype == 'integrity_error':
            return self._create_integrity_fix_plan(finding, plan_id, skill_path)
        else:
            return self._create_generic_fix_plan(finding, plan_id, skill_path)
    
    def _create_missing_file_plan(self, finding: Dict, plan_id: str,
                                   skill_path: Optional[str]) -> OptimizationPlan:
        """创建缺失文件修复计划"""
        file_name = finding.get('file', 'unknown')
        target_skill = skill_path or finding.get('skill', 'unknown')
        
        changes = [{
            'type': 'add_file',
            'target': f"{target_skill}/{file_name}",
            'template': self._get_file_template(file_name),
            'safe': True
        }]
        
        return OptimizationPlan(
            plan_id=plan_id,
            plan_type=OptimizationType.FIX.value,
            target_skill=target_skill,
            description=f"添加缺失文件: {file_name}",
            changes=changes,
            risk_level=RiskLevel.LOW.value,
            impact_analysis={
                'affected_files': [file_name],
                'affected_skills': [target_skill],
                'user_impact': 'none'
            },
            rollback_plan={
                'action': 'delete_file',
                'files': [file_name]
            },
            estimated_time='5分钟',
            prerequisites=[],
            expected_outcome={
                'fixes_finding': finding.get('message', ''),
                'improves_score': 0.1
            }
        )
    
    def _create_doc_fix_plan(self, finding: Dict, plan_id: str,
                              skill_path: Optional[str]) -> OptimizationPlan:
        """创建文档修复计划"""
        section = finding.get('section', 'unknown')
        target_skill = skill_path or finding.get('skill', 'unknown')
        
        changes = [{
            'type': 'update_file',
            'target': f"{target_skill}/SKILL.md",
            'action': 'add_section',
            'section': section,
            'template': self._get_section_template(section),
            'safe': True
        }]
        
        return OptimizationPlan(
            plan_id=plan_id,
            plan_type=OptimizationType.FIX.value,
            target_skill=target_skill,
            description=f"添加缺失文档章节: {section}",
            changes=changes,
            risk_level=RiskLevel.LOW.value,
            impact_analysis={
                'affected_files': ['SKILL.md'],
                'affected_skills': [target_skill],
                'user_impact': 'low'
            },
            rollback_plan={
                'action': 'restore_backup',
                'backup_id': plan_id
            },
            estimated_time='10分钟',
            prerequisites=[],
            expected_outcome={
                'fixes_finding': finding.get('message', ''),
                'improves_score': 0.05
            }
        )
    
    def _create_integrity_fix_plan(self, finding: Dict, plan_id: str,
                                    skill_path: Optional[str]) -> OptimizationPlan:
        """创建完整性修复计划"""
        target_skill = skill_path or finding.get('skill', 'unknown')
        
        return OptimizationPlan(
            plan_id=plan_id,
            plan_type=OptimizationType.FIX.value,
            target_skill=target_skill,
            description=f"修复文件完整性问题",
            changes=[],
            risk_level=RiskLevel.MEDIUM.value,
            impact_analysis={
                'affected_files': ['multiple'],
                'affected_skills': [target_skill],
                'user_impact': 'medium'
            },
            rollback_plan={
                'action': 'restore_backup',
                'backup_id': plan_id
            },
            estimated_time='30分钟',
            prerequisites=['backup_created'],
            expected_outcome={
                'fixes_finding': finding.get('message', ''),
                'improves_score': 0.2
            }
        )
    
    def _create_generic_fix_plan(self, finding: Dict, plan_id: str,
                                  skill_path: Optional[str]) -> OptimizationPlan:
        """创建通用修复计划"""
        target_skill = skill_path or finding.get('skill', 'unknown')
        
        return OptimizationPlan(
            plan_id=plan_id,
            plan_type=OptimizationType.FIX.value,
            target_skill=target_skill,
            description=f"修复: {finding.get('message', 'Unknown issue')}",
            changes=[],
            risk_level=RiskLevel.LOW.value,
            impact_analysis={
                'affected_files': [],
                'affected_skills': [target_skill],
                'user_impact': 'low'
            },
            rollback_plan={
                'action': 'manual_review'
            },
            estimated_time='15分钟',
            prerequisites=[],
            expected_outcome={
                'fixes_finding': finding.get('message', '')
            }
        )
    
    def _generate_improvement_plans(self, discoverer_results: Dict) -> List[Dict]:
        """生成改进计划"""
        plans = []
        gaps = discoverer_results.get('gaps', [])
        
        for i, gap in enumerate(gaps):
            plan = self._gap_to_plan(gap, i)
            if plan:
                plans.append(asdict(plan))
        
        return plans
    
    def _gap_to_plan(self, gap: Dict, index: int) -> Optional[OptimizationPlan]:
        """将能力空白转换为计划"""
        severity = gap.get('severity', 'medium')
        gap_id = gap.get('gap_id', f'GAP_{index}')
        
        plan_id = f"ENH_{gap_id}_{datetime.now().strftime('%Y%m%d')}"
        
        # 根据严重度确定风险等级
        risk_map = {
            'critical': RiskLevel.HIGH,
            'high': RiskLevel.MEDIUM,
            'medium': RiskLevel.LOW,
            'low': RiskLevel.LOW
        }
        
        return OptimizationPlan(
            plan_id=plan_id,
            plan_type=OptimizationType.ENHANCE.value,
            target_skill='new_skill',
            description=f"填补能力空白: {gap.get('description', 'Unknown')}",
            changes=[{
                'type': 'create_skill',
                'suggested_names': gap.get('suggested_skills', []),
                'template': 'standard'
            }],
            risk_level=risk_map.get(severity, RiskLevel.MEDIUM).value,
            impact_analysis={
                'affected_files': ['new'],
                'affected_skills': ['new'],
                'user_impact': 'positive'
            },
            rollback_plan={
                'action': 'delete_skill',
                'note': '新技能可直接删除'
            },
            estimated_time=gap.get('estimated_effort', '3天'),
            prerequisites=['creator_subskill'],
            expected_outcome={
                'fills_gap': gap_id,
                'coverage_improvement': 0.1
            }
        )
    
    def _generate_consolidation_plans(self, discoverer_results: Dict) -> List[Dict]:
        """生成整合计划"""
        plans = []
        redundancies = discoverer_results.get('redundancies', [])
        
        for i, redundancy in enumerate(redundancies):
            plan = self._redundancy_to_plan(redundancy, i)
            if plan:
                plans.append(asdict(plan))
        
        return plans
    
    def _redundancy_to_plan(self, redundancy: Dict, index: int) -> Optional[OptimizationPlan]:
        """将冗余转换为整合计划"""
        potential = redundancy.get('consolidation_potential', 'low')
        
        # 只处理高潜力整合
        if potential != 'high':
            return None
        
        skills = redundancy.get('skills_involved', [])
        if len(skills) < 2:
            return None
        
        plan_id = f"CON_{datetime.now().strftime('%Y%m%d')}_{index:03d}"
        
        return OptimizationPlan(
            plan_id=plan_id,
            plan_type=OptimizationType.CONSOLIDATE.value,
            target_skill=skills[0],
            description=f"整合 {len(skills)} 个冗余技能",
            changes=[{
                'type': 'merge_skills',
                'source_skills': skills[1:],
                'target_skill': skills[0],
                'migration_strategy': 'gradual'
            }],
            risk_level=RiskLevel.HIGH.value,
            impact_analysis={
                'affected_files': [f'{s}/*' for s in skills],
                'affected_skills': skills,
                'user_impact': 'high',
                'breaking_changes': True
            },
            rollback_plan={
                'action': 'restore_all_backups',
                'backup_strategy': 'full_snapshot'
            },
            estimated_time='1-2周',
            prerequisites=['validator_subskill', 'manual_approval'],
            expected_outcome={
                'reduced_redundancy': redundancy.get('redundancy_id', ''),
                'maintenance_reduction': f'{len(skills)-1}个技能'
            }
        )
    
    def _assess_safety(self, plan) -> SafetyReport:
        """评估计划安全性"""
        risk_score = 0
        risk_factors = []
        
        # 处理字典或对象
        if isinstance(plan, dict):
            plan_risk_level = plan.get('risk_level', 'medium')
            plan_changes = plan.get('changes', [])
            plan_impact = plan.get('impact_analysis', {})
            plan_id = plan.get('plan_id', 'unknown')
        else:
            plan_risk_level = plan.risk_level
            plan_changes = plan.changes
            plan_impact = plan.impact_analysis
            plan_id = plan.plan_id
        
        # 基于风险等级评分
        risk_weights = {
            RiskLevel.LOW.value: 10,
            RiskLevel.MEDIUM.value: 30,
            RiskLevel.HIGH.value: 60,
            RiskLevel.CRITICAL.value: 90
        }
        
        base_risk = risk_weights.get(plan_risk_level, 30)
        risk_score += base_risk
        
        # 分析变更风险
        for change in plan_changes:
            if isinstance(change, dict):
                change_type = change.get('type', 'unknown')
                is_safe = change.get('safe', False)
            else:
                change_type = getattr(change, 'type', 'unknown')
                is_safe = getattr(change, 'safe', False)
            
            if change_type in ['merge_skills', 'delete_skill']:
                risk_factors.append({
                    'factor': 'destructive_operation',
                    'description': f'破坏性操作: {change_type}',
                    'severity': 'high'
                })
                risk_score += 20
            elif change_type == 'update_file':
                risk_factors.append({
                    'factor': 'file_modification',
                    'description': '文件修改操作',
                    'severity': 'low'
                })
                risk_score += 5
        
        # 评估影响范围
        if isinstance(plan_impact, dict):
            affected_count = len(plan_impact.get('affected_skills', []))
            user_impact = plan_impact.get('user_impact', 'none')
            breaking_changes = plan_impact.get('breaking_changes', False)
        else:
            affected_count = len(getattr(plan_impact, 'affected_skills', []))
            user_impact = getattr(plan_impact, 'user_impact', 'none')
            breaking_changes = getattr(plan_impact, 'breaking_changes', False)
        
        if affected_count > 2:
            risk_factors.append({
                'factor': 'wide_impact',
                'description': f'影响 {affected_count} 个技能',
                'severity': 'medium'
            })
            risk_score += 15
        
        # 用户影响
        if user_impact == 'high':
            risk_score += 20
        elif user_impact == 'medium':
            risk_score += 10
        
        # 计算安全评分 (100 - 风险分)
        safety_score = max(0, 100 - risk_score)
        
        # 确定是否需要审批
        approval_required = risk_score > 40 or plan_risk_level in [RiskLevel.HIGH.value, RiskLevel.CRITICAL.value]
        
        # 生成缓解策略
        mitigation_strategies = self._generate_mitigation_strategies(plan, risk_factors)
        
        return SafetyReport(
            report_id=f"SAF_{plan_id}",
            plan_id=plan_id,
            safety_score=safety_score,
            risk_factors=risk_factors,
            mitigation_strategies=mitigation_strategies,
            approval_required=approval_required,
            auto_approvable=safety_score >= 80
        )
    
    def _generate_mitigation_strategies(self, plan, risk_factors: List[Dict]) -> List[str]:
        """生成风险缓解策略"""
        strategies = []
        
        # 处理字典或对象
        if isinstance(plan, dict):
            plan_changes = plan.get('changes', [])
            plan_impact = plan.get('impact_analysis', {})
            rollback = plan.get('rollback_plan', {})
        else:
            plan_changes = plan.changes
            plan_impact = plan.impact_analysis
            rollback = plan.rollback_plan
        
        # 基于回滚计划
        if isinstance(rollback, dict):
            rollback_action = rollback.get('action', '')
        else:
            rollback_action = getattr(rollback, 'action', '')
        
        if rollback_action == 'restore_backup':
            strategies.append('✓ 已配置自动回滚')
        elif rollback_action == 'manual_review':
            strategies.append('⚠ 需要人工审核后执行')
        
        # 基于变更类型
        for change in plan_changes:
            if isinstance(change, dict):
                if change.get('safe'):
                    strategies.append(f"✓ 变更 {change.get('type')} 标记为安全")
            else:
                if getattr(change, 'safe', False):
                    strategies.append(f"✓ 变更 {getattr(change, 'type', 'unknown')} 标记为安全")
        
        # 基于影响
        if isinstance(plan_impact, dict):
            if plan_impact.get('breaking_changes'):
                strategies.append('⚠ 存在破坏性变更，需要版本标记')
                strategies.append('⚠ 建议灰度发布')
        else:
            if getattr(plan_impact, 'breaking_changes', False):
                strategies.append('⚠ 存在破坏性变更，需要版本标记')
                strategies.append('⚠ 建议灰度发布')
        
        if not strategies:
            strategies.append('执行标准测试流程')
        
        return strategies
    
    def _build_execution_queue(self) -> List[Dict]:
        """构建执行队列（按风险排序）"""
        plans = self.optimization_results['optimization_plans']
        reports = {r['plan_id']: r for r in self.optimization_results['safety_reports']}
        
        queue = []
        for plan in plans:
            plan_id = plan.get('plan_id')
            report = reports.get(plan_id, {})
            
            queue.append({
                'plan_id': plan_id,
                'priority': self._calculate_priority(plan, report),
                'can_auto_execute': report.get('auto_approvable', False),
                'requires_approval': report.get('approval_required', False),
                'safety_score': report.get('safety_score', 0),
                'estimated_time': plan.get('estimated_time', 'unknown')
            })
        
        # 按优先级排序（数字越大优先级越高，但风险低优先）
        queue.sort(key=lambda x: (-x['priority'], -x['safety_score']))
        
        return queue
    
    def _calculate_priority(self, plan: Dict, report: Dict) -> int:
        """计算计划优先级"""
        priority = 0
        
        # 修复类优先级高
        if plan.get('plan_type') == OptimizationType.FIX.value:
            priority += 50
        
        # 增强类中等优先级
        if plan.get('plan_type') == OptimizationType.ENHANCE.value:
            priority += 30
        
        # 整合类低优先级
        if plan.get('plan_type') == OptimizationType.CONSOLIDATE.value:
            priority += 10
        
        # 高安全评分增加优先级
        priority += report.get('safety_score', 0) // 20
        
        return priority
    
    def _calculate_metrics(self) -> Dict:
        """计算优化指标"""
        plans = self.optimization_results['optimization_plans']
        reports = self.optimization_results['safety_reports']
        
        return {
            'total_plans': len(plans),
            'fix_plans': len([p for p in plans if p.get('plan_type') == OptimizationType.FIX.value]),
            'enhance_plans': len([p for p in plans if p.get('plan_type') == OptimizationType.ENHANCE.value]),
            'consolidate_plans': len([p for p in plans if p.get('plan_type') == OptimizationType.CONSOLIDATE.value]),
            'avg_safety_score': sum(r.get('safety_score', 0) for r in reports) / max(len(reports), 1),
            'auto_executable': len([r for r in reports if r.get('auto_approvable')]),
            'requires_approval': len([r for r in reports if r.get('approval_required')])
        }
    
    def _determine_exit_status(self) -> str:
        """确定准出状态"""
        plans = self.optimization_results['optimization_plans']
        
        if not plans:
            return 'no_action_needed'
        
        auto_executable = self.optimization_results['metrics'].get('auto_executable', 0)
        requires_approval = self.optimization_results['metrics'].get('requires_approval', 0)
        
        if auto_executable > 0 and requires_approval == 0:
            return 'ready_for_auto_execution'
        elif requires_approval > 0:
            return 'ready_for_next'  # 需要creator/validator处理
        else:
            return 'ready_for_next'
    
    def _publish_optimization_event(self):
        """发布优化事件"""
        self.event_bus.publish('seef.optimization.completed', {
            'timestamp': datetime.now().isoformat(),
            'total_plans': self.optimization_results['metrics'].get('total_plans', 0),
            'auto_executable': self.optimization_results['metrics'].get('auto_executable', 0),
            'requires_approval': self.optimization_results['metrics'].get('requires_approval', 0),
            'avg_safety_score': self.optimization_results['metrics'].get('avg_safety_score', 0)
        })
    
    def _get_file_template(self, file_name: str) -> str:
        """获取文件模板"""
        templates = {
            'README.md': '# Skill Name\n\nDescription here.\n',
            'index.js': 'module.exports = function() { /* TODO */ };\n',
            'index.py': '#!/usr/bin/env python3\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n',
            'package.json': '{"name": "skill-name", "version": "1.0.0"}\n',
            'requirements.txt': '# Python dependencies\n'
        }
        return templates.get(file_name, '')
    
    def _get_section_template(self, section: str) -> str:
        """获取章节模板"""
        templates = {
            'name': '## Name\n\nSkill name here.\n',
            'description': '## Description\n\nDescription here.\n',
            'version': '## Version\n\n1.0.0\n',
            'input': '## Input\n\n- param1: description\n',
            'output': '## Output\n\n- result1: description\n',
            'usage': '## Usage\n\nUsage instructions here.\n'
        }
        return templates.get(section, f'## {section.capitalize()}\n\n')
    
    def _get_traceback(self) -> str:
        """获取异常跟踪信息"""
        import traceback
        return traceback.format_exc()
    
    def _degraded_result(self) -> Dict[str, Any]:
        """降级结果"""
        return {
            'subskill': 'optimizer',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'degraded',
            'error': '执行过程中发生错误，返回降级结果',
            'partial_results': self.optimization_results
        }


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='SEEF 技能优化器')
    parser.add_argument('skill_path', nargs='?', default=None, help='技能路径（可选）')
    parser.add_argument('--evaluator-results', '-e', type=str, help='评估器结果JSON文件')
    parser.add_argument('--discoverer-results', '-d', type=str, help='发现器结果JSON文件')
    parser.add_argument('--output', '-o', type=str, help='输出结果到文件')
    
    args = parser.parse_args()
    
    # 加载输入数据
    evaluator_results = None
    discoverer_results = None
    
    if args.evaluator_results:
        with open(args.evaluator_results, 'r') as f:
            evaluator_results = json.load(f)
    
    if args.discoverer_results:
        with open(args.discoverer_results, 'r') as f:
            discoverer_results = json.load(f)
    
    # 运行优化器
    optimizer = SkillOptimizer()
    result = optimizer.run(args.skill_path, evaluator_results, discoverer_results)
    
    # 输出结果
    output_json = json.dumps(result, ensure_ascii=False, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"\n💾 结果已保存: {args.output}")
    else:
        print("\n📊 优化结果:")
        print(output_json)
    
    return result['exit_status'] != 'failed'


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
