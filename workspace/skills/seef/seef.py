#!/usr/bin/env python3
"""
SEEF - Skill Ecosystem Evolution Foundry v4.0.0 (DTO集成版)
技能生态进化工厂 - 主程序

新特性：
- DTO EventBus 集成
- PDCA闭环状态机管理
- 子技能间数据传递管道
- ISC标准准入准出检查
- 事件驱动工作流

七大子技能：
1. evaluator - 技能评估器
2. discoverer - 技能发现器  
3. optimizer - 技能优化器
4. creator - 技能创造器
5. aligner - 全局标准化对齐器
6. validator - 技能验证器
7. recorder - 技能记录器
8. installer - 技能安装器
"""

import os

OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", "/root/.openclaw")
WORKSPACE_PATH = os.path.join(OPENCLAW_HOME, "workspace")
SKILLS_PATH = os.path.join(WORKSPACE_PATH, "skills")
import sys
import json
import argparse
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Callable
from enum import Enum, auto
from dataclasses import dataclass, field, asdict

# 添加子技能路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 导入子技能
from subskills.evaluator import SkillEvaluator
from subskills.discoverer import SkillDiscoverer
from subskills.optimizer import SkillOptimizer
from subskills.creator import SkillCreator
from subskills.aligner import SkillAligner
from subskills.validator import SkillValidator
from subskills.recorder import SkillRecorder, EvolutionKnowledgeBase
from subskills.skill_installer import SkillInstaller


class PDCAState(Enum):
    """PDCA状态枚举"""
    PLAN = "plan"           # 计划：收集需求，制定目标
    DO = "do"               # 执行：实施计划
    CHECK = "check"         # 检查：评估结果
    ACT = "act"             # 处理：标准化或改进
    COMPLETED = "completed" # 完成
    FAILED = "failed"       # 失败


class PDCAPhase(Enum):
    """PDCA阶段枚举"""
    EVALUATE = "evaluate"       # 评估
    DISCOVER = "discover"       # 发现
    OPTIMIZE = "optimize"       # 优化
    CREATE = "create"           # 创建
    ALIGN = "align"             # 对齐
    VALIDATE = "validate"       # 验证
    RECORD = "record"           # 记录


