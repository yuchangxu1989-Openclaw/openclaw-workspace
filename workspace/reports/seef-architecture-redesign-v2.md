# SEEF自主决策流水线 v2.0 架构重构设计方案

> **文档版本**: v1.0.0  
> **日期**: 2026-03-01  
> **作者**: SEEF架构重构子Agent  
> **状态**: 设计草案  

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [现状问题分析](#2-现状问题分析)
3. [重构后的架构总览](#3-重构后的架构总览)
4. [7子技能集成方案](#4-7子技能集成方案)
5. [决策引擎设计](#5-决策引擎设计)
6. [统一韧性层设计](#6-统一韧性层设计)
7. [ISC-DTO集成方案](#7-isc-dto集成方案)
8. [CRAS知识治理集成](#8-cras知识治理集成)
9. [实施路线图](#9-实施路线图)
10. [附录](#10-附录)

---

## 1. 执行摘要

### 1.1 核心问题

当前SEEF（技能生态进化工厂）存在**架构割裂**问题：
- Python实现的7个子技能（evaluator/discoverer/optimizer/creator/aligner/validator/recorder）位于 `/skills/seef/subskills/`
- Node.js实现的4阶段流水线（detect→analyze→transform→publish）位于 `/skills/seef/evolution-pipeline/`
- **两者完全脱节**：Python子技能未被JS流水线调用

### 1.2 重构目标

设计一个新的SEEF自主决策流水线架构，实现：
1. **7子技能真正集成** —— Python子技能能被有效调用并返回结果
2. **自主决策闭环** —— evaluator结果驱动discoverer→optimizer→creator的决策链
3. **统一韧性层** —— 解决LEP与parallel-subagent的关系，建立统一的子Agent执行层
4. **ISC-DTO双向集成** —— 真正的准入准出关卡
5. **CRAS知识治理** —— 每次进化决策可追溯、可洞察

### 1.3 关键设计决策

| 决策 | 选择 | 理由 |
|:-----|:-----|:-----|
| Python-JS桥接方式 | STDIO JSON RPC | 简单可靠，无需网络栈 |
| 韧性层统一 | LEP作为facade，复用parallel-subagent核心 | 解决引用路径问题，统一接口 |
| 决策引擎位置 | 新增独立DecisionEngine组件 | 实现真正基于评估的决策 |
| 执行模式 | 支持自由编排+固定闭环双模式 | 满足SKILL.md要求 |

---

## 2. 现状问题分析

### 2.1 架构割裂问题

#### 2.1.1 Python子技能现状

根据 `/skills/seef/subskills/` 下的文件分析：

```
subskills/
├── evaluator.py      # 技能评估器 - 多维质量诊断
├── discoverer.py     # 技能发现器 - 识别能力空白和冗余
├── optimizer.py      # 技能优化器 - 生成安全修复方案
├── creator.py        # 技能创造器 - 自动生成新技能原型
├── aligner.py        # 全局标准化对齐器 - 监听标准变更
├── validator.py      # 技能验证器 - 最终裁决
└── recorder.py       # 技能记录器 - 进化知识库
```

每个子技能的接口契约（以evaluator为例）：

```python
# evaluator.py 核心接口
class SkillEvaluator:
    def evaluate(self, skill_path, cras_report=None) -> dict:
        """
        返回结构：
        {
            'subskill': 'evaluator',
            'version': '1.0.0',
            'timestamp': '...',
            'findings': [...],
            'metrics': {
                'integrity': {...},
                'doc_structure': {...},
                'standard_compliance': {...},
                'user_behavior': {...}
            },
            'exit_status': 'ready_for_next' | 'need_investigation' | 'skip'
        }
        """
```

**关键发现**：
- 7个子技能均有明确定义的输入输出契约
- 均通过`exit_status`字段传递准出状态
- 均包含DTO事件总线集成代码（但实现简陋，使用文件系统作为fallback）

#### 2.1.2 JS流水线现状

根据 `/skills/seef/evolution-pipeline/index.js` 分析：

```javascript
// 当前流水线阶段定义（来自ARCHITECTURE.md）
const PIPELINE_STAGES = {
  detect:    '检测技能变更',
  analyze:   '分析影响范围', 
  transform: '执行代码转换',
  publish:   '发布到EvoMap'
};
```

**问题**：
- 流水线4阶段（detect→analyze→transform→publish）与7子技能完全不对应
- 实际实现的是"EvoMap自动化发布流水线"而非"SEEF自主决策流水线"
- 评估逻辑内嵌在analyze阶段，未调用独立的evaluator子技能

#### 2.1.3 引用证据

```javascript
// index.js 第16-25行
import { EvoMapClient } from './lib/evomap-client.js';
import { DTOAdapter } from './lib/dto-adapter.js';
// ...
// 完全没有导入或引用任何Python子技能的代码
```

```python
# evaluator.py 第9-12行
class SkillEvaluator:
    def __init__(self, isc_client=None, cras_client=None):
        # isc_client和cras_client均为可选，实际从未被注入
        self.isc_client = isc_client
        self.cras_client = cras_client
```

**结论**：两个组件是**完全独立的实现**，存在架构层面的割裂。

### 2.2 实现偏差问题

#### 2.2.1 当前实现 vs 目标定位

| 维度 | 当前实现 | 目标定位 | 差距 |
|:-----|:---------|:---------|:-----|
| 核心功能 | EvoMap发布自动化 | 技能自主进化 | 根本性偏差 |
| 决策机制 | 静态规则匹配 | 基于评估的动态决策 | 缺乏决策引擎 |
| 反馈闭环 | 开环（发布后结束） | 闭环（评估→决策→执行→验证→记录） | 无闭环 |
| 标准集成 | 硬编码检查点 | ISC动态检查点 | 集成不足 |
| 知识治理 | 简单日志 | CRAS洞察驱动 | 未接入CRAS |

#### 2.2.2 缺失的决策引擎

当前流水线（来自ARCHITECTURE.md Stage 2）：

```yaml
# 当前决策逻辑（静态规则）
rules:
  - name: "auto_pass"
    condition: "score >= 90 AND critical_issues == 0"
    action: "SKIP_OPTIMIZE"
    
  - name: "auto_optimize"
    condition: "score >= 70 AND score < 90 AND auto_fixable_issues > 0"
    action: "EXECUTE_OPTIMIZE"
```

**问题**：
- 决策基于简单的阈值判断，未利用7子技能的能力
- 未考虑能力空白（discoverer输出）、优化方案（optimizer输出）
- 不支持"根据评估结果决定是否需要发现→优化→创建"的动态流程

### 2.3 LEP集成问题

#### 2.3.1 LEP设计意图

根据 `/skills/lep-executor/SKILL.md`：

```markdown
## 架构设计
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Execution Layer (执行层)                                                          │
│   ┌───────────────────────────────────────────────────────────────┐                │
│   │              Resilience Core (复用 parallel-subagent)          │                │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │                │
│   │  │ Retry    │  │ Circuit  │  │ Timeout  │  │ Connection   │   │                │
│   │  │ Handler  │  │ Breaker  │  │ Manager  │  │ Pool         │   │                │
```

**问题**：LEP试图复用`parallel-subagent`的韧性组件，但：

```javascript
// parallel-subagent/index.js（根据SKILL.md分析）
// 依赖 openclaw-sessions 扩展提供子Agent能力
const { spawnSubagent } = require('openclaw-sessions'); // 此扩展不存在
```

#### 2.3.2 引用路径问题

```javascript
// LEP预期使用方式（来自SKILL.md）
const { executeRule, execute, health } = require('./skills/lep-executor');

// 实际引用路径问题：
// 1. parallel-subagent 尝试 require('openclaw-sessions') - 模块不存在
// 2. LEP 尝试复用 parallel-subagent，但后者本身无法运行
```

### 2.4 ISC-DTO集成不足

根据 `/skills/isc-core/SKILL.md`：

```javascript
// ISC只提供规范，不拥有执行权
// ✅ 正确：ISC 提供检查点
isc.registerCheckpoints([
  'quality.md.length',
  'naming.skill.display'
]);

// DTO 自由组合检查序列
const checkpoints = isc.getCheckpointsForPhase('verify');
```

**问题**：
- 当前流水线未动态查询ISC检查点，而是硬编码
- 未实现ISC-CTO边界分离，流水线自行决定标准
- 缺乏ISC-DTO握手机制（准入准出关卡）

### 2.5 问题总结

```
┌─────────────────────────────────────────────────────────────────────┐
│                         核心问题总结                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 【架构割裂】                                                     │
│     Python 7子技能 ←──✗──→ Node.js 4阶段流水线                     │
│     两者独立实现，互不调用                                           │
│                                                                     │
│  2. 【实现偏差】                                                     │
│     "EvoMap发布流水线" ≠ "SEEF自主决策流水线"                        │
│     缺乏基于评估结果的动态决策引擎                                    │
│                                                                     │
│  3. 【LEP失效】                                                      │
│     LEP → parallel-subagent → openclaw-sessions(不存在)             │
│     韧性层无法实际运行                                               │
│                                                                     │
│  4. 【ISC脱节】                                                      │
│     硬编码标准检查点，未动态查询ISC                                   │
│     未实现ISC-DTO准入准出关卡                                        │
│                                                                     │
│  5. 【CRAS缺失】                                                     │
│     未接入用户意图洞察，进化缺乏用户视角                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 重构后的架构总览

### 3.1 架构目标视图

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                           SEEF自主决策流水线 v2.0                                     │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                         触发层 (Trigger Layer)                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │   │
│  │  │ Git Hook │  │ 定时任务 │  │ DTO事件  │  │ 手动触发 │                      │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                      │   │
│  └───────┼─────────────┼─────────────┼─────────────┼──────────────────────────────┘   │
│          │             │             │             │                                  │
│          └─────────────┴─────────────┴─────────────┘                                  │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                      决策引擎 (Decision Engine)                               │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐ │   │
│  │  │  • 解析evaluator评估结果                                                  │ │   │
│  │  │  • 根据exit_status和metrics决定后续流程                                     │ │   │
│  │  │  • 支持自由编排模式和固定闭环模式                                            │ │   │
│  │  │  • 生成执行计划（子技能调用序列）                                            │ │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                     Python子技能执行层 (Subskill Runtime)                     │   │
│  │                                                                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │  evaluator   │──│ discoverer   │──│  optimizer   │──│   creator    │       │   │
│  │  │   (评估器)    │  │  (发现器)     │  │  (优化器)     │  │  (创造器)     │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │          │                                                                  │   │
│  │          ▼                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                        │   │
│  │  │   aligner    │──│  validator   │──│  recorder    │                        │   │
│  │  │ (标准化对齐)  │  │  (验证器)     │  │  (记录器)     │                        │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                        │   │
│  │                                                                               │   │
│  │  【统一韧性层】LEP Executor (facade) + parallel-subagent (core)              │   │
│  │                                                                               │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                       │
│                              ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                      外部集成层 (Integration Layer)                           │   │
│  │                                                                               │   │
│  │  ┌────────────┐      ┌────────────┐      ┌────────────┐                       │   │
│  │  │ ISC-DTO    │◄────►│ EvoMap     │◄────►│ CRAS       │                       │   │
│  │  │ 标准检查点  │      │ 发布接口    │      │ 知识治理    │                       │   │
│  │  └────────────┘      └────────────┘      └────────────┘                       │   │
│  │                                                                               │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐ │   │
│  │  │                     状态机 (State Machine)                               │ │   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │ │   │
│  │  │  │  IDLE   │─▶│EVALUATE │─▶│OPTIMIZE │─▶│  TEST   │─▶│DEPLOYED │        │ │   │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │ │   │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 架构组件职责

| 组件 | 职责 | 技术选型 | 理由 |
|:-----|:-----|:---------|:-----|
| **决策引擎** | 解析评估结果，生成执行计划 | Node.js | 与流水线主控同技术栈，易于集成 |
| **子技能运行时** | 统一调用7个Python子技能 | Python STDIO RPC | 简单可靠，无需网络依赖 |
| **LEP韧性层** | 提供重试/熔断/超时/连接池 | LEP(facade)+parallel-subagent(core) | 解决引用路径问题，统一接口 |
| **ISC-DTO握手** | 准入准出标准检查 | HTTP API | ISC已有API定义 |
| **CRAS集成** | 用户意图洞察与知识记录 | 事件订阅 | CRAS已有事件总线 |

### 3.3 数据流架构

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              数据流全景                                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  触发                                                                                │
│    │                                                                                 │
│    ▼                                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │
│  │   决策引擎   │───▶│  evaluator  │───▶│  discoverer │───▶│  optimizer  │           │
│  │             │    │             │    │             │    │             │           │
│  │ 输入:技能路径 │    │ 输出:评估报告 │    │ 输出:发现报告 │    │ 输出:优化计划 │           │
│  │ 输出:执行计划 │    │ exit_status │    │ gaps[]      │    │ plans[]     │           │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘           │
│         │                      │                │                │                  │
│         │                      └────────────────┴────────────────┘                  │
│         │                                      │                                     │
│         │                                      ▼                                     │
│         │                            ┌─────────────────┐                            │
│         │                            │  决策点:基于结果   │                            │
│         │                            │  决定后续子技能   │                            │
│         │                            └────────┬────────┘                            │
│         │                                     │                                      │
│         ▼                                     ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                           条件分支（自由编排）                               │    │
│  │                                                                             │    │
│  │   exit_status='ready_for_next' ────▶ 继续到creator/aligner/validator/recorder │    │
│  │   exit_status='need_investigation' ──▶ 再次discoverer（深入分析）              │    │
│  │   gaps.length > 0 ──────────────────▶ 触发creator（创建新技能）                │    │
│  │   plans.length > 0 ─────────────────▶ 执行optimizer                            │    │
│  │                                                                             │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│         │                                                                            │
│         ▼                                                                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                               │
│  │   creator   │───▶│   aligner   │───▶│  validator  │                               │
│  │             │    │             │    │             │                               │
│  │ 创建新技能   │    │ ISC标准对齐  │    │ 最终验证    │                               │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                               │
│                                               │                                      │
│                                               ▼                                      │
│                                         ┌─────────────┐                              │
│                                         │  recorder   │                              │
│                                         │             │                              │
│                                         │ 记录进化历史 │                              │
│                                         │ CRAS洞察    │                              │
│                                         └─────────────┘                              │
│                                               │                                      │
│                                               ▼                                      │
│                                         ┌─────────────┐                              │
│                                         │  EvoMap     │                              │
│                                         │  发布       │                              │
│                                         └─────────────┘                              │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 7子技能集成方案

### 4.1 集成策略选择

经过评估，选择**STDIO JSON RPC**作为Python-JS桥接方案：

| 方案 | 优点 | 缺点 | 选择理由 |
|:-----|:-----|:-----|:---------|
| **STDIO JSON RPC** | 简单可靠，无网络依赖，易于调试 | 进程间通信开销 | ✅ 最适合，无需额外基础设施 |
| HTTP API | 松耦合，支持远程部署 | 需要服务发现和端口管理 | 当前单节点部署，过度设计 |
| gRPC | 高性能，强类型 | 需要protobuf定义，复杂 | 7子技能接口简单，不需要 |
| 直接require(pyodide) | 无进程切换 | 实验性，兼容性差 | 生产环境风险高 |

### 4.2 子技能适配器设计

为每个Python子技能创建统一的适配层：

```python
# subskills/adapters/base_adapter.py
#!/usr/bin/env python3
"""
SEEF子技能统一适配器基类
提供STDIO JSON RPC接口
"""

import sys
import json
import traceback
from abc import ABC, abstractmethod
from typing import Dict, Any

class SubskillAdapter(ABC):
    """子技能适配器基类"""
    
    def __init__(self):
        self.subskill_name = self.__class__.__name__.replace('Adapter', '').lower()
    
    @abstractmethod
    def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """子技能具体执行逻辑"""
        pass
    
    def run_stdio_rpc(self):
        """STDIO RPC主循环"""
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            
            try:
                request = json.loads(line)
                response = self._handle_request(request)
            except json.JSONDecodeError as e:
                response = self._error_response('INVALID_JSON', str(e))
            except Exception as e:
                response = self._error_response('EXECUTION_ERROR', traceback.format_exc())
            
            # 输出JSON响应
            print(json.dumps(response, ensure_ascii=False), flush=True)
    
    def _handle_request(self, request: Dict) -> Dict:
        """处理RPC请求"""
        method = request.get('method')
        params = request.get('params', {})
        request_id = request.get('id')
        
        if method == 'execute':
            result = self.execute(params)
            return {
                'jsonrpc': '2.0',
                'id': request_id,
                'result': result
            }
        elif method == 'health':
            return {
                'jsonrpc': '2.0',
                'id': request_id,
                'result': {'status': 'healthy', 'subskill': self.subskill_name}
            }
        else:
            return self._error_response('UNKNOWN_METHOD', f'Unknown method: {method}', request_id)
    
    def _error_response(self, code: str, message: str, request_id=None) -> Dict:
        """生成错误响应"""
        return {
            'jsonrpc': '2.0',
            'id': request_id,
            'error': {'code': code, 'message': message}
        }
```

```python
# subskills/adapters/evaluator_adapter.py
#!/usr/bin/env python3
"""
Evaluator子技能适配器
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from adapters.base_adapter import SubskillAdapter
from evaluator import SkillEvaluator

class EvaluatorAdapter(SubskillAdapter):
    """评估器适配器"""
    
    def __init__(self):
        super().__init__()
        self.evaluator = SkillEvaluator()
    
    def execute(self, params: dict) -> dict:
        """执行评估"""
        skill_path = params.get('skill_path')
        cras_report = params.get('cras_report')
        
        if not skill_path:
            return {'exit_status': 'error', 'error': 'Missing skill_path'}
        
        result = self.evaluator.evaluate(skill_path, cras_report)
        
        # 确保包含标准输出字段
        return {
            'subskill': 'evaluator',
            'version': result.get('version', '1.0.0'),
            'timestamp': result.get('timestamp'),
            'exit_status': result.get('exit_status', 'unknown'),
            'findings': result.get('findings', []),
            'metrics': result.get('metrics', {}),
            'isc_compliance_score': result.get('metrics', {}).get('standard_compliance', {}).get('compliance_score', 0)
        }

if __name__ == '__main__':
    adapter = EvaluatorAdapter()
    adapter.run_stdio_rpc()
```

### 4.3 JS端子技能客户端

```javascript
// evolution-pipeline/src/subskills/subskill-client.js
/**
 * SEEF子技能统一客户端
 * 通过STDIO JSON RPC调用Python子技能
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SubskillClient {
  constructor(subskillName, options = {}) {
    this.subskillName = subskillName;
    this.adapterPath = path.join(
      __dirname, 
      '../../../subskills/adapters',
      `${subskillName}_adapter.py`
    );
    this.timeout = options.timeout || 120000; // 2分钟默认超时
    this.lepExecutor = options.lepExecutor; // 统一韧性层
  }

  /**
   * 执行子技能
   * @param {Object} params - 执行参数
   * @returns {Promise<Object>} 执行结果
   */
  async execute(params) {
    const request = {
      jsonrpc: '2.0',
      method: 'execute',
      params,
      id: this._generateId()
    };

    // 使用LEP统一韧性层执行
    if (this.lepExecutor) {
      return this.lepExecutor.execute({
        type: 'subskill',
        command: 'python3',
        args: [this.adapterPath],
        stdin: JSON.stringify(request),
        timeout: this.timeout,
        retryPolicy: { maxRetries: 2 }
      });
    }

    // 直接执行（降级）
    return this._executeDirect(request);
  }

  /**
   * 直接执行（内部方法）
   */
  _executeDirect(request) {
    return new Promise((resolve, reject) => {
      const child = spawn('python3', [this.adapterPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      // 超时处理
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Subskill ${this.subskillName} execution timeout`));
      }, this.timeout);

      // 收集输出
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 处理完成
      child.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code !== 0) {
          reject(new Error(`Subskill ${this.subskillName} exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const response = JSON.parse(lastLine);

          if (response.error) {
            reject(new Error(`RPC Error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}\nRaw: ${stdout}`));
        }
      });

      // 发送请求
      child.stdin.write(JSON.stringify(request) + '\n');
      child.stdin.end();
    });
  }

  _generateId() {
    return `${this.subskillName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 子技能工厂
export const SubskillFactory = {
  evaluator: (opts) => new SubskillClient('evaluator', opts),
  discoverer: (opts) => new SubskillClient('discoverer', opts),
  optimizer: (opts) => new SubskillClient('optimizer', opts),
  creator: (opts) => new SubskillClient('creator', opts),
  aligner: (opts) => new SubskillClient('aligner', opts),
  validator: (opts) => new SubskillClient('validator', opts),
  recorder: (opts) => new SubskillClient('recorder', opts)
};
```

### 4.4 子技能调用示例

```javascript
// evolution-pipeline/src/subskills/index.js
/**
 * 7子技能统一入口
 */

import { SubskillFactory } from './subskill-client.js';

export class SEEFSubskills {
  constructor(options = {}) {
    this.options = options;
    this.clients = {};
    
    // 初始化所有子技能客户端
    for (const [name, factory] of Object.entries(SubskillFactory)) {
      this.clients[name] = factory(options);
    }
  }

  /**
   * 执行技能评估
   */
  async evaluate(skillPath, crasReport = null) {
    return this.clients.evaluator.execute({
      skill_path: skillPath,
      cras_report: crasReport
    });
  }

  /**
   * 执行技能发现
   */
  async discover(skillPath = null, context = {}) {
    return this.clients.discoverer.execute({
      skill_path: skillPath,
      context
    });
  }

  /**
   * 执行技能优化
   */
  async optimize(evaluatorResults, discovererResults, context = {}) {
    return this.clients.optimizer.execute({
      evaluator_results: evaluatorResults,
      discoverer_results: discovererResults,
      context
    });
  }

  /**
   * 执行技能创建
   */
  async create(optimizerResults, requests = [], context = {}) {
    return this.clients.creator.execute({
      optimizer_results: optimizerResults,
      requests,
      context
    });
  }

  /**
   * 执行标准对齐
   */
  async align(skillPath, iscStandards, context = {}) {
    return this.clients.aligner.execute({
      skill_path: skillPath,
      isc_standards: iscStandards,
      context
    });
  }

  /**
   * 执行技能验证
   */
  async validate(skillPath, creationResults, context = {}) {
    return this.clients.validator.execute({
      skill_path: skillPath,
      creation_results: creationResults,
      context
    });
  }

  /**
   * 执行进化记录
   */
  async record(evolutionContext, results, context = {}) {
    return this.clients.recorder.execute({
      evolution_context: evolutionContext,
      results,
      context
    });
  }
}
```

### 4.5 接口契约规范

为确保JS-Python桥接的稳定性，定义标准接口契约：

```typescript
// 子技能标准输出接口
interface SubskillOutput {
  subskill: string;           // 子技能名称
  version: string;            // 子技能版本
  timestamp: string;          // ISO8601时间戳
  exit_status: ExitStatus;    // 准出状态
  findings?: Finding[];       // 发现项列表
  metrics?: Metrics;          // 量化指标
  error?: ErrorInfo;          // 错误信息（如失败）
}

type ExitStatus = 
  | 'ready_for_next'      // 准备进入下一阶段
  | 'need_investigation'  // 需要进一步调查
  | 'optimization_needed' // 需要优化
  | 'critical_gaps_found' // 发现关键空白
  | 'failed'              // 执行失败
  | 'skip';               // 跳过（无需执行）

interface Finding {
  level: 'error' | 'warning' | 'info';
  type: string;
  message: string;
  recommendation?: string;
}

interface Metrics {
  // 各子技能特定的指标
  [key: string]: any;
}
```

---

## 5. 决策引擎设计

### 5.1 设计原则

决策引擎是重构的核心，负责：
1. 解析evaluator的`exit_status`和`metrics`
2. 根据当前状态决定下一步执行的子技能
3. 支持"自由编排"和"固定闭环"两种模式
4. 集成ISC-DTO准入准出检查

### 5.2 决策引擎架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          决策引擎 (Decision Engine)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      决策上下文 (DecisionContext)                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ evaluator   │  │ discoverer  │  │ optimizer   │  │   creator   │  │  │
│  │  │   results   │  │   results   │  │   results   │  │   results   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      决策规则引擎 (Rule Engine)                        │  │
│  │                                                                       │  │
│  │   ┌─────────────────────────────────────────────────────────────┐    │  │
│  │   │  规则定义 (YAML/JSON)                                         │    │  │
│  │   │  ─────────────────────────────────────────────────────────   │    │  │
│  │   │  - condition: "evaluator.exit_status == 'ready_for_next'"    │    │  │
│  │   │    action: "proceed_to_discoverer"                            │    │  │
│  │   │                                                                   │    │  │
│  │   │  - condition: "discoverer.gaps.length > 0"                    │    │  │
│  │   │    action: "trigger_creator"                                  │    │  │
│  │   │                                                                   │    │  │
│  │   │  - condition: "optimizer.plans.length > 0"                    │    │  │
│  │   │    action: "execute_optimizer"                                │    │  │
│  │   └─────────────────────────────────────────────────────────────┘    │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      ISC-DTO准入准出关卡                               │  │
│  │                                                                       │  │
│  │   每个决策点前检查:                                                     │  │
│  │   1. ISC标准符合性 (isc.check())                                       │  │
│  │   2. DTO事件总线状态 (dto.getStatus())                                 │  │
│  │   3. 决策授权 (dto.getAuthorization())                                 │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      执行计划生成器 (Plan Generator)                   │  │
│  │                                                                       │  │
│  │   输出: ExecutionPlan                                                 │  │
│  │   {                                                                   │  │
│  │     planId: "plan_20260301_001",                                      │  │
│  │     steps: [                                                          │  │
│  │       { subskill: "evaluator", params: {...}, checkpoints: [...] },   │  │
│  │       { subskill: "discoverer", params: {...}, checkpoints: [...] },  │  │
│  │       { decision: "conditional_branch", condition: "..." },           │  │
│  │       { subskill: "optimizer", params: {...}, checkpoints: [...] },   │  │
│  │       ...                                                             │  │
│  │     ],                                                                │  │
│  │     mode: "flexible" | "fixed"                                        │  │
│  │   }                                                                   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 决策引擎实现

```javascript
// evolution-pipeline/src/decision-engine/index.js
/**
 * SEEF决策引擎
 * 基于子技能输出决定执行流程
 */

import { SEEFSubskills } from '../subskills/index.js';
import { ISCGateway } from '../integration/isc-gateway.js';
import { DTOGateway } from '../integration/dto-gateway.js';

export class DecisionEngine {
  constructor(options = {}) {
    this.subskills = new SEEFSubskills(options);
    this.iscGateway = new ISCGateway(options.isc);
    this.dtoGateway = new DTOGateway(options.dto);
    this.mode = options.mode || 'flexible'; // 'flexible' | 'fixed'
    this.rules = this._loadDecisionRules();
  }

  /**
   * 主决策入口
   * @param {Object} context - 初始上下文
   * @returns {Promise<ExecutionPlan>} 执行计划
   */
  async makeDecision(context = {}) {
    const plan = {
      planId: `plan_${Date.now()}`,
      mode: this.mode,
      steps: [],
      createdAt: new Date().toISOString()
    };

    // 根据模式选择决策路径
    if (this.mode === 'fixed') {
      // 固定闭环模式: evaluator → discoverer → optimizer → creator → aligner → validator → recorder
      plan.steps = await this._generateFixedLoop(context);
    } else {
      // 自由编排模式: 基于evaluator结果动态决策
      plan.steps = await this._generateFlexibleChain(context);
    }

    return plan;
  }

  /**
   * 自由编排模式 - 动态决策链
   */
  async _generateFlexibleChain(context) {
    const steps = [];
    let currentContext = { ...context };
    let shouldContinue = true;

    // Step 1: 强制从evaluator开始
    const evaluatorStep = await this._createSubskillStep('evaluator', currentContext);
    steps.push(evaluatorStep);

    // 执行evaluator获取结果
    const evalResult = await this._executeWithRetry(() => 
      this.subskills.evaluate(
        currentContext.skillPath,
        currentContext.crasReport
      )
    );
    currentContext.evaluatorResult = evalResult;

    // 基于evaluator结果决策
    const nextAction = this._evaluateDecisionRules('evaluator', evalResult);

    switch (nextAction) {
      case 'proceed_to_discoverer':
        steps.push(...await this._chainDiscoverer(currentContext));
        break;
      case 'skip_to_validator':
        // 评估优秀，直接验证
        steps.push(...await this._chainValidator(currentContext));
        break;
      case 'halt_for_investigation':
        // 发现问题，暂停等待人工介入
        steps.push({ type: 'halt', reason: 'investigation_required', result: evalResult });
        shouldContinue = false;
        break;
      default:
        throw new Error(`Unknown action: ${nextAction}`);
    }

    // 如果继续，添加记录步骤
    if (shouldContinue) {
      steps.push(...await this._chainRecorder(currentContext));
    }

    return steps;
  }

  /**
   * 固定闭环模式 - 全量执行
   */
  async _generateFixedLoop(context) {
    const steps = [];
    const subskillSequence = ['evaluator', 'discoverer', 'optimizer', 'creator', 'aligner', 'validator', 'recorder'];

    for (const subskillName of subskillSequence) {
      const step = await this._createSubskillStep(subskillName, context);
      steps.push(step);

      // 每个步骤后添加ISC检查点
      const iscCheckpoint = await this._createISCCheckpoint(subskillName);
      steps.push(iscCheckpoint);
    }

    return steps;
  }

  /**
   * 评估决策规则
   */
  _evaluateDecisionRules(source, result) {
    for (const rule of this.rules) {
      if (rule.source === source && this._checkCondition(rule.condition, result)) {
        console.log(`[DecisionEngine] Rule matched: ${rule.name} -> ${rule.action}`);
        return rule.action;
      }
    }
    return 'proceed_to_discoverer'; // 默认行为
  }

  /**
   * 检查条件
   */
  _checkCondition(condition, result) {
    // 简化版条件求值，实际应使用表达式引擎
    const context = { result };
    
    // 使用Function构造器进行安全求值（生产环境应使用更安全的方案）
    try {
      const fn = new Function('context', `with(context) { return ${condition}; }`);
      return fn(context);
    } catch (e) {
      console.error(`[DecisionEngine] Condition evaluation error: ${e.message}`);
      return false;
    }
  }

  /**
   * 创建子技能步骤
   */
  async _createSubskillStep(subskillName, context) {
    // ISC准入检查
    const iscCheck = await this.iscGateway.checkAdmission(subskillName, context);
    
    return {
      type: 'subskill',
      name: subskillName,
      params: this._buildSubskillParams(subskillName, context),
      iscCheckpoints: iscCheck.required,
      requiresAuthorization: iscCheck.requiresAuth
    };
  }

  /**
   * 创建ISC检查点步骤
   */
  async _createISCCheckpoint(subskillName) {
    return {
      type: 'isc_checkpoint',
      name: `${subskillName}_exit`,
      checks: await this.iscGateway.getExitCheckpoints(subskillName)
    };
  }

  /**
   * 构建子技能参数
   */
  _buildSubskillParams(subskillName, context) {
    // 根据子技能类型构建参数
    const builders = {
      evaluator: () => ({
        skill_path: context.skillPath,
        cras_report: context.crasReport
      }),
      discoverer: () => ({
        skill_path: context.skillPath,
        context: {
          evaluator_result: context.evaluatorResult,
          cras_report: context.crasReport
        }
      }),
      optimizer: () => ({
        evaluator_results: context.evaluatorResult,
        discoverer_results: context.discovererResult,
        context: { cras_report: context.crasReport }
      }),
      // ... 其他子技能
    };

    return builders[subskillName] ? builders[subskillName]() : {};
  }

  /**
   * 决策规则定义
   */
  _loadDecisionRules() {
    return [
      {
        name: 'excellent_skill',
        source: 'evaluator',
        condition: "result.exit_status === 'skip' && result.metrics.standard_compliance.compliance_score >= 0.9",
        action: 'skip_to_validator'
      },
      {
        name: 'needs_investigation',
        source: 'evaluator',
        condition: "result.exit_status === 'need_investigation'",
        action: 'halt_for_investigation'
      },
      {
        name: 'normal_flow',
        source: 'evaluator',
        condition: "result.exit_status === 'ready_for_next'",
        action: 'proceed_to_discoverer'
      }
    ];
  }

  /**
   * Discoverer链
   */
  async _chainDiscoverer(context) {
    const steps = [];
    
    const step = await this._createSubskillStep('discoverer', context);
    steps.push(step);

    const discoverResult = await this._executeWithRetry(() =>
      this.subskills.discover(context.skillPath, {
        evaluator_result: context.evaluatorResult,
        cras_report: context.crasReport
      })
    );
    context.discovererResult = discoverResult;

    // 基于discoverer结果决策
    if (discoverResult.gaps && discoverResult.gaps.length > 0) {
      // 发现能力空白，触发creator
      steps.push(...await this._chainCreator(context));
    }

    if (discoverResult.redundancies && discoverResult.redundancies.length > 0) {
      // 发现冗余，触发optimizer
      steps.push(...await this._chainOptimizer(context));
    }

    return steps;
  }

  /**
   * 带重试的执行（使用LEP韧性层）
   */
  async _executeWithRetry(fn, maxRetries = 2) {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries) {
          const delay = Math.pow(2, i) * 1000; // 指数退避
          console.log(`[DecisionEngine] Retry ${i + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }
}
```

### 5.4 决策规则配置

```yaml
# evolution-pipeline/config/decision-rules.yml
# 决策规则配置

rules:
  # ============== Evaluator决策 ==============
  - id: evaluator_001
    name: excellent_skill_skip
    source: evaluator
    priority: 100
    condition: |
      result.exit_status === 'skip' && 
      result.metrics.standard_compliance.compliance_score >= 0.9 &&
      result.findings.filter(f => f.level === 'warning').length === 0
    action: skip_to_validator
    description: "技能质量优秀，跳过发现/优化阶段"

  - id: evaluator_002
    name: needs_investigation_halt
    source: evaluator
    priority: 90
    condition: "result.exit_status === 'need_investigation'"
    action: halt_for_investigation
    description: "发现问题，暂停等待人工介入"

  - id: evaluator_003
    name: normal_flow_to_discoverer
    source: evaluator
    priority: 10
    condition: "result.exit_status === 'ready_for_next'"
    action: proceed_to_discoverer
    description: "正常流程，进入发现阶段"

  # ============== Discoverer决策 ==============
  - id: discoverer_001
    name: critical_gaps_trigger_creation
    source: discoverer
    priority: 100
    condition: "result.gaps.filter(g => g.severity === 'critical').length > 0"
    action: trigger_creator_for_critical_gaps
    description: "发现关键能力空白，触发技能创建"

  - id: discoverer_002
    name: high_redundancy_trigger_optimization
    source: discoverer
    priority: 90
    condition: "result.redundancies.filter(r => r.consolidation_potential === 'high').length > 0"
    action: trigger_optimizer_for_redundancy
    description: "发现高潜力整合机会，触发优化"

  - id: discoverer_003
    name: no_action_needed
    source: discoverer
    priority: 10
    condition: "result.gaps.length === 0 && result.redundancies.length === 0"
    action: proceed_to_validator
    description: "无需发现/优化，直接验证"

  # ============== Optimizer决策 ==============
  - id: optimizer_001
    name: high_risk_plan_requires_approval
    source: optimizer
    priority: 100
    condition: "result.optimization_plans.some(p => p.risk_level === 'high')"
    action: request_manual_approval
    description: "高风险优化计划需要人工批准"

  - id: optimizer_002
    name: auto_execute_safe_plans
    source: optimizer
    priority: 50
    condition: "result.optimization_plans.every(p => p.risk_level === 'low')"
    action: auto_execute_plans
    description: "低风险计划自动执行"

# 模式配置
modes:
  flexible:
    description: "自由编排模式 - 基于结果动态决策"
    max_iterations: 5
    allow_backtrack: true

  fixed:
    description: "固定闭环模式 - 顺序执行所有子技能"
    sequence: [evaluator, discoverer, optimizer, creator, aligner, validator, recorder]
    fail_fast: true
```

---

## 6. 统一韧性层设计

### 6.1 问题分析

现有问题（来自SKILL.md分析）：

```javascript
// parallel-subagent 尝试引用不存在的扩展
const { spawnSubagent } = require('openclaw-sessions'); // ❌ 模块不存在

// LEP 尝试复用 parallel-subagent
const { ParallelSubagentSpawner } = require('../parallel-subagent'); // ❌ 后者本身无法运行
```

### 6.2 统一方案

采用**LEP作为统一门面(facade)，parallel-subagent作为韧性核心(core)**的架构：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         统一韧性层 (Unified Resilience Layer)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         LEP Executor (Facade)                          │  │
│  │                                                                        │  │
│  │   提供统一API:                                                         │  │
│  │   • execute(command, options)                                          │  │
│  │   • executeRule(ruleId, params)                                        │  │
│  │   • schedule(cron, task)                                               │  │
│  │   • health()                                                           │  │
│  │                                                                        │  │
│  │   职责: 路由到合适的执行器，统一日志和监控                               │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   │                                          │
│                    ┌──────────────┼──────────────┐                          │
│                    │              │              │                          │
│                    ▼              ▼              ▼                          │
│  ┌─────────────────────┐ ┌──────────────┐ ┌──────────────┐                  │
│  │  Subskill Executor  │ │ N-Rule Exec  │ │  Legacy Exec │                  │
│  │  (Python子技能)      │ │ (ISC规则)     │ │ (兼容旧代码)  │                  │
│  └──────────┬──────────┘ └──────┬───────┘ └──────┬───────┘                  │
│             │                   │                │                          │
│             └───────────────────┴────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │              Resilience Core (from parallel-subagent)                  │  │
│  │                                                                        │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐       │  │
│  │  │  Retry     │  │  Circuit   │  │  Timeout   │  │  Pool      │       │  │
│  │  │  Handler   │  │  Breaker   │  │  Manager   │  │  Manager   │       │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘       │  │
│  │                                                                        │  │
│  │  移除对openclaw-sessions的依赖，使用Node.js原生child_process           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 重构后的parallel-subagent

```javascript
// skills/parallel-subagent/resilience-core.js
/**
 * 韧性核心 - 移除openclaw-sessions依赖
 * 使用Node.js原生child_process
 */

import { spawn } from 'child_process';
import EventEmitter from 'events';

export class ResilienceCore extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 重试配置
    this.retryConfig = {
      maxRetries: options.maxRetries || 2,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 10000,
      backoffMultiplier: options.backoffMultiplier || 2
    };
    
    // 熔断器配置
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 30000,
      lastFailureTime: null
    };
    
    // 超时配置
    this.timeoutConfig = {
      default: options.defaultTimeout || 120000
    };
    
    // 连接池（进程池）
    this.processPool = new ProcessPool({
      minSize: options.poolMinSize || 2,
      maxSize: options.poolMaxSize || 10
    });
  }

  /**
   * 执行命令（带完整韧性保护）
   */
  async execute(command, args = [], options = {}) {
    // 1. 熔断器检查
    if (this.circuitBreaker.state === 'OPEN') {
      if (Date.now() - this.circuitBreaker.lastFailureTime > this.circuitBreaker.recoveryTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.failureCount = 0;
      } else {
        throw new CircuitBreakerOpenError('Circuit breaker is open');
      }
    }

    const timeout = options.timeout || this.timeoutConfig.default;
    const maxRetries = options.retryPolicy?.maxRetries ?? this.retryConfig.maxRetries;

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this._executeWithTimeout(command, args, options, timeout);
        
        // 成功：重置熔断器计数
        if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.circuitBreaker.state = 'CLOSED';
        }
        this.circuitBreaker.failureCount = 0;
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // 更新熔断器计数
        this.circuitBreaker.failureCount++;
        if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
          this.circuitBreaker.state = 'OPEN';
          this.circuitBreaker.lastFailureTime = Date.now();
        }
        
        if (attempt < maxRetries) {
          const delay = this._calculateBackoff(attempt);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    
    throw new RetryExhaustedError(`Failed after ${maxRetries + 1} attempts`, lastError);
  }

  /**
   * 带超时的执行
   */
  _executeWithTimeout(command, args, options, timeout) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      // 超时处理
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);

      if (options.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        } else {
          resolve({ stdout, stderr, code });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * 计算退避延迟
   */
  _calculateBackoff(attempt) {
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(delay + jitter, this.retryConfig.maxDelay);
  }
}

// 自定义错误类
export class CircuitBreakerOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class RetryExhaustedError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.originalError = originalError;
  }
}

// 进程池管理
class ProcessPool {
  constructor(options) {
    this.minSize = options.minSize;
    this.maxSize = options.maxSize;
    this.available = [];
    this.active = new Set();
  }
  // ... 进程池实现
}
```

### 6.4 LEP统一门面

```javascript
// skills/lep-executor/index.js
/**
 * LEP韧性执行中心 - 统一门面
 * 整合parallel-subagent的韧性核心
 */

import { ResilienceCore } from '../parallel-subagent/resilience-core.js';
import { createN016Executor } from './executors/n016-repair-loop.js';
import { createN017Executor } from './executors/n017-recurring-pattern.js';
import { createN018Executor } from './executors/n018-global-alignment.js';

export class LEPExecutor {
  constructor(options = {}) {
    this.resilienceCore = new ResilienceCore(options);
    this.executors = {
      subskill: new SubskillExecutor(this.resilienceCore),
      n016: createN016Executor(this.resilienceCore),
      n017: createN017Executor(this.resilienceCore),
      n018: createN018Executor(this.resilienceCore)
    };
    this.walLog = new WALLog(options.walPath || '.lep-wal');
  }

  /**
   * 通用执行接口
   */
  async execute(config) {
    const { type, ...options } = config;
    
    // 写入WAL日志（预写日志，用于故障恢复）
    const logEntry = await this.walLog.append({
      type,
      options,
      status: 'started',
      timestamp: Date.now()
    });

    try {
      const executor = this.executors[type];
      if (!executor) {
        throw new Error(`Unknown executor type: ${type}`);
      }

      const result = await executor.execute(options);
      
      // 更新WAL为成功
      await this.walLog.update(logEntry.id, {
        status: 'completed',
        result,
        completedAt: Date.now()
      });

      return result;
      
    } catch (error) {
      // 更新WAL为失败
      await this.walLog.update(logEntry.id, {
        status: 'failed',
        error: error.message,
        failedAt: Date.now()
      });
      throw error;
    }
  }

  /**
   * 执行ISC规则
   */
  async executeRule(ruleId, params) {
    const ruleMap = {
      'N016': 'n016',
      'N017': 'n017',
      'N018': 'n018'
    };

    const executorType = ruleMap[ruleId];
    if (!executorType) {
      throw new Error(`Unknown ISC rule: ${ruleId}`);
    }

    return this.execute({
      type: executorType,
      ...params
    });
  }

  /**
   * 健康检查
   */
  async health() {
    return {
      status: 'healthy',
      resilienceCore: this.resilienceCore.getState(),
      executors: Object.keys(this.executors),
      walLog: await this.walLog.getStats()
    };
  }
}

// 子技能专用执行器
class SubskillExecutor {
  constructor(resilienceCore) {
    this.resilienceCore = resilienceCore;
  }

  async execute(options) {
    const { command, args, stdin, timeout } = options;
    
    return this.resilienceCore.execute(command, args, {
      stdin,
      timeout,
      cwd: options.cwd,
      env: options.env
    });
  }
}

// 导出单例
export const lep = new LEPExecutor();
export default lep;
```

### 6.5 解决引用路径问题

通过上述重构，LEP与parallel-subagent的关系得到明确：

| 问题 | 解决方案 |
|:-----|:---------|
| parallel-subagent依赖`openclaw-sessions` | 移除该依赖，使用Node.js原生`child_process` |
| LEP引用parallel-subagent失败 | LEP直接import `resilience-core.js`，不再依赖parallel-subagent的index.js |
| 重复代码 | parallel-subagent保留高级API（ParallelSubagentSpawner），底层使用ResilienceCore |

---

## 7. ISC-DTO集成方案

### 7.1 设计目标

实现**真正的准入准出关卡**：
- **准入关卡**：子技能执行前检查ISC标准和DTO状态
- **准出关卡**：子技能执行后验证输出是否符合ISC标准
- **ISC-DTO握手**：标准与调度双向确认

### 7.2 ISC集成架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ISC-DTO集成架构                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         ISC Gateway                                    │  │
│  │                                                                        │  │
│  │   API:                                                                 │  │
│  │   • checkAdmission(subskill, context) → checkpoints[]                │  │
│  │   • checkExit(subskill, result) → complianceReport                   │  │
│  │   • getStandardsForPhase(phase) → standardIds[]                      │  │
│  │   • registerCheckpoints(checkpoints)                                 │  │
│  │                                                                        │  │
│  └───────────────────────────────┬───────────────────────────────────────┘  │
│                                  │                                           │
│          HTTP API                │                                           │
│  ┌───────────────────────────────┼───────────────────────────────────────┐  │
│  │                               │                                       │  │
│  │  ┌─────────────────┐          │          ┌─────────────────┐          │  │
│  │  │   ISC Core      │◄─────────┴─────────►│   DTO Core      │          │  │
│  │  │                 │   ISC-DTO Handshake  │                 │          │  │
│  │  │  • 标准注册表    │◄────────────────────►│  • 事件总线      │          │  │
│  │  │  • 检查点定义    │  1. ISC提供检查点    │  • 状态管理      │          │  │
│  │  │  • 血缘追踪      │  2. DTO确认执行许可  │  • 触发器配置    │          │  │
│  │  └─────────────────┘                      └─────────────────┘          │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 ISC Gateway实现

```javascript
// evolution-pipeline/src/integration/isc-gateway.js
/**
 * ISC网关 - 提供准入准出检查
 */

export class ISCGateway {
  constructor(config = {}) {
    this.iscUrl = config.url || 'http://localhost:3001/isc';
    this.cache = new Map();
    this.cacheTTL = config.cacheTTL || 60000; // 1分钟缓存
  }

  /**
   * 准入检查 - 子技能执行前调用
   */
  async checkAdmission(subskillName, context) {
    const cacheKey = `admission_${subskillName}_${context.skillPath}`;
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    // 调用ISC API获取准入检查点
    const checkpoints = await this._fetchCheckpoints('admission', subskillName, context);
    
    // 执行检查
    const results = await Promise.all(
      checkpoints.map(cp => this._executeCheckpoint(cp, context))
    );

    const failed = results.filter(r => !r.passed);
    
    const result = {
      passed: failed.length === 0,
      checkpoints: results,
      required: failed.length > 0 ? failed.map(f => f.checkpoint) : [],
      requiresAuth: failed.some(f => f.severity === 'critical')
    };

    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * 准出检查 - 子技能执行后调用
   */
  async checkExit(subskillName, result, context) {
    const cacheKey = `exit_${subskillName}_${context.skillPath}`;
    
    // 调用ISC API获取准出检查点
    const checkpoints = await this._fetchCheckpoints('exit', subskillName, context);
    
    // 执行检查
    const checkResults = await Promise.all(
      checkpoints.map(cp => this._executeExitCheckpoint(cp, result, context))
    );

    const failed = checkResults.filter(r => !r.passed);

    return {
      passed: failed.length === 0,
      checkpoints: checkResults,
      complianceScore: this._calculateComplianceScore(checkResults),
      canProceed: failed.every(f => f.severity !== 'critical')
    };
  }

  /**
   * 获取阶段的ISC检查点
   */
  async getCheckpointsForPhase(phase) {
    const response = await fetch(`${this.iscUrl}/checkpoints?phase=${phase}`);
    const data = await response.json();
    return data.checkpoints;
  }

  /**
   * 从ISC获取检查点定义
   */
  async _fetchCheckpoints(type, subskillName, context) {
    // 实际应调用ISC API
    // 以下为模拟实现
    const checkpointMap = {
      'admission': {
        'evaluator': [
          { id: 'skill.path.valid', check: 'path_exists' },
          { id: 'skill.md.exists', check: 'file_exists', params: { file: 'SKILL.md' } }
        ],
        'creator': [
          { id: 'isc.standard.known', check: 'standard_registered' }
        ]
      },
      'exit': {
        'evaluator': [
          { id: 'quality.md.length', check: 'min_length', params: { field: 'metrics.doc_structure.content_length', min: 200 } },
          { id: 'output.format.valid', check: 'schema_valid', params: { schema: 'subskill_output' } }
        ]
      }
    };

    return checkpointMap[type]?.[subskillName] || [];
  }

  /**
   * 执行准入检查点
   */
  async _executeCheckpoint(checkpoint, context) {
    const checkers = {
      path_exists: () => ({
        passed: !!context.skillPath,
        detail: { path: context.skillPath }
      }),
      file_exists: (params) => ({
        passed: true, // 实际应检查文件
        detail: { file: params.file }
      })
    };

    const checker = checkers[checkpoint.check];
    const result = checker ? await checker(checkpoint.params) : { passed: true };

    return {
      checkpoint: checkpoint.id,
      passed: result.passed,
      severity: result.passed ? 'info' : 'error',
      detail: result.detail
    };
  }

  /**
   * 执行准出检查点
   */
  async _executeExitCheckpoint(checkpoint, result, context) {
    const checkers = {
      min_length: (params) => {
        const value = this._getNestedValue(result, params.field);
        return {
          passed: value >= params.min,
          detail: { actual: value, required: params.min }
        };
      },
      schema_valid: (params) => ({
        passed: result.exit_status && result.subskill && result.timestamp,
        detail: { schema: params.schema }
      })
    };

    const checker = checkers[checkpoint.check];
    const checkResult = checker ? await checker(checkpoint.params) : { passed: true };

    return {
      checkpoint: checkpoint.id,
      passed: checkResult.passed,
      severity: checkResult.passed ? 'info' : 'warning',
      detail: checkResult.detail
    };
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((o, p) => o?.[p], obj);
  }

  _calculateComplianceScore(results) {
    const passed = results.filter(r => r.passed).length;
    return passed / results.length;
  }

  _getCache(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.time < this.cacheTTL) {
      return entry.value;
    }
    return null;
  }

  _setCache(key, value) {
    this.cache.set(key, { value, time: Date.now() });
  }
}
```

### 7.4 DTO集成

```javascript
// evolution-pipeline/src/integration/dto-gateway.js
/**
 * DTO网关 - 事件总线集成
 */

export class DTOGateway {
  constructor(config = {}) {
    this.eventBusUrl = config.url || 'http://localhost:3002/dto';
    this.subscriptions = new Map();
  }

  /**
   * 获取DTO状态
   */
  async getStatus(eventType) {
    const response = await fetch(`${this.eventBusUrl}/status/${eventType}`);
    return response.json();
  }

  /**
   * 发布事件
   */
  async publish(eventType, data) {
    const response = await fetch(`${this.eventBusUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        source: 'seef.decision-engine'
      })
    });
    return response.json();
  }

  /**
   * 订阅事件
   */
  async subscribe(eventType, handler) {
    this.subscriptions.set(eventType, handler);
    // 实际应建立WebSocket连接或长轮询
  }

  /**
   * ISC-DTO握手 - 确认执行许可
   */
  async handshake(iscCheckpoints, context) {
    // 1. 向DTO查询当前状态
    const dtoStatus = await this.getStatus('skill.evolution');
    
    // 2. 确认ISC检查点与DTO状态一致
    const aligned = iscCheckpoints.every(cp => {
      return dtoStatus.allowedOperations.includes(cp.id);
    });

    if (!aligned) {
      throw new Error('ISC-DTO handshake failed: checkpoints not aligned with DTO state');
    }

    // 3. 发布握手成功事件
    await this.publish('isc.dto.handshake.completed', {
      context,
      checkpoints: iscCheckpoints,
      timestamp: new Date().toISOString()
    });

    return { aligned, timestamp: Date.now() };
  }
}
```

### 7.5 准入准出流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        准入准出流程                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  子技能执行前 (准入)                                                          │
│  ─────────────────                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ 准备执行 │───▶│ ISC准入检查 │───▶│ DTO状态检查 │───▶│ 执行决策    │        │
│  │         │    │             │    │             │    │             │        │
│  │         │    │ checkpoints │    │ allowedOps  │    │ go/hold     │        │
│  └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                              │               │
│                                                              ▼               │
│                                                    ┌─────────────────┐       │
│                                                    │  handshake()    │       │
│                                                    │  确认双方一致    │       │
│                                                    └─────────────────┘       │
│                                                              │               │
│  ┌───────────────────────────────────────────────────────────┘               │
│  │                                                                           │
│  ▼                                                                           │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        执行子技能                                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  子技能执行后 (准出)                                                          │
│  ─────────────────                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ 执行完成 │───▶│ ISC准出检查 │───▶│ 合规性评分   │───▶│ 决策下一歩  │        │
│  │         │    │             │    │             │    │             │        │
│  │ result  │    │ output      │    │ score       │    │ proceed/    │        │
│  │         │    │ validation  │    │ >= 0.8?     │    │ retry/halt  │        │
│  └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. CRAS知识治理集成

### 8.1 集成目标

- **CRAS洞察输入**：将用户意图洞察作为evaluator和discoverer的输入
- **CRAS洞察输出**：将进化决策上下文记录到CRAS知识库
- **决策可追溯**：每次进化决策的完整上下文可查询

### 8.2 CRAS集成架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CRAS知识治理集成                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  输入: CRAS报告                                                              │
│  ─────────────                                                                │
│  ┌─────────────────┐                                                         │
│  │   CRAS Insight  │                                                         │
│  │                 │                                                         │
│  │  • pain_points  │────────┐                                                │
│  │  • workarounds  │        │                                                │
│  │  • success_rate │        │                                                │
│  │  • user_queries │        │                                                │
│  └─────────────────┘        │                                                │
│                             ▼                                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        决策引擎                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │  │
│  │  │  evaluator  │  │ discoverer  │  │  optimizer  │                   │  │
│  │  │             │  │             │  │             │                   │  │
│  │  │ 接收CRAS   │  │ 分析CRAS   │  │ 基于CRAS    │                   │  │
│  │  │ 报告       │  │ 发现需求   │  │ 制定方案    │                   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  输出: 决策上下文记录                                                         │
│  ───────────────────                                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       recorder 子技能                                  │  │
│  │                                                                        │  │
│  │  记录内容:                                                             │  │
│  │  • evolution_id: 唯一标识                                             │  │
│  │  • trigger: 触发条件                                                  │  │
│  │  • decision_chain: 决策链完整路径                                      │  │
│  │  • subskill_outputs: 各子技能输出                                      │  │
│  │  • isc_compliance: 标准符合性                                          │  │
│  │  • cras_context: 用户意图上下文                                        │  │
│  │  • timestamp: 时间戳                                                   │  │
│  │                                                                        │  │
│  │  输出到:                                                               │  │
│  │  • 本地JSONL文件 (seef/evolution-log.jsonl)                            │  │
│  │  • CRAS知识库 API                                                     │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       CRAS Knowledge Base                              │  │
│  │                                                                        │  │
│  │  可查询:                                                               │  │
│  │  • "哪些技能进化是由用户痛点触发的？"                                    │  │
│  │  • "某个技能的进化历史是什么？"                                          │  │
│  │  • "哪些优化方案最有效？"                                               │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 CRAS Gateway实现

```javascript
// evolution-pipeline/src/integration/cras-gateway.js
/**
 * CRAS网关 - 用户意图洞察集成
 */

export class CRASGateway {
  constructor(config = {}) {
    this.crasUrl = config.url || 'http://localhost:3003/cras';
    this.localLogPath = config.logPath || './logs/cras-integration.jsonl';
  }

  /**
   * 获取CRAS洞察报告
   */
  async getInsightReport(skillPath = null) {
    const url = skillPath 
      ? `${this.crasUrl}/insights?skill=${encodeURIComponent(skillPath)}`
      : `${this.crasUrl}/insights/global`;
       
    const response = await fetch(url);
    return response.json();
  }

  /**
   * 记录进化决策上下文
   */
  async recordDecisionContext(context) {
    const record = {
      type: 'seef.evolution.decision',
      timestamp: new Date().toISOString(),
      data: {
        evolution_id: context.evolutionId,
        trigger: context.trigger,
        decision_chain: context.decisionChain,
        subskill_outputs: context.subskillOutputs,
        isc_compliance: context.iscCompliance,
        cras_context: context.crasContext,
        final_status: context.finalStatus
      }
    };

    // 1. 记录到本地
    await this._appendLocalLog(record);

    // 2. 发送到CRAS知识库
    try {
      await fetch(`${this.crasUrl}/knowledge/evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
    } catch (e) {
      console.warn('[CRAS] Failed to send to CRAS KB, keeping local log only:', e.message);
    }

    return record;
  }

  /**
   * 查询进化历史
   */
  async queryEvolutionHistory(skillPath, options = {}) {
    const params = new URLSearchParams({
      skill: skillPath,
      limit: options.limit || 10,
      ...options
    });
    
    const response = await fetch(`${this.crasUrl}/knowledge/evolution?${params}`);
    return response.json();
  }

  async _appendLocalLog(record) {
    const fs = await import('fs/promises');
    const line = JSON.stringify(record) + '\n';
    await fs.appendFile(this.localLogPath, line, 'utf-8');
  }
}
```

### 8.4 决策上下文记录示例

```json
{
  "type": "seef.evolution.decision",
  "timestamp": "2026-03-01T10:30:00.000Z",
  "data": {
    "evolution_id": "evo_20260301_103000_abc123",
    "trigger": {
      "type": "git_push",
      "skill_path": "/skills/vision-analyzer",
      "commit": "a1b2c3d"
    },
    "decision_chain": [
      { "step": 1, "subskill": "evaluator", "decision": "ready_for_next" },
      { "step": 2, "subskill": "discoverer", "decision": "critical_gaps_found" },
      { "step": 3, "subskill": "optimizer", "decision": "plans_generated" },
      { "step": 4, "subskill": "creator", "decision": "skills_created" },
      { "step": 5, "subskill": "validator", "decision": "passed" }
    ],
    "subskill_outputs": {
      "evaluator": {
        "exit_status": "ready_for_next",
        "compliance_score": 0.75,
        "findings_count": 3
      },
      "discoverer": {
        "gaps_count": 2,
        "redundancies_count": 1,
        "synergies_count": 3
      }
    },
    "isc_compliance": {
      "admission_checks": { "passed": 5, "failed": 0 },
      "exit_checks": { "passed": 8, "failed": 1 },
      "overall_score": 0.93
    },
    "cras_context": {
      "pain_points": ["图像识别速度慢", "不支持批量处理"],
      "workaround_count": 5,
      "success_rate": 0.82
    },
    "final_status": "success",
    "duration_ms": 125000
  }
}
```

---

## 9. 实施路线图

### 9.1 阶段划分

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           实施路线图 (P0/P1/P2)                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  P0: 基础架构 (2周) ──────────────────────────────────────────────────────────────   │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │  Week 1:                                                                       │  │
│  │  • [ ] 创建子技能适配器基类 (base_adapter.py)                                   │  │
│  │  • [ ] 实现evaluator/discoverer适配器                                          │  │
│  │  • [ ] 实现SubskillClient (JS)                                                 │  │
│  │                                                                                │  │
│  │  Week 2:                                                                       │  │
│  │  • [ ] 重构parallel-subagent (移除openclaw-sessions依赖)                        │  │
│  │  • [ ] 实现LEP统一门面                                                          │  │
│  │  • [ ] 集成测试 (evaluator→discoverer流程)                                      │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  P1: 决策引擎 (2周) ──────────────────────────────────────────────────────────────   │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │  Week 3:                                                                       │  │
│  │  • [ ] 实现DecisionEngine核心                                                  │  │
│  │  • [ ] 实现规则引擎和条件求值                                                  │  │
│  │  • [ ] 实现自由编排模式                                                         │  │
│  │                                                                                │  │
│  │  Week 4:                                                                       │  │
│  │  • [ ] 实现固定闭环模式                                                         │  │
│  │  • [ ] 实现ISC-DTO网关                                                          │  │
│  │  • [ ] 集成测试 (完整决策流程)                                                  │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  P2: 集成与优化 (2周) ────────────────────────────────────────────────────────────   │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │  Week 5:                                                                       │  │
│  │  • [ ] 实现所有7子技能适配器                                                    │  │
│  │  • [ ] 实现CRAS网关集成                                                         │  │
│  │  • [ ] 实现recorder子技能输出到CRAS                                            │  │
│  │                                                                                │  │
│  │  Week 6:                                                                       │  │
│  │  • [ ] 端到端集成测试                                                           │  │
│  │  • [ ] 性能优化                                                                 │  │
│  │  • [ ] 文档更新                                                                 │  │
│  │  • [ ] 生产部署                                                                 │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 详细任务清单

#### P0 - 基础架构 (MVP)

| 任务ID | 描述 | 优先级 | 依赖 | 验收标准 |
|:-------|:-----|:-------|:-----|:---------|
| P0-001 | 创建base_adapter.py | 高 | 无 | 提供STDIO RPC框架 |
| P0-002 | 实现evaluator_adapter.py | 高 | P0-001 | 可正确调用evaluator并返回JSON |
| P0-003 | 实现discoverer_adapter.py | 高 | P0-001 | 可正确调用discoverer并返回JSON |
| P0-004 | 实现SubskillClient (JS) | 高 | P0-002, P0-003 | 可通过STDIO调用Python子技能 |
| P0-005 | 重构ResilienceCore | 高 | 无 | 移除openclaw-sessions依赖 |
| P0-006 | 实现LEP门面 | 高 | P0-005 | 提供统一execute接口 |
| P0-007 | P0集成测试 | 高 | P0-004, P0-006 | evaluator→discoverer流程可运行 |

#### P1 - 决策引擎

| 任务ID | 描述 | 优先级 | 依赖 | 验收标准 |
|:-------|:-----|:-------|:-----|:---------|
| P1-001 | 实现DecisionEngine核心 | 高 | P0-007 | 可解析evaluator结果并决策 |
| P1-002 | 实现规则引擎 | 高 | P1-001 | 支持YAML规则配置 |
| P1-003 | 实现自由编排模式 | 高 | P1-002 | evaluator结果驱动动态流程 |
| P1-004 | 实现固定闭环模式 | 中 | P1-002 | 7子技能顺序执行 |
| P1-005 | 实现ISCGateway | 高 | P1-001 | 提供准入准出检查 |
| P1-006 | 实现DTOGateway | 中 | P1-005 | 支持ISC-DTO握手 |
| P1-007 | P1集成测试 | 高 | P1-003, P1-005 | 完整决策流程可运行 |

#### P2 - 集成与优化

| 任务ID | 描述 | 优先级 | 依赖 | 验收标准 |
|:-------|:-----|:-------|:-----|:---------|
| P2-001 | 实现剩余子技能适配器 | 中 | P0-001 | optimizer/creator/aligner/validator/recorder |
| P2-002 | 实现CRASGateway | 中 | P1-007 | 可获取和记录CRAS洞察 |
| P2-003 | 更新recorder输出格式 | 中 | P2-002 | 输出符合CRAS知识库格式 |
| P2-004 | 端到端测试 | 高 | P2-001 | 完整PDCA闭环可运行 |
| P2-005 | 性能基准测试 | 低 | P2-004 | 记录性能基线 |
| P2-006 | 文档更新 | 中 | P2-004 | ARCHITECTURE.md更新 |
| P2-007 | 生产部署 | 高 | P2-006 | 在生产环境运行 |

### 9.3 回滚计划

```yaml
rollback_plan:
  triggers:
    - metric: "success_rate"
      threshold: "< 0.8"
      action: "immediate_rollback"
    
    - metric: "average_execution_time"
      threshold: "> 300s"
      action: "performance_investigation"
    
    - metric: "error_rate"
      threshold: "> 0.1"
      action: "immediate_rollback"

  rollback_steps:
    - stop_new_executions
    - wait_active_complete
    - restore_previous_version
    - verify_rollback
    - notify_stakeholders

  verification:
    - run_smoke_tests
    - check_metrics
    - validate_subskill_connectivity
```

### 9.4 风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|:-----|:-------|:-----|:---------|
| Python-JS桥接性能问题 | 中 | 中 | 实现连接池复用；提供降级方案 |
| ISC-DTO接口变更 | 低 | 高 | 使用适配器模式隔离变化 |
| 子技能输出格式不兼容 | 中 | 高 | 在适配器层做格式转换 |
| LEP韧性层不稳定 | 低 | 高 | 保留直接执行作为降级方案 |
| 决策规则复杂度过高 | 中 | 中 | 从简单规则开始，逐步迭代 |

---

## 10. 附录

### 10.1 术语表

| 术语 | 说明 |
|:-----|:-----|
| SEEF | Skill Ecosystem Evolution Foundry，技能生态进化工厂 |
| ISC | Intelligent Standards Center，智能标准中心 |
| DTO | Decentralized Task Orchestrator，去中心化任务编排器 |
| CRAS | Cognitive Reflection & Action System，认知反思与行动系统 |
| LEP | Local Execution Protocol，本地执行协议 |
| STDIO RPC | 基于标准输入输出的远程过程调用 |
| 准入关卡 | 子技能执行前的ISC标准检查 |
| 准出关卡 | 子技能执行后的ISC标准验证 |
| 自由编排 | 基于评估结果动态决定执行流程 |
| 固定闭环 | 按固定顺序执行所有子技能 |

### 10.2 参考文献

1. `/skills/seef/SKILL.md` - SEEF整体定位与7子技能职责
2. `/skills/seef/evolution-pipeline/ARCHITECTURE.md` - 现有流水线架构
3. `/skills/seef/evolution-pipeline/state-machine.md` - 状态机设计
4. `/skills/lep-executor/SKILL.md` - LEP定位
5. `/skills/parallel-subagent/SKILL.md` - 并行子Agent定位
6. `/skills/isc-core/SKILL.md` - ISC智能标准中心

### 10.3 变更日志

| 版本 | 日期 | 变更 |
|:-----|:-----|:-----|
| 1.0.0 | 2026-03-01 | 初始版本，完整架构重构方案 |

---

**文档结束**

> 本设计方案遵循以下约束：
> 1. 保持7个子技能的Python实现，不做重写
> 2. 架构支持"自由编排"和"固定闭环"两种模式
> 3. 解决LEP引用路径问题，使其能实际运行
> 4. 所有设计决策引用ISC规则或用户要求作为依据
