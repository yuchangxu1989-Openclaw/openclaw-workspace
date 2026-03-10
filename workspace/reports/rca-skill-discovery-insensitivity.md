# 根因分析：技能发现不敏感

## 事件概要

2026-03-08，主Agent产出5个独立脚本（badcase-to-goodcase.sh, auto-grant-feishu-perm.sh, detect-deep-think-intent.sh, isc-auto-align.sh, feishu-doc-verify.sh），均未自动发现应被技能化。最终由用户提醒后才批量技能化。

## 根因分析

### 1. 为什么脚本产出后没有自动触发技能化？

**直接原因：** 不存在任何程序化探针监听"新脚本产出"事件。脚本写入磁盘后，没有任何自动化流程被触发。

**深层原因：**
- 主Agent的认知模型中，"写脚本"和"技能化"是两个独立决策，没有因果关联
- 缺乏 pre-commit hook 对 `scripts/*.sh` 新增的检测
- 缺乏定期扫描脚本目录并与已有技能对比的 cron 任务

### 2. SEEF/evolver技能发现功能为什么是空壳？

- `rule.auto-skillization-trigger-001.json` 等规则存在，但仅是声明式JSON，无实际handler执行
- ISC规则体系是"认知层规则"，依赖主Agent在对话中"想起来"去遵守，而非程序化执行
- 没有从规则到 shell/cron/hook 的落地桥接

### 3. 三层缺失分析

| 层次 | 缺失项 | 后果 |
|------|--------|------|
| **感知层** | 无 git hook 检测 `scripts/*.sh` 新增 | 事件发生后无人知道 |
| **感知层** | 无 cron 定期扫描脚本目录 | 漏网之鱼永远漏网 |
| **认知层** | 无"脚本→技能"的自动关联判断逻辑 | Agent不会主动想到技能化 |
| **认知层** | ISC规则=纯声明，无程序gate | 规则存在≠规则执行 |
| **执行层** | 无 auto-skill-discovery.sh 扫描工具 | 即使发现了也无法批量处理 |
| **执行层** | 无信号文件机制传递发现结果 | 异步流程断裂 |

## 解决方案

1. **pre-commit hook增强** — 检测 `scripts/*.sh` 新增，写入信号文件
2. **auto-skill-discovery.sh** — 可cron调用的扫描脚本，输出未技能化候选
3. **ISC规则落地** — 将规则绑定到hook和cron，实现程序化执行
4. **badcase入库** — 防止同类问题再次被忽略

## 教训

> 规则不等于执行。声明式ISC规则如果没有程序化gate/hook/cron落地，就是空壳。每条规则必须有对应的可执行探针。
