# 技能发现→技能创造→技能注册 全链路闭环审计

> 审计时间：2026-03-09 16:08 CST
> 审计范围：SEEF、auto-skill-discovery、skill-creator (OpenClaw内置)、isc-capability-anchor-sync
> 结论：**链路未闭环**，存在 3 处硬断点 + 2 处软断点

---

## 一、当前链路图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    当前实际运行的链路                                  │
└─────────────────────────────────────────────────────────────────────┘

[每天09:00 cron]                              [手动/LLM触发]
       │                                            │
       ▼                                            ▼
┌──────────────┐                        ┌────────────────────┐
│ auto-skill-  │    ❌ 断点①           │ OpenClaw 内置      │
│ discovery.sh │ ──输出JSON──→ 无人消费  │ skill-creator      │
│ (bash脚本)   │    (仅告警)             │ (SKILL.md描述)     │
└──────────────┘                        └────────────────────┘
                                               │
                                        仅供 agent 在对话中
                                        手动调用，无自动触发

[SEEF event-bridge.js 事件路由表]
       │
       ▼
┌──────────────┐  事件总线   ┌──────────────┐  事件总线   ┌──────────────┐
│ discoverer   │────────────→│   creator    │────────────→│  validator   │
│ (Python/JS)  │ seef.skill. │ (Python/JS)  │ seef.skill. │ (Python/JS)  │
│              │  discovered │              │  created    │              │
└──────────────┘            └──────────────┘            └──────────────┘
       ▲                                                       │
       │                                              seef.skill.validated
  seef.skill.                                                  │
  evaluated                                                    ▼
       │                                              ┌──────────────┐
┌──────────────┐                                      │   recorder   │
│  evaluator   │                                      │ (Python/JS)  │
│ (Python/JS)  │                                      └──────────────┘
└──────────────┘

[每小时(?)] ── 无cron调度 ──❌ 断点④
       │
       ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│ isc-capability-anchor-   │ 写入 →   │  CAPABILITY-ANCHOR.md    │
