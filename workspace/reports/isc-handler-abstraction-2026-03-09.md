# ISC Handler 抽象分析报告

**日期**: 2026-03-09  
**分析范围**: `/infrastructure/event-bus/handlers/` 下 97 个 handler 脚本  
**目标**: 识别重复模式，设计公共组件，减少后续 171 条规则的开发成本

---

## 一、重复模式识别

### 1. Handler 签名 & 上下文解构（89/97 = 92%）

几乎所有 handler 都重复以下样板：

```js
module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  // ...
};
```

**问题**: `root` 的 fallback 链写法不一致（有的用 `context.workspace`，有的用 `context.cwd`），48 个文件涉及。

### 2. gitExec 辅助函数（重复定义 6 次）

以下 6 个 handler 各自独立定义了完全相同的 `gitExec` 函数：

- `anti-entropy-check.js`
- `automation-gap-scanner.js`
- `completeness-check.js`
- `day-transition.js`
- `enforcement-engine.js`
- `event-health-monitor.js`

另有 4 个 handler 直接内联 `execSync('git ...')`。共 10 个 handler 涉及 git 操作。

```js
// 重复出现的 gitExec 定义
function gitExec(root, cmd) {
  return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
}
```

8 个 handler 使用 `--no-verify` 跳过 pre-commit hook。

### 3. JSON 报告写入（29/97 = 30%）

29 个 handler 包含 `fs.writeFileSync(path, JSON.stringify(data, null, 2))` 模式，典型用于：
- 扫描报告输出
- 状态/注册表更新
- 隔离标记文件

### 4. 事件发射（47/97 = 48%）

47 个 handler 调用 `context.bus.emit(eventName, payload)`，但：
- 无统一错误处理（bus 不存在时可能抛错）
- 事件命名不一致（有的用 `.` 分隔，有的用 `-`）
- 部分 handler 在 try/catch 外发射

### 5. 返回值格式（39/97 = 40%）

39 个 handler 返回 `{ ok, actions, message, ... }` 结构，但字段不统一：
- 有的有 `autonomous: true`，有的没有
- `actions` 有时是字符串数组，有时是对象数组
- `summary` 字段时有时无

### 6. SKILL.md 验证（11/97 = 11%）

11 个 handler 涉及检查 SKILL.md 存在性/完整性，各自实现解析逻辑。

### 7. 通知分发（31/97 = 32%）

31 个 handler 使用 `context.notify(msg, level)`，但通知级别字符串不一致（`warning` / `warn` / `error` / `info`）。

---

## 二、公共组件设计建议

### 模块 1: `handler-base.js` — Handler 工厂 + 上下文标准化

**解决**: 签名样板、上下文解构、返回值格式、错误处理

```js
// handler-base.js
const { resolve } = require('path');

function createHandler(name, checkFn) {
  return async function(event, rule, context) {
    const ctx = {
      logger: context?.logger || console,
      root: context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd(),
      bus: context?.bus,
      notify: context?.notify || (() => {}),
      event, rule, context,
    };

    const actions = [];
    const addAction = (a) => actions.push(a);

    try {
      const result = await checkFn(ctx, addAction);
      return {
        ok: result?.ok !== false,
        autonomous: true,
        handler: name,
        actions,
        ...result,
      };
    } catch (err) {
      ctx.logger.error?.(`[${name}] ${err.message}`);
      return { ok: false, autonomous: true, handler: name, actions, error: err.message };
    }
  };
}

module.exports = { createHandler };
```

**使用示例**:
```js
const { createHandler } = require('./handler-base');
module.exports = createHandler('my-rule', async (ctx, action) => {
  // 只写规则特有逻辑
  action('scanned');
  return { ok: true, message: '检查通过' };
});
```

**减少代码**: 每个 handler 约减少 15-20 行样板，97 个 handler 共约 ~1500 行。

---

### 模块 2: `git-ops.js` — Git 操作封装

**解决**: gitExec 重复定义、--no-verify、add/commit/push 流程

```js
// git-ops.js
const { execSync } = require('child_process');

function gitExec(root, cmd, opts = {}) {
  const timeout = opts.timeout || 10000;
  return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout }).trim();
}

function gitCommit(root, message, opts = {}) {
  const noVerify = opts.noVerify !== false ? ' --no-verify' : '';
  gitExec(root, 'add -A');
  try {
    gitExec(root, `commit${noVerify} -m "${message.replace(/"/g, '\\"')}"`);
    return true;
  } catch { return false; } // nothing to commit
}

function gitDiff(root, filePath) {
  try { return gitExec(root, `diff HEAD -- "${filePath}"`); }
  catch { return ''; }
}

function gitRestore(root, relPath, commitHash) {
  return gitExec(root, `show ${commitHash}:"${relPath}"`);
}

module.exports = { gitExec, gitCommit, gitDiff, gitRestore };
```

**减少代码**: 10 个 handler 各减 5-15 行，消除 6 处重复定义。

---

### 模块 3: `report.js` — 报告写入 + 事件发射

**解决**: JSON 报告写入、事件发射、通知分发的统一

```js
// report.js
const fs = require('fs');
const path = require('path');