@dataclass
class PipelineContext:
    """流水线上下文"""
    trace_id: str
    start_time: str
    pdca_state: PDCAState = PDCAState.PLAN
    current_phase: Optional[PDCAPhase] = None
    completed_phases: List[str] = field(default_factory=list)
    phase_results: Dict[str, Any] = field(default_factory=dict)
    data_pipeline: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class DTOEventBus:
    """DTO事件总线客户端"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or str(Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills/dto-core/config/event-bus.json')
        self.events = []
        self.subscribers: Dict[str, List[Callable]] = {}
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
            
            # 确保事件目录存在
            events_dir = Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills/seef/events'
            events_dir.mkdir(parents=True, exist_ok=True)
            
            return True
        except Exception as e:
            print(f"⚠️  事件总线连接失败: {e}，降级到本地模式")
            self._connected = True
            return True
    
    def publish(self, event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """发布事件到总线"""
        event = {
            'event_type': event_type,
            'data': data,
            'timestamp': datetime.now().isoformat(),
            'source': 'seef.core'
        }
        self.events.append(event)
        
        # 写入事件文件
        try:
            events_dir = Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills/seef/events'
            event_file = events_dir / f"{event_type}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.json"
            with open(event_file, 'w') as f:
                json.dump(event, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        
        # 触发订阅者
        if event_type in self.subscribers:
            for handler in self.subscribers[event_type]:
                try:
                    handler(data)
                except Exception as e:
                    print(f"  ⚠️  事件处理器错误: {e}")
        
        return event
    
    def subscribe(self, event_type: str, handler: Callable):
        """订阅事件"""
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(handler)
    
    def get_history(self, event_type: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """获取事件历史"""
        if event_type:
            return [e for e in self.events if e['event_type'] == event_type][-limit:]
        return self.events[-limit:]


class PDCAStateMachine:
    """PDCA状态机"""
    
    def __init__(self, event_bus: DTOEventBus):
        self.state = PDCAState.PLAN
        self.phase = None
        self.event_bus = event_bus
        self.transitions = self._define_transitions()
    
    def _define_transitions(self) -> Dict:
        """定义状态转换规则"""
        return {
            PDCAState.PLAN: {
                'next': PDCAState.DO,
                'phases': [PDCAPhase.EVALUATE, PDCAPhase.DISCOVER]
            },
            PDCAState.DO: {
                'next': PDCAState.CHECK,
                'phases': [PDCAPhase.OPTIMIZE, PDCAPhase.CREATE]
            },
            PDCAState.CHECK: {
                'next': PDCAState.ACT,
                'phases': [PDCAPhase.ALIGN, PDCAPhase.VALIDATE]
            },
            PDCAState.ACT: {
                'next': PDCAState.COMPLETED,
                'phases': [PDCAPhase.RECORD]
            }
        }
    
    def transition(self, new_state: PDCAState) -> bool:
        """状态转换"""
        if new_state == self.state:
            return True
        
        # 验证转换是否允许
        allowed = self.transitions.get(self.state, {}).get('next')
        
        if new_state == allowed or new_state == PDCAState.FAILED:
            old_state = self.state
            self.state = new_state
            
            # 发布状态变更事件
            self.event_bus.publish('seef.pdca.state_changed', {
                'from': old_state.value,
                'to': new_state.value,
                'timestamp': datetime.now().isoformat()
            })
            
            return True
        
        return False
    
    def set_phase(self, phase: PDCAPhase):
        """设置当前阶段"""
        self.phase = phase
        self.event_bus.publish('seef.pdca.phase_changed', {
            'phase': phase.value,
            'timestamp': datetime.now().isoformat()
        })


class ISCComplianceChecker:
    """ISC标准合规检查器"""
    
    def __init__(self):
        self.standards = self._load_standards()
    
    def _load_standards(self) -> Dict:
        """加载ISC标准"""
        return {
            'entry_requirements': [
                'skill_path_valid',
                'skill_md_exists'
            ],
            'exit_requirements': [
                'validation_passed',
                'alignment_complete',
                'documentation_complete'
            ],
            'forbidden_patterns': [
                'hardcoded_secrets',
                'malicious_code'
            ]
        }
    
    def check_entry(self, skill_path: str) -> Dict:
        """准入检查"""
        results = {
            'passed': True,
            'checks': []
        }
        
        path = Path(skill_path)
        
        # 检查路径有效性
        check = {
            'name': 'skill_path_valid',
            'passed': path.exists() and path.is_dir(),
            'message': '技能路径有效' if path.exists() else '技能路径不存在'
        }
        results['checks'].append(check)
        if not check['passed']:
            results['passed'] = False
        
        # 检查SKILL.md
        if path.exists():
            check = {
                'name': 'skill_md_exists',
                'passed': (path / 'SKILL.md').exists(),
                'message': 'SKILL.md存在' if (path / 'SKILL.md').exists() else '缺少SKILL.md'
            }
            results['checks'].append(check)
            if not check['passed']:
                results['passed'] = False
        
        return results
    
    def check_exit(self, validation_results: Dict, alignment_results: Dict) -> Dict:
        """准出检查"""
        results = {
            'passed': True,
            'checks': []
        }
        
        # 检查验证结果
        exit_status = validation_results.get('exit_status', 'unknown')
        check = {
            'name': 'validation_passed',
            'passed': exit_status in ['approved', 'conditional'],
            'message': f'验证状态: {exit_status}'
        }
        results['checks'].append(check)
        if not check['passed']:
            results['passed'] = False
        
        # 检查对齐结果
        exit_status = alignment_results.get('exit_status', 'unknown')
        check = {
            'name': 'alignment_complete',
            'passed': exit_status in ['aligned', 'manual_review_needed'],
            'message': f'对齐状态: {exit_status}'
        }
        results['checks'].append(check)
        if not check['passed']:
            results['passed'] = False
        
        return results


class SEEF:
    """SEEF 技能生态进化工厂 - DTO集成版"""
    
    VERSION = "4.0.0"
    SUBSKILLS = [
        'evaluator',      # 技能评估器
        'discoverer',     # 技能发现器
        'optimizer',      # 技能优化器
        'creator',        # 技能创造器
        'aligner',        # 全局标准化对齐器
        'validator',      # 技能验证器
        'recorder',       # 技能记录器
        'installer'       # 技能安装器
    ]
    
    def __init__(self):
        self.base_path = Path(__file__).parent
        self.logs_dir = self.base_path / 'logs'
        self.logs_dir.mkdir(exist_ok=True)
        
        # DTO事件总线
        self.event_bus = DTOEventBus()
        self.event_bus.connect()
        
        # PDCA状态机
        self.pdca = PDCAStateMachine(self.event_bus)
        
        # ISC合规检查器
        self.isc_checker = ISCComplianceChecker()
        
        # 数据管道
        self.data_pipeline: Dict[str, Any] = {}
        
        # 执行上下文
        self.execution_context: Dict[str, Any] = {}
        
        # 设置事件订阅
        self._setup_event_subscriptions()
    
    def _setup_event_subscriptions(self):
        """设置事件订阅"""
        # 监听各阶段完成事件
        for subskill in self.SUBSKILLS:
            self.event_bus.subscribe(f'seef.{subskill}.completed', 
                                    lambda d, s=subskill: self._on_subskill_completed(s, d))
        
        # 监听错误事件
        self.event_bus.subscribe('seef.*.error', self._on_error)
    
    def _on_subskill_completed(self, subskill: str, data: Dict):
        """子技能完成回调"""
        print(f"  📡 收到事件: {subskill}.completed")
        # 数据自动传递到管道
        self.data_pipeline[f'{subskill}_results'] = data
    
    def _on_error(self, data: Dict):
        """错误回调"""
        print(f"  🚨 收到错误事件: {data.get('error', 'Unknown error')}")
    
    def run_pdca_cycle(self, target_skill: Optional[str] = None,
                       context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        运行完整PDCA闭环
        
        Args:
            target_skill: 目标技能
            context: 执行上下文
            
        Returns:
            执行结果
        """
        # 初始化上下文
        trace_id = f"seef_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.execution_context = {
            'trace_id': trace_id,
            'start_time': datetime.now().isoformat(),
            'version': self.VERSION,
            'target_skill': target_skill,
            'mode': 'pdca_cycle'
        }
        
        pipeline_context = PipelineContext(
            trace_id=trace_id,
            start_time=datetime.now().isoformat()
        )
        
        print(f"\n{'='*70}")
        print(f'🏭 SEEF v{self.VERSION} - PDCA闭环模式')
        print(f'追踪ID: {trace_id}')
        print(f'目标技能: {target_skill or "全部技能"}')
        print(f"{'='*70}\n")
        
        # 发布开始事件
        self.event_bus.publish('seef.execution.started', {
            'trace_id': trace_id,
            'target_skill': target_skill,
            'mode': 'pdca_cycle'
        })
        
        try:
            # ===== PDCA: PLAN =====
            self.pdca.transition(PDCAState.PLAN)
            self._run_plan_phase(pipeline_context, target_skill, context)
            
            # ===== PDCA: DO =====
            self.pdca.transition(PDCAState.DO)
            self._run_do_phase(pipeline_context, target_skill)
            
            # ===== PDCA: CHECK =====
            self.pdca.transition(PDCAState.CHECK)
            self._run_check_phase(pipeline_context, target_skill)
            
            # ===== PDCA: ACT =====
            self.pdca.transition(PDCAState.ACT)
            self._run_act_phase(pipeline_context)
            
            # 完成
            self.pdca.transition(PDCAState.COMPLETED)
            
        except Exception as e:
            self.pdca.transition(PDCAState.FAILED)
            pipeline_context.errors.append(str(e))
            self.event_bus.publish('seef.execution.failed', {
                'trace_id': trace_id,
                'error': str(e)
            })
        
        # 汇总结果
        result = self._compile_results(pipeline_context)
        
        # 保存执行日志
        self._save_execution_log(result)
        
        # 发布完成事件
        self.event_bus.publish('seef.execution.completed', {
            'trace_id': trace_id,
            'status': result['status'],
            'duration': result['duration']
        })
        
        return result
    
    def _run_plan_phase(self, ctx: PipelineContext, target_skill: Optional[str],
                        external_context: Optional[Dict]):
        """运行PLAN阶段"""
        print(f"\n📋 PDCA PLAN阶段 - 评估与发现")
        print("-" * 50)
        
        # ISC准入检查
        if target_skill:
            entry_check = self.isc_checker.check_entry(target_skill)
            print(f"   ISC准入检查: {'通过' if entry_check['passed'] else '未通过'}")
            if not entry_check['passed']:
                for check in entry_check['checks']:
                    if not check['passed']:
                        print(f"   ✗ {check['name']}: {check['message']}")
                raise Exception(f"ISC准入检查失败: {target_skill}")
        
        # 1. Evaluator - 评估
        self.pdca.set_phase(PDCAPhase.EVALUATE)
        evaluator = SkillEvaluator()
        eval_result = evaluator.evaluate(target_skill or str(self.skills_base_path))
        ctx.phase_results['evaluator'] = eval_result
        ctx.completed_phases.append('evaluate')
        self._forward_data('evaluator', eval_result)
        
        # 2. Discoverer - 发现
        self.pdca.set_phase(PDCAPhase.DISCOVER)
        discoverer = SkillDiscoverer()
        discover_result = discoverer.run(target_skill, {
            'evaluator_results': eval_result
        })
        ctx.phase_results['discoverer'] = discover_result
        ctx.completed_phases.append('discover')
        self._forward_data('discoverer', discover_result)
    
    def _run_do_phase(self, ctx: PipelineContext, target_skill: Optional[str]):
        """运行DO阶段"""
        print(f"\n🔨 PDCA DO阶段 - 优化与创建")
        print("-" * 50)
        
        # 3. Optimizer - 优化
        self.pdca.set_phase(PDCAPhase.OPTIMIZE)
        optimizer = SkillOptimizer()
        optimize_result = optimizer.run(
            target_skill,
            evaluator_results=ctx.phase_results.get('evaluator'),
            discoverer_results=ctx.phase_results.get('discoverer')
        )
        ctx.phase_results['optimizer'] = optimize_result
        ctx.completed_phases.append('optimize')
        self._forward_data('optimizer', optimize_result)
        
        # 4. Creator - 创建
        self.pdca.set_phase(PDCAPhase.CREATE)
        creator = SkillCreator()
        create_result = creator.run(
            target_skill,
            optimizer_results=optimize_result
        )
        ctx.phase_results['creator'] = create_result
        ctx.completed_phases.append('create')
        self._forward_data('creator', create_result)
    
    def _run_check_phase(self, ctx: PipelineContext, target_skill: Optional[str]):
        """运行CHECK阶段"""
        print(f"\n📊 PDCA CHECK阶段 - 对齐与验证")
        print("-" * 50)
        
        # 5. Aligner - 对齐
        self.pdca.set_phase(PDCAPhase.ALIGN)
        aligner = SkillAligner()
        align_result = aligner.run(target_skill, auto_fix=True)
        ctx.phase_results['aligner'] = align_result
        ctx.completed_phases.append('align')
        self._forward_data('aligner', align_result)
        
        # 6. Validator - 验证
        self.pdca.set_phase(PDCAPhase.VALIDATE)
        validator = SkillValidator()
        validate_result = validator.run(
            target_skill,
            creator_results=ctx.phase_results.get('creator'),
            aligner_results=align_result
        )
        ctx.phase_results['validator'] = validate_result
        ctx.completed_phases.append('validate')
        self._forward_data('validator', validate_result)
        
        # ISC准出检查
        exit_check = self.isc_checker.check_exit(
            validate_result,
            align_result
        )
        print(f"   ISC准出检查: {'通过' if exit_check['passed'] else '未通过'}")
        if not exit_check['passed']:
            for check in exit_check['checks']:
                if not check['passed']:
                    print(f"   ✗ {check['name']}: {check['message']}")
    
    def _run_act_phase(self, ctx: PipelineContext):
        """运行ACT阶段"""
        print(f"\n📝 PDCA ACT阶段 - 记录与标准化")
        print("-" * 50)
        
        # 7. Recorder - 记录
        self.pdca.set_phase(PDCAPhase.RECORD)
        recorder = SkillRecorder()
        record_result = recorder.run(
            all_results=ctx.phase_results,
            trace_id=ctx.trace_id
        )
        ctx.phase_results['recorder'] = record_result
        ctx.completed_phases.append('record')
        self._forward_data('recorder', record_result)
    
    def _forward_data(self, source: str, data: Dict):
        """转发数据到管道"""
        self.data_pipeline[source] = data
        print(f"   → 数据管道: {source} 结果已传递")
    
    def _compile_results(self, ctx: PipelineContext) -> Dict[str, Any]:
        """编译执行结果"""
        start_time = datetime.fromisoformat(ctx.start_time)
        duration = (datetime.now() - start_time).total_seconds()
        
        # 计算各阶段状态
        phase_status = {}
        for phase, results in ctx.phase_results.items():
            phase_status[phase] = results.get('exit_status', 'unknown')
        
        # 确定整体状态
        if ctx.errors or self.pdca.state == PDCAState.FAILED:
            status = 'failed'
        elif all(s in ['approved', 'aligned', 'logged', 'ready_for_next'] 
                 for s in phase_status.values()):
            status = 'completed'
        else:
            status = 'partial'
        
        return {
            'trace_id': ctx.trace_id,
            'version': self.VERSION,
            'status': status,
            'pdca_state': self.pdca.state.value,
            'completed_phases': ctx.completed_phases,
            'phase_status': phase_status,
            'duration': duration,
            'data_pipeline_keys': list(self.data_pipeline.keys()),
            'errors': ctx.errors,
            'timestamp': datetime.now().isoformat()
        }
    
    def _save_execution_log(self, result: Dict):
        """保存执行日志"""
        log_file = self.logs_dir / f"{result['trace_id']}.json"
        
        log_data = {
            **self.execution_context,
            'end_time': datetime.now().isoformat(),
            'result': result,
            'data_pipeline': self.data_pipeline
        }
        
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
        
        print(f'\n💾 执行日志已保存: {log_file}')
    
    def run_fixed_loop(self, target_skill: Optional[str] = None) -> Dict[str, Any]:
        """
        固定闭环模式（向后兼容）
        """
        return self.run_pdca_cycle(target_skill)
    
    def run_flexible_chain(self, steps: List[str], target_skill: Optional[str] = None,
                          context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        自由编排模式
        """
        print(f"\n{'='*70}")
        print(f'🏭 SEEF v{self.VERSION} - 自由编排模式')
        print(f'执行链: {" → ".join(steps)}')
        print(f'目标技能: {target_skill or "未指定"}')
        print(f"{'='*70}\n")
        
        trace_id = f"seef_flex_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        results = []
        
        # 验证步骤有效性
        invalid_steps = [s for s in steps if s not in self.SUBSKILLS]
        if invalid_steps:
            return {
                'status': 'error',
                'error': f'无效子技能: {invalid_steps}'
            }
        
        # 初始化子技能
        subskill_instances = {
            'evaluator': SkillEvaluator(),
            'discoverer': SkillDiscoverer(),
            'optimizer': SkillOptimizer(),
            'creator': SkillCreator(),
            'aligner': SkillAligner(),
            'validator': SkillValidator(),
            'recorder': SkillRecorder()
        }
        
        # 执行链
        for step in steps:
            print(f'\n📍 执行: {step}')
            print('-' * 50)
            
            instance = subskill_instances[step]
            
            # 构建参数
            kwargs = {'skill_path': target_skill}
            
            # 根据步骤传递数据
            if step == 'optimizer' and 'evaluator' in [r['subskill'] for r in results]:
                eval_result = [r for r in results if r['subskill'] == 'evaluator'][0]
                kwargs['evaluator_results'] = eval_result
            
            if step == 'creator' and 'optimizer' in [r['subskill'] for r in results]:
                opt_result = [r for r in results if r['subskill'] == 'optimizer'][0]
                kwargs['optimizer_results'] = opt_result
            
            # 执行
            try:
                if step == 'evaluator':
                    result = instance.evaluate(target_skill or '.')
                else:
                    result = instance.run(**kwargs)
                
                results.append(result)
                print(f'   状态: {result.get("exit_status", "unknown")}')
                
                if result.get('exit_status') == 'failed':
                    print(f'\n⚠️  {step} 执行失败')
                    break
                    
            except Exception as e:
                print(f'\n✗ {step} 执行异常: {e}')
                results.append({
                    'subskill': step,
                    'exit_status': 'failed',
                    'error': str(e)
                })
                break
        
        return {
            'trace_id': trace_id,
            'status': 'completed',
            'results': results,
            'timestamp': datetime.now().isoformat()
        }


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='SEEF 技能生态进化工厂 v4.0')
    parser.add_argument('--mode', choices=['pdca', 'fixed', 'flexible'], default='pdca',
                        help='运行模式: pdca=PDCA闭环, fixed=固定闭环, flexible=自由编排')
    parser.add_argument('--steps', type=str, default='',
                        help='自由编排模式下的子技能列表，逗号分隔')
    parser.add_argument('--target', type=str, default=None,
                        help='目标技能名称或路径')
    parser.add_argument('--version', action='store_true',
                        help='显示版本信息')
    
    args = parser.parse_args()
    
    if args.version:
        print(f'SEEF v{SEEF.VERSION}')
        return
    
    seef = SEEF()
    
    if args.mode == 'pdca':
        result = seef.run_pdca_cycle(target_skill=args.target)
    elif args.mode == 'fixed':
        result = seef.run_fixed_loop(target_skill=args.target)
    else:
        steps = args.steps.split(',') if args.steps else ['evaluator', 'discoverer']
        result = seef.run_flexible_chain(steps, target_skill=args.target)
    
    print(f'\n{"="*70}')
    print(f'执行完成')
    print(f'状态: {result["status"]}')
    print(f'追踪ID: {result["trace_id"]}')
    if 'duration' in result:
        print(f'耗时: {result["duration"]:.2f}秒')
    print(f'{"="*70}\n')
    
    # 输出JSON结果
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