│ sync (node脚本)          │          │  (全量扫描生成)           │
└──────────────────────────┘          └──────────────────────────┘
```

---

## 二、逐环节审计

### 2.1 发现→创造闭环

#### 2.1.1 auto-skill-discovery.sh (bash, cron每天09:00)

| 项目 | 状态 |
|------|------|
| 扫描范围 | `scripts/*.sh` + `scripts/*.js` vs `skills/public/` |
| 输出物 | `logs/wild-scripts-discovery.json` (JSON文件) |
| 告警 | stdout打印 🚨 新增脚本数量（仅日志） |
| 发事件？ | ❌ **不发任何事件到event-bus** |
| 触发creator？ | ❌ **不触发** |
| 后续处理 | 完全依赖人工阅读日志后手动处理 |

**断点①**：auto-skill-discovery.sh 是纯bash脚本，输出JSON文件+stdout告警，**不与事件总线集成**，不触发SEEF discoverer/creator，也不通知任何agent。扫描结果就是"写了没人看"。

#### 2.1.2 SEEF discoverer (Python subskills/discoverer.py + JS sub-skills/discoverer/index.cjs)

| 项目 | 状态 |
|------|------|
| 扫描范围 | `skills/` 目录下所有SKILL.md |
| 功能 | 分析能力空白、冗余、协同机会 |
| 与auto-skill-discovery关系 | ❌ **完全无关** — 不读取wild-scripts-discovery.json |
| 触发方式 | SEEF event-bridge路由 或 seef.py主程序调用 |

**断点②**：SEEF discoverer 和 auto-skill-discovery.sh 是**两套完全独立的发现机制**，无任何数据交叉。
- auto-skill-discovery.sh → 找 scripts/ 中未技能化的bash/js脚本
- SEEF discoverer → 分析 skills/ 中已有技能的能力空白

两者互补但**不衔接**。discoverer的发现结果可以通过event-bridge路由到creator (`seef.skill.discovered → creator`)，**但前提是event-bridge在运行**。

#### 2.1.3 SEEF event-bridge.js — 关键路由层

| 路由规则 | 目标子技能 |
|----------|------------|
| `seef.skill.discovered` → | `creator` |
| `seef.skill.created` → | `validator` |
| `seef.skill.validated` → | `recorder` |

event-bridge的路由表**设计上是闭环的**，但：

**断点③**：**event-bridge.js 没有定时调度**！
- 不在crontab中
- 不在cron-dispatch-runner中
- 不在任何定时任务中
- 需要手动 `node event-bridge.js run` 才处理事件

这意味着即使discoverer发了事件，如果没人调用event-bridge.js去处理，事件就堆积在bus里没人消费。

#### 2.1.4 OpenClaw 内置 skill-creator (系统级)

| 项目 | 状态 |
|------|------|
| 位置 | `/usr/lib/node_modules/openclaw/skills/skill-creator/` |
| 功能 | 提供技能创建的指导和脚本（init_skill.py, package_skill.py） |
| 触发方式 | agent在对话中匹配description后手动使用 |
| 与SEEF creator关系 | ❌ **完全独立** — 不同的创建路径 |

存在**两套creator**：
1. SEEF creator：基于optimizer结果自动生成技能原型（程序化，模板驱动）
2. OpenClaw skill-creator：agent对话中使用的技能创建向导（交互式，人在回路）

两套系统**互不相知**，创建的技能也不会互相通知。

---

### 2.2 创造→注册闭环

| 检查项 | 状态 | 详情 |
|--------|------|------|
| SEEF creator创建后→自动注册CAPABILITY-ANCHOR.md？ | ❌ 不自动 | creator只生成文件，不调用anchor-sync |
| OpenClaw skill-creator创建后→自动注册？ | ❌ 不自动 | 只生成.skill文件包，不更新锚点 |
| ISC规则是否要求自动注册？ | ✅ 有规则 | `rule.capability-anchor-auto-register-001` + `rule.skill-post-creation-guard-001` |
| ISC规则是否被程序化执行？ | ⚠️ 部分 | hook脚本存在但只做**检测**，不做**修复** |
| isc-capability-anchor-sync何时运行？ | ❌ **无定时调度** | SKILL.md声称"每小时"，但crontab中无对应条目 |

**断点④**：**isc-capability-anchor-sync 没有crontab调度！**
- SKILL.md描述"自动每小时执行"，但crontab中**找不到**该脚本
- 只能手动 `node skills/isc-capability-anchor-sync/index.js` 执行
- 最近一次生成时间：2026/3/9 16:05（可能是手动触发或heartbeat触发）

**断点⑤**：skill-post-creation-guard-001.sh 存在，但：
- 它是**检测脚本**，不是**自动修复脚本**
- 只报告哪些技能未注册，不自动执行注册
- 且同样不在crontab中，只能手动调用

---

### 2.3 注册→发现闭环（反向）

| 检查项 | 状态 | 详情 |
|--------|------|------|
| 技能删除/移动后，发现器能检测？ | ⚠️ 部分 | dead-skill-detector.sh 每周六扫描30天未改+低引用技能 |
| 锚点与实际不一致时告警？ | ⚠️ 有但弱 | isc-skill-index-auto-update hook存在，但只做简单计数比较（TODO注释：deep alignment未实现） |
| CAPABILITY-ANCHOR.md全量重生成？ | ✅ 设计OK | anchor-sync是全量扫描+覆盖生成，不存在残留问题 |

反向链路相对较好，因为anchor-sync是**全量扫描重写**模式。只要它执行，就会反映最新状态。但问题是**它不定时执行**。

---

### 2.4 SEEF进化流水线

| 比较维度 | auto-skill-discovery.sh | SEEF discoverer |
|----------|------------------------|-----------------|
| 扫描目标 | `scripts/*.sh/*.js`（野生脚本） | `skills/*/SKILL.md`（已有技能） |
| 功能定位 | "哪些脚本还没变成技能" | "技能生态有哪些空白/冗余" |
| 输出格式 | JSON文件 | Python dict / 事件 |
| 下游消费者 | 无（断点） | SEEF creator（通过event-bridge） |
| 运行方式 | cron每天09:00 | 手动/event-bridge触发 |
| 关系 | **互补但不衔接** | — |

SEEF进化流水线（seef.py PDCA模式）**设计上包含"从发现到创建"的能力**：
```
evaluator → discoverer → optimizer → creator → aligner → validator → recorder
```

但这条流水线：
1. **不包含**"从野生脚本生成技能"的能力 — SEEF discoverer扫描的是skills/目录，不是scripts/目录
2. SEEF的creator只接受optimizer的优化计划（类型为enhance/create_skill），不直接消费auto-skill-discovery的输出
3. SEEF流水线自身也没有定时调度

---

## 三、断点清单

| # | 断点 | 严重性 | 位置 | 影响 |
|---|------|--------|------|------|
| ① | auto-skill-discovery.sh不发事件 | 🔴 高 | seef/auto-skill-discovery.sh | 发现结果无人消费 |
| ② | SEEF discoverer不读取wild-scripts结果 | 🔴 高 | subskills/discoverer.py | 两套发现不衔接 |
| ③ | event-bridge.js无定时调度 | 🔴 高 | seef/event-bridge.js | 事件路由形同虚设 |
| ④ | isc-capability-anchor-sync无cron | 🟡 中 | isc-capability-anchor-sync/index.js | 能力锚点不定时更新 |
| ⑤ | post-creation-guard只检测不修复 | 🟡 中 | isc-hooks/rule.skill-post-creation-guard-001.sh | 发现问题不自动解决 |

---

## 四、修复建议（按优先级）

### P0：让event-bridge定时运行
```bash
# 加入crontab — 每5分钟处理一次SEEF事件
*/5 * * * * cd /root/.openclaw/workspace && flock -xn /tmp/seef-event-bridge.lock /usr/bin/node skills/seef/event-bridge.js run >> infrastructure/logs/seef-event-bridge.log 2>&1
```
**影响**：解锁断点③，让SEEF内部 discoverer→creator→validator→recorder 链路真正运转。

### P1：auto-skill-discovery.sh输出发事件
在脚本末尾增加事件发射：
```bash
# 如果有新野生脚本，发事件到event-bus
if [ "$COUNT" -gt 0 ]; then
  node -e "
    const bus = require('$WORKSPACE/infrastructure/event-bus/bus-adapter.js');
    bus.emit('seef.wild_scripts.discovered', {
      count: $COUNT,
      output_file: '$OUTPUT_FILE',
      scan_time: '$(date -Iseconds)'
    }, 'auto-skill-discovery');
  " 2>/dev/null || true
