# Day2 gap closeout execution

## 本轮选择
优先收口低冲突、高价值、仍能直接落代码的剩余项：

1. **Dispatcher 手工队列噪音收口**：为 `git.pre_commit.detected` 及三类派生 git action 增加显式 handler 路由，避免继续积压 `No handler found` 噪音。
2. **失败恢复标准化补洞**：修复 `isc-skill-security-gate-030` 对 `context.logger/context.bus/context.notify` 的硬依赖，避免缺 context 时二次报错。
3. **补最小回归测试**：验证新增路由存在且 security gate 在空 context 下可执行。

## 实际改动

### 1. 新增 dispatcher 路由
文件：`infrastructure/dispatcher/routes.json`

新增以下 action → handler 映射，统一落到 `log-action`：
- `git.pre_commit.detected`
- `git.commit.quality_check`
- `git.commit.architecture_review`
- `git.commit.rule_code_pairing`

作用：
- 让 git-sensor / 派生动作不再因为“缺 handler”进入 manual queue
- 把这些动作从“执行失败”降级为“明确记录型消费”
- 降低 dispatcher 噪音，提升 Day2 收尾阶段可观测性

### 2. 新增 dispatcher handler alias
文件：`infrastructure/dispatcher/handlers/log-action.js`

作用：
- 与现有 dispatcher alias 风格保持一致
- 让 routes 中的 `log-action` 能被 dispatcher 直接解析到 event-bus 真 handler

### 3. 加固 `isc-skill-security-gate-030`
文件：`infrastructure/event-bus/handlers/isc-skill-security-gate-030.js`

修复点：
- `context = {}` 默认值
- `logger = context.logger || console`
- `bus = context.bus || { emit() {} }`
- `notify = typeof context.notify === 'function' ? ... : () => {}`

收益：
- 避免 handler 因运行上下文不完整而在成功路径/失败路径再次抛错
- 把恢复逻辑从“依赖调用方总是传全 context”改成“本 handler 自带最小兜底”

### 4. 补充回归测试
文件：`tests/unit/day2-closeout-routes.test.js`

覆盖：
- 新增 4 条 route 存在且均指向 `log-action`
- `isc-skill-security-gate-030` 在空 context 下可返回通过结果

## 验证
执行：
- `node tests/unit/day2-closeout-routes.test.js`
- `node -c infrastructure/event-bus/handlers/isc-skill-security-gate-030.js`
- `node -e "const r=require('./infrastructure/dispatcher/routes.json'); console.log(['git.pre_commit.detected','git.commit.quality_check','git.commit.architecture_review','git.commit.rule_code_pairing'].map(k=>k+':'+r[k].handler).join('\n'))"`

## 本轮收口结论
本次不是继续做大改，而是把 Day2 剩余问题里两类最容易反复制造噪音的点直接钉死：

- **路由命中但缺 handler 的 git 派生动作** → 已补消费路径
- **handler 因 context 缺失而二次失败** → 已补最小兜底

这两项都属于高价值、低冲突、可直接验证的收尾动作，适合纳入 Day2 封板前最终 closeout。
