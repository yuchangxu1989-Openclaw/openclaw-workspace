#!/usr/bin/env python3
"""
SEEF Subskill: Skill Recorder v2.0
技能记录器 - 忠实记录每一次技能变更事件，构建进化历史

功能特性：
- 记录技能生命周期事件
- 构建进化历史图谱
- 生成审计日志
- 知识库构建
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
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from collections import defaultdict
import sqlite3
import copy

# DTO事件总线集成
class DTOEventBus:
    """DTO事件总线客户端"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or str(Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills/dto-core/config/event-bus.json')
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
            'source': 'seef.recorder'
        }
        self.events.append(event)
        
        try:
            events_dir = Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills/seef/events'
            events_dir.mkdir(parents=True, exist_ok=True)
            
            event_file = events_dir / f"{event_type}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.json"
            with open(event_file, 'w') as f:
                json.dump(event, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
            
        return event


@dataclass
class EvolutionRecord:
    """进化记录"""
    record_id: str
    event_type: str
    skill_name: str
    event_data: Dict[str, Any]
    timestamp: str
    trace_id: str
    parent_record: Optional[str]
    metadata: Dict[str, Any]


@dataclass
class SkillSnapshot:
    """技能快照"""
    snapshot_id: str
    skill_name: str
    version: str
    file_hashes: Dict[str, str]
    content_summary: Dict[str, Any]
    timestamp: str


class EvolutionKnowledgeBase:
    """进化知识库"""
    
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or str(Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills/seef/evolution.db')
        self._init_db()
    
    def _init_db(self):
        """初始化数据库"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 进化记录表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS evolution_records (
                record_id TEXT PRIMARY KEY,
                event_type TEXT,
                skill_name TEXT,
                event_data TEXT,
                timestamp TEXT,
                trace_id TEXT,
                parent_record TEXT,
                metadata TEXT
            )
        ''')
        
        # 技能快照表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS skill_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                skill_name TEXT,
                version TEXT,
                file_hashes TEXT,
                content_summary TEXT,
                timestamp TEXT
            )
        ''')
        
        # 技能索引表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS skill_index (
                skill_name TEXT PRIMARY KEY,
                created_at TEXT,
                last_updated TEXT,
                total_evolutions INTEGER,
                current_version TEXT
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def save_record(self, record: EvolutionRecord):
        """保存记录"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO evolution_records 
            (record_id, event_type, skill_name, event_data, timestamp, trace_id, parent_record, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            record.record_id,
            record.event_type,
            record.skill_name,
            json.dumps(record.event_data),
            record.timestamp,
            record.trace_id,
            record.parent_record,
            json.dumps(record.metadata)
        ))
        
        conn.commit()
        conn.close()
    
    def save_snapshot(self, snapshot: SkillSnapshot):
        """保存快照"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO skill_snapshots 
            (snapshot_id, skill_name, version, file_hashes, content_summary, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            snapshot.snapshot_id,
            snapshot.skill_name,
            snapshot.version,
            json.dumps(snapshot.file_hashes),
            json.dumps(snapshot.content_summary),
            snapshot.timestamp
        ))
        
        conn.commit()
        conn.close()
    
    def get_evolution_history(self, skill_name: str, limit: int = 100) -> List[Dict]:
        """获取技能进化历史"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM evolution_records 
            WHERE skill_name = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        ''', (skill_name, limit))
        
        records = []
        for row in cursor.fetchall():
            records.append({
                'record_id': row[0],
                'event_type': row[1],
                'skill_name': row[2],
                'event_data': json.loads(row[3]),
                'timestamp': row[4],
                'trace_id': row[5],
                'parent_record': row[6],
                'metadata': json.loads(row[7])
            })
        
        conn.close()
        return records


class SkillRecorder:
    """
    技能记录器 - 核心实现类
    """
    
    VERSION = "2.0.0"
    
    # 需要记录的事件类型
    RECORDABLE_EVENTS = [
        'evaluation.completed',
        'discovery.completed',
        'optimization.completed',
        'creation.completed',
        'alignment.completed',
        'validation.completed',
        'deployment.completed',
        'rollback.completed'
    ]
    
    def __init__(self, event_bus: Optional[DTOEventBus] = None,
                 knowledge_base: Optional[EvolutionKnowledgeBase] = None):
        self.event_bus = event_bus or DTOEventBus()
        self.event_bus.connect()
        
        self.kb = knowledge_base or EvolutionKnowledgeBase()
        
        self.skills_base_path = Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills'
        self.records_path = Path(os.environ.get('OPENCLAW_HOME', '/root/.openclaw')) / 'workspace/skills/seef/evolution-pipeline'
        self.records_path.mkdir(parents=True, exist_ok=True)
        
        self.recording_results = {
            'subskill': 'recorder',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'logged',
            'input_data': {},
            'records_created': [],
            'snapshots_created': [],
            'knowledge_base_updates': [],
            'audit_log': [],
            'metrics': {},
            'errors': []
        }
        
        self._current_trace_id = None
        
    def run(self, skill_path: Optional[str] = None,
            all_results: Optional[Dict[str, Dict]] = None,
            trace_id: Optional[str] = None,
            context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        运行记录流程
        
        Args:
            skill_path: 特定技能路径（可选）
            all_results: 所有子技能结果
            trace_id: 追踪ID
            context: 执行上下文
            
        Returns:
            记录结果
        """
        print(f"\n📝 开始技能记录流程...")
        print(f"   时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        self._current_trace_id = trace_id or f"rec_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        try:
            # 1. 收集输入数据
            input_data = self._collect_input_data(all_results, context)
            self.recording_results['input_data'] = {
                'has_evaluator': 'evaluator' in input_data,
                'has_discoverer': 'discoverer' in input_data,
                'has_optimizer': 'optimizer' in input_data,
                'has_creator': 'creator' in input_data,
                'has_aligner': 'aligner' in input_data,
                'has_validator': 'validator' in input_data
            }
            print(f"   收集到 {len(input_data)} 个子技能结果")
            
            # 2. 创建进化记录
            for subskill, results in input_data.items():
                try:
                    record = self._create_evolution_record(subskill, results)
                    if record:
                        self.kb.save_record(record)
                        self.recording_results['records_created'].append(record.record_id)
                        print(f"   ✓ 记录 {subskill} 执行结果")
                except Exception as e:
                    print(f"   ⚠️  记录 {subskill} 失败: {e}")
                    continue
            
            # 3. 创建技能快照
            affected_skills = self._get_affected_skills(input_data)
            for skill_name in affected_skills:
                try:
                    snapshot = self._create_skill_snapshot(skill_name)
                    if snapshot:
                        self.kb.save_snapshot(snapshot)
                        self.recording_results['snapshots_created'].append(snapshot.snapshot_id)
                        print(f"   ✓ 创建快照: {skill_name}")
                except Exception as e:
                    print(f"   ⚠️  快照 {skill_name} 失败: {e}")
                    continue
            
            # 4. 更新知识库
            kb_updates = self._update_knowledge_base(input_data)
            self.recording_results['knowledge_base_updates'] = kb_updates
            
            # 5. 生成审计日志
            audit_log = self._generate_audit_log(input_data)
            self.recording_results['audit_log'] = audit_log
            self._save_audit_log(audit_log)
            
            # 6. 计算指标
            metrics = self._calculate_metrics()
            self.recording_results['metrics'] = metrics
            
            # 7. 确定准出状态
            exit_status = self._determine_exit_status()
            self.recording_results['exit_status'] = exit_status
            
            # 8. 发布记录事件
            self._publish_recording_event()
            
            print(f"   ✓ 记录流程完成，状态: {exit_status}")
            
        except Exception as e:
            error_msg = f"记录过程出错: {str(e)}"
            self.recording_results['errors'].append(error_msg)
            self.recording_results['exit_status'] = 'failed'
            print(f"   ✗ {error_msg}")
            
            self.event_bus.publish('seef.recorder.error', {
                'error': error_msg,
                'traceback': self._get_traceback()
            })
            
            return self._degraded_result()
        
        return self.recording_results
    
    def _collect_input_data(self, all_results: Optional[Dict[str, Dict]],
                           context: Optional[Dict]) -> Dict[str, Dict]:
        """收集输入数据"""
        data = {}
        
        if all_results:
            data.update(all_results)
        
        # 从上下文收集
        if context:
            for key in ['evaluator', 'discoverer', 'optimizer', 'creator', 'aligner', 'validator']:
                if key in context and key not in data:
                    data[key] = context[key]
        
        return data
    
    def _create_evolution_record(self, subskill: str, results: Dict) -> Optional[EvolutionRecord]:
        """创建进化记录"""
        event_type_map = {
            'evaluator': 'evaluation.completed',
            'discoverer': 'discovery.completed',
            'optimizer': 'optimization.completed',
            'creator': 'creation.completed',
            'aligner': 'alignment.completed',
            'validator': 'validation.completed'
        }
        
        event_type = event_type_map.get(subskill, 'unknown')
        
        # 提取受影响的技能
        skill_name = self._extract_skill_name(results) or 'system'
        
        return EvolutionRecord(
            record_id=f"REC_{subskill}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
            event_type=event_type,
            skill_name=skill_name,
            event_data={
                'subskill': subskill,
                'exit_status': results.get('exit_status'),
                'metrics': results.get('metrics', {}),
                'timestamp': results.get('timestamp')
            },
            timestamp=datetime.now().isoformat(),
            trace_id=self._current_trace_id,
            parent_record=None,
            metadata={
                'recorder_version': self.VERSION,
                'input_hash': self._hash_dict(results)
            }
        )
    
    def _extract_skill_name(self, results: Dict) -> Optional[str]:
        """从结果中提取技能名称"""
        # 尝试各种可能的路径
        if 'created_skills' in results:
            skills = results['created_skills']
            if skills:
                return skills[0].get('skill_name')
        
        if 'validation_reports' in results:
            reports = results['validation_reports']
            if reports:
                return reports[0].get('skill_name')
        
        if 'deviations' in results and results['deviations']:
            return results['deviations'][0].get('skill_name')
        
        return None
    
    def _get_affected_skills(self, input_data: Dict[str, Dict]) -> List[str]:
        """获取受影响的技能列表"""
        skills = set()
        
        for subskill, results in input_data.items():
            # 从创造者结果提取
            if 'created_skills' in results:
                for skill in results['created_skills']:
                    skills.add(skill.get('skill_name', 'unknown'))
            
            # 从验证器结果提取
            if 'validation_reports' in results:
                for report in results['validation_reports']:
                    skills.add(report.get('skill_name', 'unknown'))
        
        return list(skills)
    
    def _create_skill_snapshot(self, skill_name: str) -> Optional[SkillSnapshot]:
        """创建技能快照"""
        skill_path = self.skills_base_path / skill_name
        
        if not skill_path.exists():
            return None
        
        # 计算文件哈希
        file_hashes = {}
        content_summary = {
            'total_files': 0,
            'total_lines': 0,
            'file_types': {}
        }
        
        for file_path in skill_path.rglob('*'):
            if file_path.is_file():
                try:
                    # 计算哈希
                    with open(file_path, 'rb') as f:
                        content = f.read()
                        rel_path = str(file_path.relative_to(skill_path))
                        file_hashes[rel_path] = hashlib.sha256(content).hexdigest()[:16]
                    
                    # 统计
                    content_summary['total_files'] += 1
                    
                    # 统计行数（文本文件）
                    if file_path.suffix in ['.js', '.py', '.md', '.json', '.yaml', '.yml']:
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                lines = len(f.readlines())
                                content_summary['total_lines'] += lines
                        except:
                            pass
                    
                    # 文件类型统计
                    ext = file_path.suffix or 'no_ext'
                    content_summary['file_types'][ext] = content_summary['file_types'].get(ext, 0) + 1
                    
                except Exception:
                    continue
        
        return SkillSnapshot(
            snapshot_id=f"SNAP_{skill_name}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            skill_name=skill_name,
            version=self._extract_version(skill_path),
            file_hashes=file_hashes,
            content_summary=content_summary,
            timestamp=datetime.now().isoformat()
        )
    
    def _extract_version(self, skill_path: Path) -> str:
        """提取技能版本"""
        skill_md = skill_path / 'SKILL.md'
        
        if skill_md.exists():
            try:
                content = skill_md.read_text()
                match = re.search(r'version[:：]\s*v?(\d+\.\d+\.?\d*)', content, re.IGNORECASE)
                if match:
                    return match.group(1)
            except Exception:
                pass
        
        return '1.0.0'
    
    def _update_knowledge_base(self, input_data: Dict[str, Dict]) -> List[Dict]:
        """更新知识库"""
        updates = []
        
        # 更新技能统计
        for subskill, results in input_data.items():
            update = {
                'type': 'subskill_execution',
                'subskill': subskill,
                'timestamp': datetime.now().isoformat(),
                'exit_status': results.get('exit_status')
            }
            updates.append(update)
        
        # 保存到文件
        kb_file = self.records_path / f"kb_update_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(kb_file, 'w') as f:
            json.dump(updates, f, ensure_ascii=False, indent=2)
        
        return updates
    
    def _generate_audit_log(self, input_data: Dict[str, Dict]) -> List[Dict]:
        """生成审计日志"""
        log = []
        
        for subskill, results in input_data.items():
            entry = {
                'timestamp': datetime.now().isoformat(),
                'trace_id': self._current_trace_id,
                'actor': subskill,
                'action': 'execute',
                'resource': self._extract_skill_name(results) or 'system',
                'result': results.get('exit_status'),
                'details': {
                    'metrics': results.get('metrics', {})
                }
            }
            log.append(entry)
        
        return log
    
    def _save_audit_log(self, audit_log: List[Dict]):
        """保存审计日志"""
        log_file = self.records_path / f"audit_{datetime.now().strftime('%Y%m%d')}.jsonl"
        
        with open(log_file, 'a') as f:
            for entry in audit_log:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    
    def _calculate_metrics(self) -> Dict:
        """计算记录指标"""
        return {
            'records_created': len(self.recording_results['records_created']),
            'snapshots_created': len(self.recording_results['snapshots_created']),
            'kb_updates': len(self.recording_results['knowledge_base_updates']),
            'audit_entries': len(self.recording_results['audit_log']),
            'trace_id': self._current_trace_id
        }
    
    def _determine_exit_status(self) -> str:
        """确定准出状态"""
        if self.recording_results['errors']:
            return 'partial_logged'
        
        return 'logged'
    
    def _publish_recording_event(self):
        """发布记录事件"""
        self.event_bus.publish('seef.recording.completed', {
            'timestamp': datetime.now().isoformat(),
            'trace_id': self._current_trace_id,
            'records_created': len(self.recording_results['records_created']),
            'snapshots_created': len(self.recording_results['snapshots_created'])
        })
    
    def _hash_dict(self, data: Dict) -> str:
        """计算字典哈希"""
        json_str = json.dumps(data, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(json_str.encode()).hexdigest()[:16]
    
    def _get_traceback(self) -> str:
        """获取异常跟踪信息"""
        import traceback
        return traceback.format_exc()
    
    def _degraded_result(self) -> Dict[str, Any]:
        """降级结果"""
        return {
            'subskill': 'recorder',
            'version': self.VERSION,
            'timestamp': datetime.now().isoformat(),
            'exit_status': 'degraded',
            'error': '执行过程中发生错误，返回降级结果',
            'partial_results': self.recording_results
        }
    
    def query_evolution_history(self, skill_name: str, days: int = 30) -> List[Dict]:
        """查询技能进化历史"""
        return self.kb.get_evolution_history(skill_name)
    
    def generate_evolution_report(self, skill_name: str) -> Dict:
        """生成进化报告"""
        history = self.query_evolution_history(skill_name)
        
        if not history:
            return {
                'skill_name': skill_name,
                'evolution_count': 0,
                'report': 'No evolution history found'
            }
        
        return {
            'skill_name': skill_name,
            'evolution_count': len(history),
            'first_recorded': history[-1]['timestamp'] if history else None,
            'last_updated': history[0]['timestamp'] if history else None,
            'event_types': list(set(r['event_type'] for r in history)),
            'history': history[:10]  # 最近10条
        }


def main():
    """命令行入口"""
    import argparse
    
    parser = argparse.ArgumentParser(description='SEEF 技能记录器')
    parser.add_argument('--all-results', '-a', type=str, help='所有子技能结果JSON文件')
    parser.add_argument('--trace-id', '-t', type=str, help='追踪ID')
    parser.add_argument('--query', '-q', type=str, help='查询技能进化历史')
    parser.add_argument('--report', '-r', type=str, help='生成技能进化报告')
    parser.add_argument('--output', '-o', type=str, help='输出结果到文件')
    
    args = parser.parse_args()
    
    recorder = SkillRecorder()
    
    if args.query:
        # 查询模式
        history = recorder.query_evolution_history(args.query)
        result = {'skill': args.query, 'history': history}
    elif args.report:
        # 报告模式
        result = recorder.generate_evolution_report(args.report)
    else:
        # 记录模式
        all_results = None
        if args.all_results:
            with open(args.all_results, 'r') as f:
                all_results = json.load(f)
        
        result = recorder.run(all_results=all_results, trace_id=args.trace_id)
    
    # 输出结果
    output_json = json.dumps(result, ensure_ascii=False, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"\n💾 结果已保存: {args.output}")
    else:
        print("\n📊 记录结果:")
        print(output_json)
    
    return result.get('exit_status') in ['logged', 'partial_logged']


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