fi
```
并在event-bridge.js的ROUTES中增加：
```javascript
'seef.wild_scripts.discovered': 'discoverer',  // 野生脚本发现 → 发现器分析
```
**影响**：解锁断点①，让野生脚本发现能触发SEEF流水线。

### P2：isc-capability-anchor-sync加入crontab
```bash
# 每小时整点运行（与SKILL.md声称一致）
0 * * * * flock -xn /tmp/cap-anchor-sync.lock /usr/bin/node /root/.openclaw/workspace/skills/isc-capability-anchor-sync/index.js >> /root/.openclaw/workspace/infrastructure/logs/capability-anchor-sync.log 2>&1
```
**影响**：解锁断点④，能力锚点自动保持最新。

### P3：SEEF discoverer增加wild-scripts消费能力
在discoverer.py的`_scan_skills`方法中增加对`logs/wild-scripts-discovery.json`的读取，将野生脚本也纳入"能力空白"分析。
**影响**：解锁断点②，让两套发现机制形成合力。

### P4：post-creation-guard增加自动修复
将检测脚本改为检测+修复：发现技能未注册时，自动触发`isc-capability-anchor-sync`。
**影响**：解锁断点⑤。

---

## 五、最小闭环方案（最少改动）

**目标**：用最少改动实现"野生脚本被发现 → 有人知道 → 新技能创建后注册到锚点"。

### 只需 2 步：

#### 步骤1：给event-bridge加cron（1行）
```bash
*/5 * * * * cd /root/.openclaw/workspace && flock -xn /tmp/seef-event-bridge.lock /usr/bin/node skills/seef/event-bridge.js run >> infrastructure/logs/seef-event-bridge.log 2>&1
```
这一步让SEEF内部链路（evaluator→discoverer→creator→validator→recorder）能自动流转。

#### 步骤2：给isc-capability-anchor-sync加cron（1行）
```bash
0 * * * * flock -xn /tmp/cap-anchor-sync.lock /usr/bin/node /root/.openclaw/workspace/skills/isc-capability-anchor-sync/index.js >> /root/.openclaw/workspace/infrastructure/logs/capability-anchor-sync.log 2>&1
```
这一步让任何新创建的技能（无论来源）在1小时内自动注册到能力锚点。

#### 效果
- SEEF discoverer→creator→validator→recorder **全自动**
- 新建技能 → 1小时内自动出现在CAPABILITY-ANCHOR.md
- auto-skill-discovery.sh的输出仍需人工处理（但这是可接受的，因为"野生脚本→技能"本身需要人类判断）

#### 完整闭环（追加1步）
如果还想让auto-skill-discovery的结果自动进入SEEF流水线，在步骤1和2之外再加：
- auto-skill-discovery.sh末尾发一个事件（P1建议的代码）
- event-bridge.js ROUTES增加一条路由

**3步改动，全链路闭环。**

---

## 六、总结

| 维度 | 当前状态 | 闭环后 |
|------|----------|--------|
| 发现→创造 | ❌ 两套系统各玩各的 | ✅ auto-discovery → event-bus → SEEF creator |
| 创造→注册 | ❌ 手动运行anchor-sync | ✅ 每小时自动全量同步 |
| 注册→发现 | ⚠️ 全量重写模式天然OK | ✅ 定时运行后完全闭环 |
| SEEF内部链路 | ❌ event-bridge不运行 | ✅ 每5分钟处理事件 |

**核心问题**：不是设计缺陷，而是**调度缺位**。组件都在、路由表都写好了、事件模式也定义了，就是没人把cron加上去。两行crontab就能把大半条链路接通。
