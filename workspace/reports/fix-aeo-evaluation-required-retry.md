# fix-aeo-evaluation-required-retry

- 时间: 2026-03-06 21:35 GMT+8
- 目标: 修复 Day2 遗留项 `aeo_evaluation_required` 路由命中但逻辑未实现

## 修复内容

1. 为 `skills/isc-core/rules/rule.n024-aeo-dual-track-orchestration-024.json` 的触发动作补上真实 handler：
   - `type: aeo-evaluation-required`
   - `handler: aeo-evaluation-required`
2. 新增事件总线 handler：
   - `infrastructure/event-bus/handlers/aeo-evaluation-required.js`
   - 负责把事件 payload 转交给 `skills/aeo/index.js`
3. 实现 `skills/aeo/index.js` 的真实执行逻辑：
   - 解析 `skillName`
   - 基于技能名称/SKILL.md 粗分 `ai-effect` / `function-quality` / `mixed`
   - 选择双轨：`ai_effect_track` / `function_quality_track`
   - 生成/覆盖：
     - `skills/aeo/evaluation-sets/{skill}/standard.json`
     - `skills/aeo/evaluation-sets/{skill}/test-cases.json`
   - 输出执行报告：
     - `skills/aeo/reports/{skill}-evaluation-required.json`

## 最小验证

执行：

```bash
node - <<'NODE'
const { Dispatcher } = require('./infrastructure/event-bus/dispatcher');
(async () => {
  const dispatcher = new Dispatcher();
  await dispatcher.init();
  await dispatcher.dispatch('aeo_evaluation_required', { skillName: 'api' });
  console.log(JSON.stringify(dispatcher.getStats(), null, 2));
})();
NODE
```

验证结果：

- 事件 `aeo_evaluation_required` 成功命中规则并执行新增 handler
- 生成文件存在：
  - `skills/aeo/evaluation-sets/api/standard.json`
  - `skills/aeo/evaluation-sets/api/test-cases.json`
  - `skills/aeo/reports/api-evaluation-required.json`
- `api` 被识别为 `function-quality`，生成 `function_quality_track` 评测维度与测试用例

## 说明

- 目前 `rule.n023` / `rule.n024` 末尾仍会继续调用既有 `eval-quality-check`，其返回“未实现该规则检查逻辑”是旧检查器问题，不影响这次 `aeo_evaluation_required` 主执行链路已落地。
- 本次修复重点是把“路由命中但无业务逻辑”补成“路由命中即可真实产出评测资产”。
