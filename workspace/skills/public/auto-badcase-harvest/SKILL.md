# auto-badcase-harvest — 自动Badcase采集入库

## 功能

1. **幂等入库** — 按 `badcase_id` 去重，同一ID不重复写入
2. **翻转Goodcase** — 入库后自动调用 `badcase-to-goodcase.sh` 生成正向用例
3. **飞书通知** — 入库成功后推送飞书消息给指定用户

## 触发条件

当发现评测/线上 badcase 需要归档时，手动或由 pipeline 自动调用。

## 参数

| 位置 | 参数 | 必填 | 说明 |
|------|------|------|------|
| $1 | badcase_id | ✅ | 唯一标识 |
| $2 | category | ✅ | 分类（如 intent-miss, slot-error） |
| $3 | description | ✅ | 问题描述 |
| $4 | wrong_chain | ❌ | 错误调用链 |
| $5 | correct_chain | ❌ | 正确调用链 |
| $6 | root_cause | ❌ | 根因分析 |

## 配置

编辑 `config.json` 可修改：

- `badcase_file` — badcase 存储路径
- `feishu.app_id` / `feishu.app_secret` — 飞书应用凭证
- `feishu.receive_id` — 通知接收人 open_id
- `max_retries` — 飞书推送最大重试次数
- `goodcase_script` — goodcase 翻转脚本路径

## 使用示例

```bash
# 直接调用
bash /root/.openclaw/workspace/skills/public/auto-badcase-harvest/index.sh \
  "bc-001" "intent-miss" "用户说开灯但识别为关灯" \
  "light.off" "light.on" "意图分类器混淆"

# 通过原脚本薄封装调用
bash /root/.openclaw/workspace/scripts/auto-badcase-harvest.sh \
  "bc-001" "intent-miss" "用户说开灯但识别为关灯"
```
