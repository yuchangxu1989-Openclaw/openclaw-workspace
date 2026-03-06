# file-sender 加固报告

**日期**: 2026-03-06  
**版本**: 2.0.0 → 2.1.0  
**状态**: ✅ 完成，9/9 测试通过

## 改动摘要

### 1. 参数顺序误用防御 ✅

- 新增 `validateAndFixParams()` — 检测并自动纠正 receive_id 与 receive_id_type 颠倒
- 覆盖场景:
  - `open_id ou_xxx` → 自动交换为 `ou_xxx open_id`
  - `chat_id oc_xxx` → 自动交换为 `oc_xxx chat_id`
  - `oc_xxx open_id` → 根据前缀自动修正 type 为 `chat_id`
- 无法自动修复时抛出明确错误，列出合法值和正确用法

### 2. 默认优先 open_id ✅

- 默认 `receive_id_type` 从 `chat_id` 改为 `open_id`
- 发给当前用户时只需传 `ou_xxx`，无需显式指定类型
- 前缀 `oc_` 自动推断为 `chat_id`

### 3. 失败时明确下一步 ✅

- 所有 `throw new Error()` 均附带 `下一步:` 建议
- 覆盖: 配置缺失、网络错误、token 获取失败、上传失败(权限/类型)、发送失败(未对话/不在群/ID无效/权限不足)
- 新增: 空文件检测 (0 bytes)

### 4. 参数校验增强 ✅

- `inferIdType()` — 根据 `ou_`/`oc_` 前缀推断 ID 类型
- CLI 层和 API 层双重校验
- 非法 `receive_id_type` 值立即报错

### 5. 自检测试 ✅

- `node index.js --self-test` — 9 个断言
- 覆盖: 正常参数、参数颠倒纠正、前缀推断、非法值报错、配置加载

### 6. SKILL.md 更新 ✅

- 明确默认 open_id，列出自动纠错行为表
- 常见误用示例 + 正确示例
- 失败排查表 (错误码 → 原因 → 下一步)
- API 调用示例

## 测试结果

```
=== file-sender self-test ===
  ✅ 正常 open_id 参数原样通过
  ✅ 正常 chat_id 参数原样通过
  ✅ 参数颠倒自动纠正: id=open_id, type=ou_xxx
  ✅ 参数颠倒自动纠正: id=chat_id, type=oc_xxx
  ✅ ou_ 前缀 + 默认 open_id → 保持 open_id
  ✅ oc_ 前缀 + open_id → 自动修正为 chat_id
  ✅ 非法 receive_id_type 报错
  ✅ inferIdType 正确推断
  ✅ loadFeishuConfig 可执行
结果: 9 通过, 0 失败
```

## 文件变更

| 文件 | 变更 |
|------|------|
| `skills/public/file-sender/index.js` | 重写：参数校验、自动纠正、明确错误提示、self-test |
| `skills/public/file-sender/SKILL.md` | 重写：默认行为、自动纠错表、误用示例、排查表 |
| `reports/file-sender-hardening.md` | 新增：本报告 |
