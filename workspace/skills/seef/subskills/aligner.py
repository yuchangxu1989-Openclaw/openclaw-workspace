#!/usr/bin/env python3
"""
SEEF Subskill: Skill Aligner v2.0
全局标准化对齐器 - 监听标准变更，自动触发全链路对齐

功能特性：
- 监听ISC标准变更
- 自动检测标准偏差
- 生成对齐计划
- 自动修复标准不符合项
- DTO事件总线集成
- 输入输出数据管道
- 错误处理和降级机制
"""

import os
import sys
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Set
from dataclasses import dataclass, asdict
import copy
import hashlib

# 尝试导入watchdog，如果失败则使用降级模式
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False
    Observer = None
    FileSystemEventHandler = object

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
            'source': 'seef.aligner'
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


@dataclass
class StandardDeviation:
    """标准偏差项"""
    deviation_id: str
    skill_name: str
    standard_name: str
    deviation_type: str  # missing_file, missing_section, format_error, version_mismatch
    severity: str  # critical, high, medium, low
    current_value: str
    expected_value: str
    suggested_fix: str


@dataclass
class AlignmentAction:
    """对齐操作"""
    action_id: str
    action_type: str  # create, update, delete, migrate
    target_skill: str
    target_file: str
    changes: List[Dict[str, Any]]
    safe_to_auto_apply: bool
    requires_backup: bool
    rollback_action: str


class ISCStandardMonitor(FileSystemEventHandler if WATCHDOG_AVAILABLE else object):
    """ISC标准文件监控器"""
    
    def __init__(self, callback):
        self.callback = callback
        self.last_modified = {}
    
    def on_modified(self, event):
        if event.is_directory:
            return
        
        if 'standard' in event.src_path.lower():
            file_path = Path(event.src_path)
            if file_path.exists():
                current_mtime = file_path.stat().st_mtime
                
                # 检查是否真正变更
                if event.src_path in self.last_modified:
                    if current_mtime == self.last_modified[event.src_path]:
                        return
                
                self.last_modified[event.src_path] = current_mtime
                self.callback(event.src_path)


