# D2-01: ISC运行时Enforcement引擎

## 交付物

`/root/.openclaw/workspace/infrastructure/enforcement/` 下4个可执行脚本：

| 文件 | Gate节点 | 对应ISC规则 |
|------|---------|-------------|
| `gate-check-skill-md.js` | 技能发布前 | rule.skill-mandatory-skill-md-001 |
| `gate-check-benchmark-data.js` | Benchmark提交前 | rule.scenario-acceptance-gate-001 |
| `gate-check-report-validation.js` | 报告生成前 | 交叉验证（防虚假数据） |
| `enforce.js` | 统一入口 | 路由到具体gate |

## 使用方式

```bash
# 统一入口
node enforce.js skill-publish <skill_path>
node enforce.js benchmark-submit <benchmark.json>
node enforce.js report-generate <report.md>

# 直接调用
node gate-check-skill-md.js /path/to/skill/
node gate-check-benchmark-data.js benchmark.json
node gate-check-report-validation.js report.md
```

## Gate检查逻辑

### 1. skill-publish (SKILL.md存在性)
- 检查技能目录下SKILL.md是否存在
- 检查文件大小≥10 bytes（防空文件）
- **失败 → exit 1 + 违规详情 + 写入enforcement-log.jsonl**

### 2. benchmark-submit (数据源真实性)
- 顶层`data_source`必须为真实数据标注（real_production/real_user/real_log等）
- 每个scenario的`source`字段不能是synthetic/generated/mock/simulated/fake
- 缺少source标注视为违规
- **失败 → exit 1 + 逐条违规列表**

### 3. report-generate (数字交叉验证)
- 检测裸分数（如"7/10"）是否有来源上下文（验证/sample/来源等关键词）
- 检测百分比是否有样本量说明
- JSON报告检查是否有cross_validation/validation_method字段
- **失败 → exit 1 + 定位到具体未验证数字**

## 验收测试结果

| 测试 | 输入 | 预期 | 实际 |
|------|------|------|------|
| 无SKILL.md的技能 | fake-skill-no-md/ | BLOCKED | ✅ BLOCKED |
| 有SKILL.md的技能 | good-skill/ | PASS | ✅ PASS |
| 全合成数据benchmark | synthetic+generated | BLOCKED | ✅ BLOCKED |
| 真实数据benchmark | real_production | PASS | ✅ PASS |
| 无来源标注的报告 | "7/10", "8/10" | BLOCKED | ✅ BLOCKED |
| 有来源标注的报告 | "7/10 (基于验证)" | PASS | ✅ PASS |

**6/6 测试通过。**

## 日志

所有gate结果写入 `infrastructure/enforcement/enforcement-log.jsonl`，格式：
```json
{"rule":"rule.xxx","gate":"skill-publish","result":"BLOCKED|PASS","reason":"...","timestamp":"ISO8601"}
```

## 集成方式

在DTO任务流或子Agent中，执行关键操作前调用：
```javascript
const { execSync } = require('child_process');
try {
  execSync(`node /root/.openclaw/workspace/infrastructure/enforcement/enforce.js skill-publish ${skillPath}`, { stdio: 'inherit' });
} catch (e) {
  // Gate blocked - 操作已被拦截
  return;
}
// Gate passed - 继续执行
```
