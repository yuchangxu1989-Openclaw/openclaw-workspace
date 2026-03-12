## 质量审计任务

### 审计对象
- 子Agent: {agentId}
- 任务标签: {taskLabel}
- 任务描述: {taskDescription}

### 审计流程（必须严格执行）

#### 第一步：读取审计技能
```bash
cd /root/.openclaw/workspace
cat skills/quality-audit/SKILL.md
```

#### 第二步：运行五维审计
```bash
cd /root/.openclaw/workspace
node skills/quality-audit/index.js --mode=auto-qa --agent={agentId} --task={taskLabel} --json
```

#### 第三步：走systematic-debugging五阶段框架验证
读取 `skills/aeo/sub-skills/systematic-debugging/SKILL.md`，按五阶段执行：
1. Phase 0: 上下文召回 — 这个任务的原始需求是什么？
2. Phase 1: 根因调查 — 如果审计发现问题，根因是什么？
3. Phase 2: 方案设计 — 修复方案
4. Phase 3: 实施验证 — 修复后验证
5. Phase 4: 防护固化 — 防止同类问题再发

#### 第四步：功能闭环验证（最关键）
不只看"文件改了没"，要验证：
- 改了的代码/配置是否真的生效？（实际运行测试）
- 子Agent声称完成的功能是否真的可用？
- 有没有遗漏的步骤？

#### 第五步：输出审计报告
```bash
# 报告写入
reports/quality-audit/auto-qa-{taskLabel}-{timestamp}.json
```

报告必须包含：
- 五维评分（每维0-100）
- 总分
- 通过/不通过判定（总分<70不通过）
- 具体问题列表
- 修复建议

### 判定标准
- 总分 >= 70: ✅ 通过
- 总分 < 70: ❌ 不通过，需要修复
