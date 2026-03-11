# dto-core → lto-core 重命名 QA 报告

生成时间：2026-03-08 18:40 (GMT+8)
执行人：质量分析子代理

## 1) 目录存在性
- [PASS] `/root/.openclaw/workspace/skills/lto-core/` 存在
- [PASS] `/root/.openclaw/workspace/skills/dto-core/` 不存在

## 2) 零残留检查
### 2.1 dto-core 字符串残留（限定 md/json/js/sh）
命令：
```bash
grep -r "dto-core" --include="*.md" --include="*.json" --include="*.js" --include="*.sh" . \
  | grep -v ".git/" | grep -v "node_modules/" | grep -v ".entropy-archive/"
```
结果：
- [PASS] 无输出（未发现 `dto-core` 残留）

### 2.2 JSON 中 "dto" 缩写残留（top 20）
命令：
```bash
grep -r '"dto"' --include="*.json" . \
  | grep -v ".git/" | grep -v "node_modules/" | grep -v ".entropy-archive/" | head -20
```
结果：
- [PASS] 无输出（未发现 `"dto"` 键值残留）

## 3) 引用完整性
- [PASS] `skills/lto-core/SKILL.md` 存在（已验证文件可读）
- [PASS] ISC 规则/组件对 `lto-core` 的引用路径可达（抽样 grep 覆盖 `skills/isc-core`, `scripts`, `skills/lto-core` 等）
- [PASS] `scripts/` 中对 `lto-core` 的引用路径存在且指向新目录

## 4) 裁决殿 → 裁决殿 替换核查
命令：
```bash
grep -r "裁决殿\|lingxiaoge" --include="*.md" --include="*.json" --include="*.js" --include="*.sh" . \
  | grep -v ".git/" | grep -v "node_modules/" | grep -v ".entropy-archive/"
```
结果：
- [FAIL] 发现残留（主要为历史报告文档中的文字记录）

残留清单：
1. `reports/caijuedian-rename-report.md`
   - 含“裁决殿/lingxiaoge”作为更名说明与映射历史

## 5) DTO → 本地任务编排 替换核查
命令：
```bash
grep -r "Declarative Task Orchestration" --include="*.md" --include="*.json" --include="*.js" . \
  | grep -v ".git/" | grep -v "node_modules/" | grep -v ".entropy-archive/"
```
结果：
- [FAIL] 发现残留

残留清单：
1. `skills/feishu-chat-backup/logs/feishu-chat-2026-02-24_to_2026-02-27.md`
2. `skills/feishu-chat-backup/logs/feishu-chat-2026-02-25_to_2026-02-28.md`
3. `infrastructure/vector-service/backup/vectors-tfidf-20260228/skill-lto-core.json`
4. `reports/lto-rename-alignment-report.md`

说明：上述多为历史聊天备份、向量备份、迁移报告中的历史术语记录。

## 6) 结论
- 目录重命名本身与主路径引用完整性：**通过**
- “零残留”严格口径（含历史文档/备份）：**未完全通过**

## 7) 修复建议
1. **建议分层口径**：
   - 运行态代码口径（src/scripts/规则）：当前可判定通过；
   - 历史资产口径（reports/backups/logs）：允许保留或转移归档。
2. 对历史资产若要求“全仓无残留”，可执行：
   - 在 `reports/` 中将历史术语改为“旧称(已废弃)”并统一注释；
   - 在 `skills/feishu-chat-backup/` 与 `infrastructure/vector-service/backup/` 增加归档排除策略，或批量脱敏替换后重建索引。
3. 为避免回归，新增 CI grep 规则：
   - 对运行目录强约束禁止 `dto-core`/`Declarative Task Orchestration`；
   - 对 `reports|backup|logs` 目录采用告警不拦截策略。
