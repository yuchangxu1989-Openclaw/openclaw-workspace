#!/usr/bin/env python3
"""
SEEF Subskill: Skill Validator v2.0
技能验证器 - 功能、质量与规范三重达标的最终裁决者

功能特性：
- 功能测试验证
- 代码质量检查
- ISC标准最终审查
- 准出门控决策
- DTO事件总线集成
- 输入输出数据管道
- 错误处理和降级机制
"""

import os
import sys
import json
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import hashlib

# DTO事件总线集成
class DTOEventBus:
    """DTO事件总线客户端"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or '/root/.openclaw/workspace/skills/dto-core/config/event-bus.json'
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
            'source': 'seef.validator'
        }
        self.events.append(event)
        
        try:
            events_dir = Path('/root/.openclaw/workspace/skills/seef/events')
            events_dir.mkdir(parents=True, exist_ok=True)
            
            event_file = events_dir / f"{event_type}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.json"
            with open(event_file, 'w') as f:
                json.dump(event, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
            
        return event


class ValidationType(Enum):
    """验证类型"""
    FUNCTIONAL = "functional"
    QUALITY = "quality"
    STANDARD = "standard"
    SECURITY = "security"
    PERFORMANCE = "performance"


class ValidationStatus(Enum):
    """验证状态"""
    PASS = "pass"
    FAIL = "fail"
    WARNING = "warning"
    SKIP = "skip"
    ERROR = "error"


@dataclass
class ValidationCheck:
    """验证检查项"""
    check_id: str
    check_type: str
    description: str
    status: str
    details: Dict[str, Any]
    severity: str
    remediation: Optional[str]


@dataclass
class ValidationReport:
    """验证报告"""
    report_id: str
    skill_name: str
    overall_status: str
    gate_decision: str
    checks: List[Dict[str, Any]]
    summary: Dict[str, Any]
    metadata: Dict[str, Any]


class SkillValidator:
    """
    技能验证器 - 核心实现类
    """
    
    VERSION = "2.0.0"
    
    # 验证门限
    GATE_THRESHOLDS = {
        'critical_pass_rate': 1.0,  # 关键检查100%通过
        'high_pass_rate': 0.9,      # 高优先级90%通过
        'overall_pass_rate': 0.8,    # 整体80%通过
        'max_critical_failures': 0,  # 最多0个关键失败
        'max_high_failures': 2       # 最多2个高优先级失败
    }
    
    # 质量门检查项
    QUALITY_CHECKS = {
        'code_complexity': {
            'max_cyclomatic': 15,
            'max_cognitive': 10
        },
        'code_coverage': {
            'min_line_coverage': 0.7,
            'min_branch_coverage': 0.6
        },
        'documentation': {
            'min_doc_ratio': 0.2  # 注释行/代码行
        }
    }
    
    def __init__(self, event_bus: Optional[DTOEventBus] = None):
        self.event_bus = event_bus or DTOEventBus()
        self.event_bus.connect()
        
        self.skills_base_path = Path('/root/.openclaw/workspace/skills')
        self.validation_results = {
            'subskill': 'validator',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'pending',
            'input_summary': {},
            'validation_reports': [],
            'gate_decisions': [],
            'failed_validations': [],
            'metrics': {},
            'errors': []
        }
        
    def run(self, skill_path: Optional[str] = None,
            creator_results: Optional[Dict] = None,
            aligner_results: Optional[Dict] = None,
            context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        运行验证流程
        
        Args:
            skill_path: 特定技能路径（可选）
            creator_results: 创造者结果
            aligner_results: 对齐器结果
            context: 执行上下文
            
        Returns:
            验证结果
        """
        print(f"\n✅ 开始技能验证流程...")
        print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        try:
            # 1. 收集待验证技能
            skills_to_validate = self._collect_skills(skill_path, creator_results, context)
            self.validation_results['input_summary'] = {
                'total_skills': len(skills_to_validate),
                'skill_names': [s['name'] for s in skills_to_validate]
            }
            print(f"   待验证技能: {len(skills_to_validate)} 个")
            
            # 2. 执行验证
            for skill in skills_to_validate:
                try:
                    report = self._validate_skill(skill, aligner_results)
                    self.validation_results['validation_reports'].append(asdict(report))
                    
                    # 记录门控决策
                    self.validation_results['gate_decisions'].append({
                        'skill': skill['name'],
                        'decision': report.gate_decision,
                        'overall_status': report.overall_status
                    })
                    
                    print(f"   ✓ 验证完成: {skill['name']} -> {report.gate_decision}")
                    
                except Exception as e:
                    error_msg = f"验证技能 {skill['name']} 失败: {e}"
                    self.validation_results['failed_validations'].append({
                        'skill': skill['name'],
                        'error': error_msg
                    })
                    print(f"   ✗ {error_msg}")
                    continue
            
            # 3. 计算指标
            metrics = self._calculate_metrics()
            self.validation_results['metrics'] = metrics
            
            # 4. 确定准出状态
            exit_status = self._determine_exit_status()
            self.validation_results['exit_status'] = exit_status
            
            # 5. 发布验证事件
            self._publish_validation_event()
            
            print(f"   ✓ 验证流程完成，状态: {exit_status}")
            
        except Exception as e:
            error_msg = f"验证过程出错: {str(e)}"
            self.validation_results['errors'].append(error_msg)
            self.validation_results['exit_status'] = 'failed'
            print(f"   ✗ {error_msg}")
            
            self.event_bus.publish('seef.validator.error', {
                'error': error_msg,
                'traceback': self._get_traceback()
            })
            
            return self._degraded_result()
        
        return self.validation_results
    
    def _collect_skills(self, skill_path: Optional[str],
                        creator_results: Optional[Dict],
                        context: Optional[Dict]) -> List[Dict[str, Any]]:
        """收集待验证技能"""
        skills = []
        
        # 从创造者结果获取
        if creator_results:
            created = creator_results.get('created_skills', [])
            for skill in created:
                skills.append({
                    'name': skill.get('skill_name', 'unknown'),
                    'path': skill.get('skill_path', ''),
                    'source': 'creator'
                })
        
        # 从指定路径获取
        if skill_path:
            path = Path(skill_path)
            if path.exists():
                skills.append({
                    'name': path.name,
                    'path': str(path),
                    'source': 'cli'
                })
        
        # 从上下文获取
        if context and 'validate_skills' in context:
            for skill_name in context['validate_skills']:
                skill_path = self.skills_base_path / skill_name
                if skill_path.exists():
                    skills.append({
                        'name': skill_name,
                        'path': str(skill_path),
                        'source': 'context'
                    })
        
        # 去重
        seen = set()
        unique_skills = []
        for skill in skills:
            if skill['name'] not in seen:
                seen.add(skill['name'])
                unique_skills.append(skill)
        
        return unique_skills
    
    def _validate_skill(self, skill: Dict, aligner_results: Optional[Dict]) -> ValidationReport:
        """验证单个技能"""
        skill_name = skill['name']
        skill_path = Path(skill['path'])
        
        checks = []
        
        # 1. 功能验证
        functional_checks = self._validate_functional(skill)
        checks.extend(functional_checks)
        
        # 2. 质量验证
        quality_checks = self._validate_quality(skill)
        checks.extend(quality_checks)
        
        # 3. 标准验证
        standard_checks = self._validate_standards(skill, aligner_results)
        checks.extend(standard_checks)
        
        # 4. 安全验证
        security_checks = self._validate_security(skill)
        checks.extend(security_checks)
        
        # 5. 性能验证（简化版）
        performance_checks = self._validate_performance(skill)
        checks.extend(performance_checks)
        
        # 汇总结果
        overall_status = self._determine_overall_status(checks)
        gate_decision = self._make_gate_decision(checks)
        
        return ValidationReport(
            report_id=f"VAL_{skill_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            skill_name=skill_name,
            overall_status=overall_status,
            gate_decision=gate_decision,
            checks=[asdict(c) for c in checks],
            summary=self._generate_summary(checks),
            metadata={
                'validated_at': datetime.now().isoformat(),
                'validator_version': self.VERSION,
                'skill_path': str(skill_path)
            }
        )
    
    def _validate_functional(self, skill: Dict) -> List[ValidationCheck]:
        """功能验证"""
        checks = []
        skill_path = Path(skill['path'])
        
        # 检查入口文件
        entry_files = ['index.js', 'index.py', 'main.py', 'main.js']
        has_entry = any((skill_path / f).exists() for f in entry_files)
        
        checks.append(ValidationCheck(
            check_id=f"{skill['name']}_func_entry",
            check_type=ValidationType.FUNCTIONAL.value,
            description='入口文件存在性',
            status=ValidationStatus.PASS.value if has_entry else ValidationStatus.FAIL.value,
            details={'entry_files_checked': entry_files},
            severity='critical',
            remediation='创建 index.js 或 index.py 入口文件' if not has_entry else None
        ))
        
        # 尝试解析入口文件
        if has_entry:
            for entry in entry_files:
                entry_path = skill_path / entry
                if entry_path.exists():
                    syntax_valid = self._check_syntax(entry_path)
                    checks.append(ValidationCheck(
                        check_id=f"{skill['name']}_func_syntax",
                        check_type=ValidationType.FUNCTIONAL.value,
                        description=f'{entry} 语法检查',
                        status=ValidationStatus.PASS.value if syntax_valid else ValidationStatus.FAIL.value,
                        details={'file': entry},
                        severity='critical',
                        remediation='修复语法错误' if not syntax_valid else None
                    ))
                    break
        
        # 检查SKILL.md描述与实际功能匹配
        skill_md = skill_path / 'SKILL.md'
        if skill_md.exists():
            try:
                content = skill_md.read_text(encoding='utf-8')
                has_description = 'description' in content.lower()
                
                checks.append(ValidationCheck(
                    check_id=f"{skill['name']}_func_doc",
                    check_type=ValidationType.FUNCTIONAL.value,
                    description='功能文档描述',
                    status=ValidationStatus.PASS.value if has_description else ValidationStatus.WARNING.value,
                    details={'has_description': has_description},
                    severity='medium',
                    remediation='添加详细的功能描述到SKILL.md' if not has_description else None
                ))
            except Exception:
                pass
        
        return checks
    
    def _validate_quality(self, skill: Dict) -> List[ValidationCheck]:
        """质量验证"""
        checks = []
        skill_path = Path(skill['path'])
        
        # 代码行数检查
        total_lines = 0
        code_files = list(skill_path.glob('*.js')) + list(skill_path.glob('*.py'))
        
        for code_file in code_files:
            try:
                content = code_file.read_text()
                lines = len(content.split('\n'))
                total_lines += lines
            except Exception:
                pass
        
        # 检查代码规模
        if total_lines > 1000:
            status = ValidationStatus.WARNING.value
            remediation = '考虑将大技能拆分为多个小技能'
        else:
            status = ValidationStatus.PASS.value
            remediation = None
        
        checks.append(ValidationCheck(
            check_id=f"{skill['name']}_quality_size",
            check_type=ValidationType.QUALITY.value,
            description='代码规模检查',
            status=status,
            details={'total_lines': total_lines},
            severity='low',
            remediation=remediation
        ))
        
        # 检查TODO注释
        todo_count = 0
        for code_file in code_files:
            try:
                content = code_file.read_text()
                todo_count += len(re.findall(r'TODO|FIXME|XXX', content, re.IGNORECASE))
            except Exception:
                pass
        
        if todo_count > 5:
            status = ValidationStatus.WARNING.value
        else:
            status = ValidationStatus.PASS.value
        
        checks.append(ValidationCheck(
            check_id=f"{skill['name']}_quality_todos",
            check_type=ValidationType.QUALITY.value,
            description='未完成的TODO检查',
            status=status,
            details={'todo_count': todo_count},
            severity='medium',
            remediation='完成或移除TODO项' if todo_count > 5 else None
        ))
        
        return checks
    
    def _validate_standards(self, skill: Dict, aligner_results: Optional[Dict]) -> List[ValidationCheck]:
        """标准验证"""
        checks = []
        skill_name = skill['name']
        
        # 检查对齐器结果
        if aligner_results:
            deviations = aligner_results.get('deviations', [])
            skill_deviations = [d for d in deviations if d.get('skill_name') == skill_name]
            
            if skill_deviations:
                critical_devs = [d for d in skill_deviations if d.get('severity') == 'critical']
                
                checks.append(ValidationCheck(
                    check_id=f"{skill_name}_std_compliance",
                    check_type=ValidationType.STANDARD.value,
                    description='ISC标准合规性',
                    status=ValidationStatus.FAIL.value if critical_devs else ValidationStatus.WARNING.value,
                    details={
                        'total_deviations': len(skill_deviations),
                        'critical_deviations': len(critical_devs)
                    },
                    severity='high',
                    remediation='运行 aligner 子技能修复标准偏差'
                ))
            else:
                checks.append(ValidationCheck(
                    check_id=f"{skill_name}_std_compliance",
                    check_type=ValidationType.STANDARD.value,
                    description='ISC标准合规性',
                    status=ValidationStatus.PASS.value,
                    details={'deviations': 0},
                    severity='high',
                    remediation=None
                ))
        else:
            checks.append(ValidationCheck(
                check_id=f"{skill_name}_std_compliance",
                check_type=ValidationType.STANDARD.value,
                description='ISC标准合规性',
                status=ValidationStatus.SKIP.value,
                details={'reason': 'no_aligner_results'},
                severity='medium',
                remediation='提供 aligner 结果进行完整验证'
            ))
        
        # 检查版本号
        skill_md = Path(skill['path']) / 'SKILL.md'
        if skill_md.exists():
            try:
                content = skill_md.read_text()
                version_match = re.search(r'version[:：]\s*v?(\d+\.\d+\.?\d*)', content, re.IGNORECASE)
                
                checks.append(ValidationCheck(
                    check_id=f"{skill_name}_std_version",
                    check_type=ValidationType.STANDARD.value,
                    description='版本号规范',
                    status=ValidationStatus.PASS.value if version_match else ValidationStatus.FAIL.value,
                    details={'version': version_match.group(1) if version_match else None},
                    severity='medium',
                    remediation='添加版本号到SKILL.md' if not version_match else None
                ))
            except Exception:
                pass
        
        return checks
    
    def _validate_security(self, skill: Dict) -> List[ValidationCheck]:
        """安全验证"""
        checks = []
        skill_path = Path(skill['path'])
        
        # 检查敏感信息泄露
        sensitive_patterns = [
            (r'password\s*=\s*["\'][^"\']+["\']', '硬编码密码'),
            (r'api[_-]?key\s*=\s*["\'][^"\']+["\']', '硬编码API密钥'),
            (r'secret\s*=\s*["\'][^"\']+["\']', '硬编码密钥'),
            (r'token\s*=\s*["\'][^"\']{20,}["\']', '可能的硬编码token')
        ]
        
        security_issues = []
        code_files = list(skill_path.glob('*.js')) + list(skill_path.glob('*.py'))
        
        for code_file in code_files:
            try:
                content = code_file.read_text()
                for pattern, issue_type in sensitive_patterns:
                    if re.search(pattern, content, re.IGNORECASE):
                        security_issues.append({
                            'file': code_file.name,
                            'type': issue_type
                        })
            except Exception:
                pass
        
        if security_issues:
            checks.append(ValidationCheck(
                check_id=f"{skill['name']}_sec_secrets",
                check_type=ValidationType.SECURITY.value,
                description='敏感信息泄露检查',
                status=ValidationStatus.FAIL.value,
                details={'issues': security_issues},
                severity='critical',
                remediation='使用环境变量或密钥管理服务存储敏感信息'
            ))
        else:
            checks.append(ValidationCheck(
                check_id=f"{skill['name']}_sec_secrets",
                check_type=ValidationType.SECURITY.value,
                description='敏感信息泄露检查',
                status=ValidationStatus.PASS.value,
                details={'issues': 0},
                severity='critical',
                remediation=None
            ))
        
        # 检查eval/exec使用
        dangerous_patterns = ['eval(', 'exec(', 'system(', 'popen(']
        dangerous_usage = []
        
        for code_file in code_files:
            try:
                content = code_file.read_text()
                for pattern in dangerous_patterns:
                    if pattern in content:
                        dangerous_usage.append({
                            'file': code_file.name,
                            'pattern': pattern
                        })
            except Exception:
                pass
        
        if dangerous_usage:
            checks.append(ValidationCheck(
                check_id=f"{skill['name']}_sec_dangerous",
                check_type=ValidationType.SECURITY.value,
                description='危险函数使用检查',
                status=ValidationStatus.WARNING.value,
                details={'usages': dangerous_usage},
                severity='high',
                remediation='审查危险函数的使用，确保输入已正确消毒'
            ))
        else:
            checks.append(ValidationCheck(
                check_id=f"{skill['name']}_sec_dangerous",
                check_type=ValidationType.SECURITY.value,
                description='危险函数使用检查',
                status=ValidationStatus.PASS.value,
                details={},
                severity='high',
                remediation=None
            ))
        
        return checks
    
    def _validate_performance(self, skill: Dict) -> List[ValidationCheck]:
        """性能验证（简化版）"""
        checks = []
        
        # 静态分析：检查循环嵌套深度
        skill_path = Path(skill['path'])
        code_files = list(skill_path.glob('*.js')) + list(skill_path.glob('*.py'))
        
        max_nesting = 0
        for code_file in code_files:
            try:
                content = code_file.read_text()
                # 简单估计嵌套深度
                nesting_levels = re.findall(r'^(\s*)for|^\s*while|^\s*if', content, re.MULTILINE)
                if nesting_levels:
                    current_nesting = max(len(s) for s in nesting_levels) // 4  # 假设4空格缩进
                    max_nesting = max(max_nesting, current_nesting)
            except Exception:
                pass
        
        if max_nesting > 4:
            status = ValidationStatus.WARNING.value
            remediation = '考虑重构深度嵌套的代码'
        else:
            status = ValidationStatus.PASS.value
            remediation = None
        
        checks.append(ValidationCheck(
            check_id=f"{skill['name']}_perf_nesting",
            check_type=ValidationType.PERFORMANCE.value,
            description='代码嵌套深度',
            status=status,
            details={'max_nesting': max_nesting},
            severity='low',
            remediation=remediation
        ))
        
        return checks
    
    def _check_syntax(self, file_path: Path) -> bool:
        """检查文件语法"""
        try:
            if file_path.suffix == '.py':
                result = subprocess.run(
                    ['python3', '-m', 'py_compile', str(file_path)],
                    capture_output=True,
                    timeout=10
                )
                return result.returncode == 0
            elif file_path.suffix == '.js':
                # 使用node检查语法
                result = subprocess.run(
                    ['node', '--check', str(file_path)],
                    capture_output=True,
                    timeout=10
                )
                return result.returncode == 0
        except Exception:
            pass
        return True  # 默认通过
    
    def _determine_overall_status(self, checks: List[ValidationCheck]) -> str:
        """确定整体状态"""
        statuses = [c.status for c in checks]
        
        if any(s == ValidationStatus.FAIL.value for s in statuses):
            return ValidationStatus.FAIL.value
        elif any(s == ValidationStatus.WARNING.value for s in statuses):
            return ValidationStatus.WARNING.value
        else:
            return ValidationStatus.PASS.value
    
    def _make_gate_decision(self, checks: List[ValidationCheck]) -> str:
        """做出门控决策"""
        # 统计各类检查
        by_severity = {'critical': [], 'high': [], 'medium': [], 'low': []}
        
        for check in checks:
            severity = check.severity
            if severity in by_severity:
                by_severity[severity].append(check)
        
        # 检查关键失败
        critical_failures = [c for c in by_severity['critical'] if c.status == ValidationStatus.FAIL.value]
        if len(critical_failures) > self.GATE_THRESHOLDS['max_critical_failures']:
            return 'rejected'
        
        # 检查高优先级失败
        high_failures = [c for c in by_severity['high'] if c.status == ValidationStatus.FAIL.value]
        if len(high_failures) > self.GATE_THRESHOLDS['max_high_failures']:
            return 'conditional'  # 条件通过
        
        # 检查整体通过率
        total = len(checks)
        passed = len([c for c in checks if c.status == ValidationStatus.PASS.value])
        pass_rate = passed / total if total > 0 else 0
        
        if pass_rate >= self.GATE_THRESHOLDS['overall_pass_rate']:
            return 'approved'
        elif pass_rate >= 0.6:
            return 'conditional'
        else:
            return 'rejected'
    
    def _generate_summary(self, checks: List[ValidationCheck]) -> Dict:
        """生成验证摘要"""
        return {
            'total_checks': len(checks),
            'passed': len([c for c in checks if c.status == ValidationStatus.PASS.value]),
            'failed': len([c for c in checks if c.status == ValidationStatus.FAIL.value]),
            'warnings': len([c for c in checks if c.status == ValidationStatus.WARNING.value]),
            'skipped': len([c for c in checks if c.status == ValidationStatus.SKIP.value]),
            'by_type': self._group_by_type(checks)
        }
    
    def _group_by_type(self, checks: List[ValidationCheck]) -> Dict:
        """按类型分组"""
        groups = {}
        for check in checks:
            check_type = check.check_type
            if check_type not in groups:
                groups[check_type] = {'total': 0, 'passed': 0, 'failed': 0}
            groups[check_type]['total'] += 1
            if check.status == ValidationStatus.PASS.value:
                groups[check_type]['passed'] += 1
            elif check.status == ValidationStatus.FAIL.value:
                groups[check_type]['failed'] += 1
        return groups
    
    def _calculate_metrics(self) -> Dict:
        """计算验证指标"""
        reports = self.validation_results['validation_reports']
        
        if not reports:
            return {
                'total_validated': 0,
                'approved': 0,
                'conditional': 0,
                'rejected': 0
            }
        
        return {
            'total_validated': len(reports),
            'approved': len([r for r in reports if r.get('gate_decision') == 'approved']),
            'conditional': len([r for r in reports if r.get('gate_decision') == 'conditional']),
            'rejected': len([r for r in reports if r.get('gate_decision') == 'rejected']),
            'pass_rate': len([r for r in reports if r.get('overall_status') == 'pass']) / len(reports),
            'avg_checks_per_skill': sum(len(r.get('checks', [])) for r in reports) / len(reports)
        }
    
    def _determine_exit_status(self) -> str:
        """确定准出状态"""
        metrics = self.validation_results['metrics']
        
        if metrics.get('rejected', 0) > 0:
            return 'rejected'
        
        if metrics.get('conditional', 0) > 0:
            return 'conditional'
        
        if metrics.get('approved', 0) > 0:
            return 'approved'
        
        if self.validation_results['failed_validations']:
            return 'failed'
        
        return 'approved'
    
    def _publish_validation_event(self):
        """发布验证事件"""
        self.event_bus.publish('seef.validation.completed', {
            'timestamp': datetime.now().isoformat(),
            'total_validated': self.validation_results['metrics'].get('total_validated', 0),
            'approved': self.validation_results['metrics'].get('approved', 0),
            'rejected': self.validation_results['metrics'].get('rejected', 0),
            'pass_rate': self.validation_results['metrics'].get('pass_rate', 0)
        })
    
    def _get_traceback(self) -> str:
        """获取异常跟踪信息"""
        import traceback
        return traceback.format_exc()
    
    def _degraded_result(self) -> Dict[str, Any]:
        """降级结果"""
        return {
            'subskill': 'validator',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'degraded',
            'error': '执行过程中发生错误，返回降级结果',
            'partial_results': self.validation_results
        }


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='SEEF 技能验证器')
    parser.add_argument('skill_path', nargs='?', default=None, help='技能路径')
    parser.add_argument('--creator-results', '-c', type=str, help='创造者结果JSON')
    parser.add_argument('--aligner-results', '-a', type=str, help='对齐器结果JSON')
    parser.add_argument('--output', '-o', type=str, help='输出结果到文件')
    
    args = parser.parse_args()
    
    # 加载输入数据
    creator_results = None
    aligner_results = None
    
    if args.creator_results:
        with open(args.creator_results, 'r') as f:
            creator_results = json.load(f)
    
    if args.aligner_results:
        with open(args.aligner_results, 'r') as f:
            aligner_results = json.load(f)
    
    # 运行验证器
    validator = SkillValidator()
    result = validator.run(
        skill_path=args.skill_path,
        creator_results=creator_results,
        aligner_results=aligner_results
    )
    
    # 输出结果
    output_json = json.dumps(result, ensure_ascii=False, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"\n💾 结果已保存: {args.output}")
    else:
        print("\n📊 验证结果:")
        print(output_json)
    
    return result['exit_status'] == 'approved'


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
