# skill-creator-addon — 技能创建后置步骤补丁

## 强制后置步骤（ISC-SKILL-POST-CREATION-GUARD-001）

任何新技能创建完成后，**必须**在同一任务中完成以下4步：

1. **注册能力锚点**：在CAPABILITY-ANCHOR.md中添加技能条目
2. **创建意图路由**：在isc-core/rules/中创建intent-route规则
3. **声明触发条件**：在SKILL.md头部添加触发场景
4. **验证注册**：grep CAPABILITY-ANCHOR.md确认

缺任何一项 = 技能创建未完成 = Badcase