class SkillAligner:
    """
    全局标准化对齐器 - 核心实现类
    """
    
    VERSION = "2.0.0"
    
    # ISC标准定义
    ISC_STANDARDS = {
        'core': {
            'version': '1.0.0',
            'required_files': ['SKILL.md'],
            'required_sections': {
                'SKILL.md': ['name', 'description', 'version']
            },
            'file_naming': {
                'pattern': r'^[a-z][a-z0-9\-]*$',
                'max_length': 50
            }
        },
        'documentation': {
            'version': '1.0.0',
            'required_sections': {
                'SKILL.md': ['input', 'output', 'usage']
            },
            'recommended_sections': {
                'SKILL.md': ['dependencies', 'examples', 'notes']
            }
        },
        'javascript': {
            'version': '1.0.0',
            'required_files': ['index.js', 'package.json'],
            'code_patterns': {
                'export': r'module\.exports\s*=',
                'error_handling': r'try\s*\{[\s\S]*?catch'
            }
        },
        'python': {
            'version': '1.0.0',
            'required_files': ['index.py'],
            'code_patterns': {
                'shebang': r'^#!/usr/bin/env python3',
                'main_guard': r"if __name__\s*==\s*['\"]__main__['\"]"
            }
        }
    }
    
    def __init__(self, event_bus: Optional[DTOEventBus] = None):
        self.event_bus = event_bus or DTOEventBus()
        self.event_bus.connect()
        
        self.skills_base_path = Path('/root/.openclaw/workspace/skills')
        self.standards_path = Path('/root/.openclaw/workspace/skills/seef/standards')
        self.alignment_results = {
            'subskill': 'aligner',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'aligned',
            'deviations': [],
            'alignment_actions': [],
            'standards_checked': [],
            'skills_aligned': [],
            'auto_fixed': [],
            'requires_manual': [],
            'metrics': {},
            'errors': []
        }
        
        self._standards_cache = {}
        self._observer = None
        
    def run(self, skill_path: Optional[str] = None,
            standards_version: Optional[str] = None,
            auto_fix: bool = False,
            context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        运行对齐流程
        
        Args:
            skill_path: 特定技能路径（可选）
            standards_version: 标准版本（可选）
            auto_fix: 是否自动修复
            context: 执行上下文
            
        Returns:
            对齐结果
        """
        print(f"\n📐 开始标准对齐检查...")
        print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   自动修复: {'启用' if auto_fix else '禁用'}")
        
        try:
            # 1. 加载当前标准
            self._load_standards(standards_version)
            print(f"   加载 {len(self._standards_cache)} 个标准定义")
            
            # 2. 扫描技能
            skills = self._scan_skills(skill_path)
            print(f"   扫描 {len(skills)} 个技能")
            
            # 3. 检查标准偏差
            for skill in skills:
                deviations = self._check_deviations(skill)
                for dev in deviations:
                    self.alignment_results['deviations'].append(asdict(dev))
            
            print(f"   发现 {len(self.alignment_results['deviations'])} 个标准偏差")
            
            # 4. 生成对齐操作
            for deviation in self.alignment_results['deviations']:
                action = self._deviation_to_action(deviation)
                if action:
                    self.alignment_results['alignment_actions'].append(asdict(action))
            
            print(f"   生成 {len(self.alignment_results['alignment_actions'])} 个对齐操作")
            
            # 5. 自动修复（如启用）
            if auto_fix:
                auto_fixed = self._apply_auto_fixes()
                self.alignment_results['auto_fixed'] = auto_fixed
                print(f"   自动修复 {len(auto_fixed)} 个问题")
            
            # 6. 识别需要人工处理的问题
            requires_manual = self._identify_manual_actions()
            self.alignment_results['requires_manual'] = requires_manual
            print(f"   需要人工处理: {len(requires_manual)} 个问题")
            
            # 7. 记录已对齐技能
            self.alignment_results['skills_aligned'] = self._get_aligned_skills(skills)
            
            # 8. 计算指标
            metrics = self._calculate_metrics()
            self.alignment_results['metrics'] = metrics
            
            # 9. 确定准出状态
            exit_status = self._determine_exit_status()
            self.alignment_results['exit_status'] = exit_status
            
            # 10. 发布对齐事件
            self._publish_alignment_event()
            
            print(f"   ✓ 标准对齐完成，状态: {exit_status}")
            
        except Exception as e:
            error_msg = f"对齐过程出错: {str(e)}"
            self.alignment_results['errors'].append(error_msg)
            self.alignment_results['exit_status'] = 'failed'
            print(f"   ✗ {error_msg}")
            
            self.event_bus.publish('seef.aligner.error', {
                'error': error_msg,
                'traceback': self._get_traceback()
            })
            
            return self._degraded_result()
        
        return self.alignment_results
    
    def start_monitoring(self):
        """启动标准变更监控（常驻模式）"""
        print("\n👁️  启动ISC标准监控...")
        
        if not WATCHDOG_AVAILABLE:
            print("   ⚠️  watchdog模块不可用，监控功能降级")
            print("   提示: pip install watchdog 启用文件监控功能")
            print("   进入轮询模式（每60秒检查一次）...")
            self._start_polling_mode()
            return
        
        self._observer = Observer()
        handler = ISCStandardMonitor(self._on_standard_changed)
        
        # 监控标准目录
        if self.standards_path.exists():
            self._observer.schedule(handler, str(self.standards_path), recursive=True)
        
        # 监控seef配置目录
        config_path = Path('/root/.openclaw/workspace/skills/seef/.isc-config')
        if config_path.exists():
            self._observer.schedule(handler, str(config_path), recursive=True)
        
        self._observer.start()
        print(f"   监控路径: {self.standards_path}, {config_path}")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self._observer.stop()
        
        self._observer.join()
    
    def _start_polling_mode(self):
        """轮询模式（watchdog不可用时的降级方案）"""
        import hashlib
        
        file_hashes = {}
        
        while True:
            try:
                # 检查标准文件变更
                if self.standards_path.exists():
                    for std_file in self.standards_path.glob('*.json'):
                        try:
                            content = std_file.read_bytes()
                            current_hash = hashlib.md5(content).hexdigest()
                            
                            if str(std_file) in file_hashes:
                                if file_hashes[str(std_file)] != current_hash:
                                    print(f"   🔄 检测到变更: {std_file.name}")
                                    self._on_standard_changed(str(std_file))
                            
                            file_hashes[str(std_file)] = current_hash
                        except Exception:
                            pass
                
                time.sleep(60)  # 每60秒检查一次
                
            except KeyboardInterrupt:
                print("\n   监控已停止")
                break
            except Exception as e:
                print(f"   ⚠️  轮询错误: {e}")
                time.sleep(60)
    
    def _on_standard_changed(self, file_path: str):
        """标准变更回调"""
        print(f"\n🔄 检测到标准变更: {file_path}")
        
        # 发布标准变更事件
        self.event_bus.publish('seef.standard.changed', {
            'file': file_path,
            'timestamp': datetime.now().isoformat()
        })
        
        # 触发全量对齐
        self.run(auto_fix=False)
    
    def _load_standards(self, version: Optional[str] = None):
        """加载ISC标准"""
        self._standards_cache = copy.deepcopy(self.ISC_STANDARDS)
        
        # 加载自定义标准文件
        if self.standards_path.exists():
            for std_file in self.standards_path.glob('*.json'):
                try:
                    with open(std_file, 'r') as f:
                        custom_std = json.load(f)
                        std_name = std_file.stem
                        self._standards_cache[std_name] = custom_std
                except Exception as e:
                    print(f"   ⚠️  加载标准 {std_file} 失败: {e}")
        
        self.alignment_results['standards_checked'] = list(self._standards_cache.keys())
    
    def _scan_skills(self, target_path: Optional[str] = None) -> List[Dict[str, Any]]:
        """扫描技能目录"""
        skills = []
        
        if target_path:
            skill_dirs = [Path(target_path)]
        else:
            skill_dirs = [d for d in self.skills_base_path.iterdir() if d.is_dir()]
        
        for skill_dir in skill_dirs:
            try:
                # 跳过非技能目录
                if skill_dir.name.startswith('.') or skill_dir.name in ['seef', 'dto-core']:
                    continue
                
                skill_info = self._analyze_skill(skill_dir)
                if skill_info:
                    skills.append(skill_info)
            except Exception as e:
                print(f"   ⚠️  扫描技能 {skill_dir.name} 失败: {e}")
                continue
        
        return skills
    
    def _analyze_skill(self, skill_dir: Path) -> Optional[Dict[str, Any]]:
        """分析单个技能"""
        has_skill_md = (skill_dir / 'SKILL.md').exists()
        
        # 检测语言类型
        language = 'unknown'
        if (skill_dir / 'index.js').exists():
            language = 'javascript'
        elif (skill_dir / 'index.py').exists():
            language = 'python'
        
        return {
            'name': skill_dir.name,
            'path': str(skill_dir),
            'has_skill_md': has_skill_md,
            'language': language,
            'files': [f.name for f in skill_dir.iterdir() if f.is_file()]
        }
    
    def _check_deviations(self, skill: Dict) -> List[StandardDeviation]:
        """检查标准偏差"""
        deviations = []
        
        # 检查核心标准
        core_std = self._standards_cache.get('core', {})
        
        # 检查必需文件
        for req_file in core_std.get('required_files', []):
            if req_file not in skill.get('files', []):
                deviations.append(StandardDeviation(
                    deviation_id=f"DEV_{skill['name']}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                    skill_name=skill['name'],
                    standard_name='core',
                    deviation_type='missing_file',
                    severity='critical',
                    current_value='missing',
                    expected_value=req_file,
                    suggested_fix=f'创建文件 {req_file}'
                ))
        
        # 检查SKILL.md内容
        if skill.get('has_skill_md'):
            content_deviations = self._check_skill_md_content(skill, core_std)
            deviations.extend(content_deviations)
        
        # 检查语言特定标准
        if skill.get('language') == 'javascript':
            js_deviations = self._check_javascript_standards(skill)
            deviations.extend(js_deviations)
        elif skill.get('language') == 'python':
            py_deviations = self._check_python_standards(skill)
            deviations.extend(py_deviations)
        
        # 检查命名规范
        naming_deviations = self._check_naming_standards(skill, core_std)
        deviations.extend(naming_deviations)
        
        return deviations
    
    def _check_skill_md_content(self, skill: Dict, core_std: Dict) -> List[StandardDeviation]:
        """检查SKILL.md内容"""
        deviations = []
        
        skill_md_path = Path(skill['path']) / 'SKILL.md'
        
        try:
            with open(skill_md_path, 'r', encoding='utf-8') as f:
                content = f.read().lower()
        except Exception:
            return deviations
        
        # 检查必需章节
        required_sections = core_std.get('required_sections', {}).get('SKILL.md', [])
        for section in required_sections:
            if section not in content:
                deviations.append(StandardDeviation(
                    deviation_id=f"DEV_{skill['name']}_sec_{section}",
                    skill_name=skill['name'],
                    standard_name='core',
                    deviation_type='missing_section',
                    severity='high',
                    current_value='missing',
                    expected_value=section,
                    suggested_fix=f'在SKILL.md中添加 ## {section.capitalize()} 章节'
                ))
        
        return deviations
    
    def _check_javascript_standards(self, skill: Dict) -> List[StandardDeviation]:
        """检查JavaScript标准"""
        deviations = []
        js_std = self._standards_cache.get('javascript', {})
        
        # 检查必需文件
        for req_file in js_std.get('required_files', []):
            if req_file not in skill.get('files', []):
                deviations.append(StandardDeviation(
                    deviation_id=f"DEV_{skill['name']}_js_{req_file}",
                    skill_name=skill['name'],
                    standard_name='javascript',
                    deviation_type='missing_file',
                    severity='medium',
                    current_value='missing',
                    expected_value=req_file,
                    suggested_fix=f'创建文件 {req_file}'
                ))
        
        # 检查代码模式
        index_js = Path(skill['path']) / 'index.js'
        if index_js.exists():
            try:
                content = index_js.read_text()
                for pattern_name, pattern in js_std.get('code_patterns', {}).items():
                    if not re.search(pattern, content):
                        deviations.append(StandardDeviation(
                            deviation_id=f"DEV_{skill['name']}_pattern_{pattern_name}",
                            skill_name=skill['name'],
                            standard_name='javascript',
                            deviation_type='format_error',
                            severity='low',
                            current_value='missing',
                            expected_value=pattern_name,
                            suggested_fix=f'添加 {pattern_name} 模式到 index.js'
                        ))
            except Exception:
                pass
        
        return deviations
    
    def _check_python_standards(self, skill: Dict) -> List[StandardDeviation]:
        """检查Python标准"""
        deviations = []
        py_std = self._standards_cache.get('python', {})
        
        # 检查必需文件
        for req_file in py_std.get('required_files', []):
            if req_file not in skill.get('files', []):
                deviations.append(StandardDeviation(
                    deviation_id=f"DEV_{skill['name']}_py_{req_file}",
                    skill_name=skill['name'],
                    standard_name='python',
                    deviation_type='missing_file',
                    severity='medium',
                    current_value='missing',
                    expected_value=req_file,
                    suggested_fix=f'创建文件 {req_file}'
                ))
        
        # 检查代码模式
        index_py = Path(skill['path']) / 'index.py'
        if index_py.exists():
            try:
                content = index_py.read_text()
                for pattern_name, pattern in py_std.get('code_patterns', {}).items():
                    if not re.search(pattern, content):
                        deviations.append(StandardDeviation(
                            deviation_id=f"DEV_{skill['name']}_pattern_{pattern_name}",
                            skill_name=skill['name'],
                            standard_name='python',
                            deviation_type='format_error',
                            severity='low',
                            current_value='missing',
                            expected_value=pattern_name,
                            suggested_fix=f'添加 {pattern_name} 模式到 index.py'
                        ))
            except Exception:
                pass
        
        return deviations
    
    def _check_naming_standards(self, skill: Dict, core_std: Dict) -> List[StandardDeviation]:
        """检查命名标准"""
        deviations = []
        naming = core_std.get('file_naming', {})
        
        skill_name = skill['name']
        pattern = naming.get('pattern', r'^[a-z][a-z0-9\-]*$')
        max_length = naming.get('max_length', 50)
        
        # 检查命名格式
        if not re.match(pattern, skill_name):
            deviations.append(StandardDeviation(
                deviation_id=f"DEV_{skill['name']}_naming",
                skill_name=skill['name'],
                standard_name='core',
                deviation_type='format_error',
                severity='medium',
                current_value=skill_name,
                expected_value='lowercase-with-hyphens',
                suggested_fix=f'重命名为符合规范的小写连字符格式'
            ))
        
        # 检查长度
        if len(skill_name) > max_length:
            deviations.append(StandardDeviation(
                deviation_id=f"DEV_{skill['name']}_length",
                skill_name=skill['name'],
                standard_name='core',
                deviation_type='format_error',
                severity='low',
                current_value=f'{len(skill_name)} chars',
                expected_value=f'<= {max_length} chars',
                suggested_fix=f'缩短技能名称至{max_length}字符以内'
            ))
        
        return deviations
    
    def _deviation_to_action(self, deviation: Dict) -> Optional[AlignmentAction]:
        """将偏差转换为对齐操作"""
        deviation_type = deviation.get('deviation_type')
        severity = deviation.get('severity')
        
        action_id = f"ACT_{deviation.get('deviation_id', 'unknown')}"
        
        # 确定是否可以自动应用
        safe_to_auto = severity in ['low'] and deviation_type in ['missing_file', 'missing_section']
        
        if deviation_type == 'missing_file':
            return AlignmentAction(
                action_id=action_id,
                action_type='create',
                target_skill=deviation.get('skill_name', ''),
                target_file=deviation.get('expected_value', ''),
                changes=[{
                    'type': 'create_file',
                    'file': deviation.get('expected_value', '')
                }],
                safe_to_auto_apply=safe_to_auto,
                requires_backup=False,
                rollback_action='delete_file'
            )
        
        elif deviation_type == 'missing_section':
            return AlignmentAction(
                action_id=action_id,
                action_type='update',
                target_skill=deviation.get('skill_name', ''),
                target_file='SKILL.md',
                changes=[{
                    'type': 'add_section',
                    'section': deviation.get('expected_value', '')
                }],
                safe_to_auto_apply=safe_to_auto,
                requires_backup=True,
                rollback_action='restore_backup'
            )
        
        elif deviation_type == 'format_error':
            return AlignmentAction(
                action_id=action_id,
                action_type='migrate',
                target_skill=deviation.get('skill_name', ''),
                target_file='multiple',
                changes=[{
                    'type': 'format_fix',
                    'issue': deviation.get('expected_value', '')
                }],
                safe_to_auto_apply=False,
                requires_backup=True,
                rollback_action='restore_backup'
            )
        
        return None
    
    def _apply_auto_fixes(self) -> List[Dict]:
        """应用自动修复"""
        fixed = []
        
        for action in self.alignment_results['alignment_actions']:
            if not action.get('safe_to_auto_apply'):
                continue
            
            try:
                result = self._execute_action(action)
                if result:
                    fixed.append({
                        'action_id': action.get('action_id'),
                        'skill': action.get('target_skill'),
                        'result': result
                    })
            except Exception as e:
                print(f"   ⚠️  自动修复失败 {action.get('action_id')}: {e}")
                continue
        
        return fixed
    
    def _execute_action(self, action: Dict) -> Optional[str]:
        """执行对齐操作"""
        action_type = action.get('action_type')
        skill_name = action.get('target_skill')
        skill_path = self.skills_base_path / skill_name
        
        if not skill_path.exists():
            return None
        
        for change in action.get('changes', []):
            change_type = change.get('type')
            
            if change_type == 'create_file':
                file_name = change.get('file', '')
                file_path = skill_path / file_name
                
                # 创建空文件
                file_path.touch()
                return f'created {file_name}'
            
            elif change_type == 'add_section':
                section = change.get('section', '')
                skill_md = skill_path / 'SKILL.md'
                
                if skill_md.exists():
                    with open(skill_md, 'a') as f:
                        f.write(f"\n## {section.capitalize()}\n\n")
                    return f'added section {section}'
        
        return None
    
    def _identify_manual_actions(self) -> List[Dict]:
        """识别需要人工处理的操作"""
        manual = []
        
        for action in self.alignment_results['alignment_actions']:
            if not action.get('safe_to_auto_apply'):
                manual.append({
                    'action_id': action.get('action_id'),
                    'skill': action.get('target_skill'),
                    'reason': 'requires_manual_review'
                })
        
        return manual
    
    def _get_aligned_skills(self, skills: List[Dict]) -> List[str]:
        """获取已对齐的技能列表"""
        aligned = []
        skill_names = {s['name'] for s in skills}
        
        for skill_name in skill_names:
            # 检查是否有未解决的偏差
            skill_deviations = [
                d for d in self.alignment_results['deviations']
                if d.get('skill_name') == skill_name and d.get('severity') in ['critical', 'high']
            ]
            
            if not skill_deviations:
                aligned.append(skill_name)
        
        return aligned
    
    def _calculate_metrics(self) -> Dict:
        """计算对齐指标"""
        deviations = self.alignment_results['deviations']
        
        return {
            'total_deviations': len(deviations),
            'critical_deviations': len([d for d in deviations if d.get('severity') == 'critical']),
            'high_deviations': len([d for d in deviations if d.get('severity') == 'high']),
            'medium_deviations': len([d for d in deviations if d.get('severity') == 'medium']),
            'low_deviations': len([d for d in deviations if d.get('severity') == 'low']),
            'auto_fixable': len([a for a in self.alignment_results['alignment_actions'] if a.get('safe_to_auto_apply')]),
            'requires_manual': len(self.alignment_results['requires_manual']),
            'compliance_rate': self._calculate_compliance_rate()
        }
    
    def _calculate_compliance_rate(self) -> float:
        """计算合规率"""
        total = len(self.alignment_results['deviations'])
        if total == 0:
            return 1.0
        
        critical = len([d for d in self.alignment_results['deviations'] if d.get('severity') == 'critical'])
        high = len([d for d in self.alignment_results['deviations'] if d.get('severity') == 'high'])
        
        # 严重问题权重更高
        weighted_issues = critical * 1.0 + high * 0.5
        return max(0, 1.0 - (weighted_issues / total))
    
    def _determine_exit_status(self) -> str:
        """确定准出状态"""
        metrics = self.alignment_results['metrics']
        
        if metrics.get('critical_deviations', 0) > 0:
            return 'alignment_required'
        
        if metrics.get('high_deviations', 0) > 0:
            return 'alignment_recommended'
        
        if metrics.get('requires_manual', 0) > 0:
            return 'manual_review_needed'
        
        return 'aligned'
    
    def _publish_alignment_event(self):
        """发布对齐事件"""
        self.event_bus.publish('seef.alignment.completed', {
            'timestamp': datetime.now().isoformat(),
            'total_deviations': self.alignment_results['metrics'].get('total_deviations', 0),
            'compliance_rate': self.alignment_results['metrics'].get('compliance_rate', 0),
            'auto_fixed': len(self.alignment_results.get('auto_fixed', [])),
            'requires_manual': len(self.alignment_results.get('requires_manual', []))
        })
    
    def _get_traceback(self) -> str:
        """获取异常跟踪信息"""
        import traceback
        return traceback.format_exc()
    
    def _degraded_result(self) -> Dict[str, Any]:
        """降级结果"""
        return {
            'subskill': 'aligner',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'degraded',
            'error': '执行过程中发生错误，返回降级结果',
            'partial_results': self.alignment_results
        }


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='SEEF 全局标准化对齐器')
    parser.add_argument('skill_path', nargs='?', default=None, help='技能路径（可选）')
    parser.add_argument('--auto-fix', '-a', action='store_true', help='自动修复')
    parser.add_argument('--monitor', '-m', action='store_true', help='启动监控模式')
    parser.add_argument('--output', '-o', type=str, help='输出结果到文件')
    
    args = parser.parse_args()
    
    aligner = SkillAligner()
    
    if args.monitor:
        aligner.start_monitoring()
    else:
        result = aligner.run(
            skill_path=args.skill_path,
            auto_fix=args.auto_fix
        )
        
        # 输出结果
        output_json = json.dumps(result, ensure_ascii=False, indent=2)
        
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output_json)
            print(f"\n💾 结果已保存: {args.output}")
        else:
            print("\n📊 对齐结果:")
            print(output_json)
        
        return result['exit_status'] == 'aligned'


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
