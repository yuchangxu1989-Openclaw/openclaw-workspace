# self-check-scanners

系统自省扫描器技能包 — 收编5个核心自省脚本，提供统一入口。

## 功能链路

```
认知盲区扫描 → 返工分析 → 完成度扫描 → 纠偏采集
     ↓              ↓            ↓            ↓
 意图覆盖差距   返工根因ISC化   技术债务清单   规则草案队列
```

## 扫描器清单

| 扫描器 | 脚本 | 触发方式 | 输出 |
|--------|------|----------|------|
| **unknown-unknowns** | unknown-unknowns-scanner.js | cron / 手动 | 认知盲区报告（意图no-match、链路缺失、handler缺失、告警响应率、评测覆盖差距） |
| **rework** | rework-analyzer.js | 子Agent被steer/重启时 | reports/rework-analysis-YYYY-MM-DD.md + ISC规则草案 |
| **day-completion** | day-completion-scanner.js | Day完成事件 / cron | reports/auto-debt-scan-dayN.md（TODO/FIXME、配置一致性、事件对齐） |
| **correction-harvest** | correction-harvester.js | cron每5分钟 / 手动 | infrastructure/aeo/golden-testset/pending-cases.json |
| **detect-correction** | detect-user-correction.js | 实时/按需 | JSON { isCorrection, oldConcept, newConcept, keywords } |

## 使用方式

```bash
# 列出所有扫描器
node skills/self-check-scanners/index.js --list

# 运行全部（跳过需要输入的detect-correction）
node skills/self-check-scanners/index.js --all

# 运行单个
node skills/self-check-scanners/index.js --scanner unknown-unknowns
node skills/self-check-scanners/index.js --scanner rework --window 60
node skills/self-check-scanners/index.js --scanner correction-harvest --auto

# 直接用名字
node skills/self-check-scanners/index.js rework --auto
```

## 原路径兼容

原5个脚本已替换为symlink，指向本技能目录下的副本：
- `infrastructure/self-check/unknown-unknowns-scanner.js` → `skills/self-check-scanners/scripts/`
- `infrastructure/self-check/rework-analyzer.js` → `skills/self-check-scanners/scripts/`
- `infrastructure/self-check/day-completion-scanner.js` → `skills/self-check-scanners/scripts/`
- `infrastructure/self-check/correction-harvester.js` → `skills/self-check-scanners/scripts/`
- `scripts/detect-user-correction.js` → `skills/self-check-scanners/scripts/`

现有cron任务和其他引用无需修改。

## 依赖

- Node.js 18+
- 无外部npm依赖