function writeReport(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function emitEvent(bus, eventName, payload) {
  if (bus?.emit) await bus.emit(eventName, payload);
}

async function notifyIf(ctx, condition, message, level = 'info') {
  if (condition && ctx.notify) await ctx.notify(message, level);
}

module.exports = { writeReport, emitEvent, notifyIf };
```

**减少代码**: 29+ handler 各减 3-5 行，统一 mkdirSync 保护。

---

### 模块 4: `skill-check.js` — SKILL.md 验证工具

**解决**: SKILL.md 存在性、frontmatter 解析、完整性检查

```js
// skill-check.js
const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = ['name', 'description', 'usage'];

function findSkillMd(skillDir) {
  const p = path.join(skillDir, 'SKILL.md');
  return fs.existsSync(p) ? p : null;
}

function validateSkillMd(skillDir) {
  const mdPath = findSkillMd(skillDir);
  if (!mdPath) return { exists: false, issues: ['SKILL.md not found'] };
  
  const content = fs.readFileSync(mdPath, 'utf8');
  const issues = [];
  if (!/^#\s+.+/m.test(content)) issues.push('missing title');
  for (const section of REQUIRED_SECTIONS) {
    if (!new RegExp(`##\\s+.*${section}`, 'i').test(content)) {
      issues.push(`missing section: ${section}`);
    }
  }
  return { exists: true, path: mdPath, content, issues, valid: issues.length === 0 };
}

module.exports = { findSkillMd, validateSkillMd, REQUIRED_SECTIONS };
```

**减少代码**: 11 个 handler 各减 10-20 行解析逻辑。

---

### 模块 5: `file-scan.js` — 文件扫描 + 模式匹配

**解决**: 危险模式扫描、grep 敏感信息、目录遍历

```js
// file-scan.js  (扩展现有 p0-utils.js)
const { walk, readText, exists } = require('./p0-utils');

function scanForPatterns(dir, patterns, exts = ['.js']) {
  const files = walk(dir, exts);
  const findings = [];
  for (const file of files) {
    const content = readText(file);
    for (const { pattern, severity, reason } of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        findings.push({ file, pattern: pattern.source, severity, reason, count: matches.length });
      }
    }
  }
  return findings;
}

function checkFilesExist(baseDir, requiredFiles) {
  return requiredFiles.map(f => ({
    file: f,
    exists: exists(require('path').join(baseDir, f)),
  }));
}

module.exports = { scanForPatterns, checkFilesExist };
```

---

## 三、标准 Handler 模板

```js
'use strict';
/**
 * ISC Handler: [RULE_ID] - [RULE_NAME]
 * 规则意图: [一句话描述]
 * 流水线: 感知 → 判断 → 执行 → 验证 → 闭环
 */
const path = require('path');
const { createHandler } = require('./handler-base');
const { writeReport, emitEvent } = require('./report');
const { gitCommit } = require('./git-ops');
// 按需引入: const { validateSkillMd } = require('./skill-check');
// 按需引入: const { scanForPatterns } = require('./file-scan');

module.exports = createHandler('[rule-id]', async (ctx, action) => {
  const { root, logger, bus } = ctx;

  // ─── 感知 ───
  // TODO: 收集检查目标

  // ─── 判断 ───
  // TODO: 应用规则逻辑，产出 findings

  // ─── 执行 ───
  // TODO: 自动修复 / 标记 / 隔离
  action('checked');

  // ─── 验证 ───
  // TODO: 确认修复生效

  // ─── 闭环：报告 + 事件 ───
  const reportPath = path.join(root, 'infrastructure', 'reports', '[rule-id]-report.json');
  writeReport(reportPath, { /* report data */ });
  await emitEvent(bus, '[domain].[rule].completed', { /* payload */ });

  return { ok: true, message: '检查完成' };
});
```

每个新 handler 只需填写 **感知/判断/执行/验证** 四个 TODO 块，模板约 30 行，规则特有逻辑通常 20-80 行。对比现有 handler 平均 150-250 行，**减少约 50-60% 代码量**。

---

## 四、实施建议

### Phase 1: 创建公共模块（0.5 天）

1. 扩展现有 `p0-utils.js` → 重命名为 `handler-utils/index.js`
2. 新建 `handler-utils/handler-base.js`
3. 新建 `handler-utils/git-ops.js`
4. 新建 `handler-utils/report.js`
5. 新建 `handler-utils/skill-check.js`
6. 新建 `handler-utils/file-scan.js`

### Phase 2: 迁移现有 handler（1 天）

按优先级迁移已有 handler 到新模板，优先迁移重复最严重的：
1. 6 个含 `gitExec` 重复定义的 handler
2. 29 个含 JSON 报告写入的 handler
3. 其余 handler 逐步迁移

### Phase 3: 批量生成新 handler（持续）

使用模板批量展开 171 条待实现规则：
- 预估每条规则开发时间从 30-60 分钟降至 10-20 分钟
- 总节省 ~50 小时开发时间

### 文件结构建议

```
handlers/
├── handler-utils/          # 公共模块
│   ├── index.js            # re-export all
│   ├── handler-base.js     # createHandler 工厂
│   ├── git-ops.js          # git 操作
│   ├── report.js           # 报告 + 事件
│   ├── skill-check.js      # SKILL.md 验证
│   └── file-scan.js        # 文件扫描
├── _template.js            # handler 骨架模板
├── p0-utils.js             # (保留兼容，内部 re-export handler-utils)
└── *.js                    # 各规则 handler
```

### 量化收益总结

| 组件 | 影响 handler 数 | 每个减少行数 | 总减少行数 |
|------|:---:|:---:|:---:|
| handler-base (样板) | 89 | 15-20 | ~1,500 |
| git-ops | 10 | 5-15 | ~100 |
| report | 29 | 3-5 | ~120 |
| skill-check | 11 | 10-20 | ~165 |
| file-scan | 8 | 10-15 | ~100 |
| **合计** | — | — | **~2,000** |

对后续 171 条新规则，预估**避免重复代码 ~8,500 行**（每条约 50 行样板 × 171）。

---

*报告生成于 2026-03-09 by analyst subagent*
