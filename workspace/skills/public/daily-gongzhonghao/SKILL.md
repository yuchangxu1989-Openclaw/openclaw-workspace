# 每日公众号复盘文章

## 描述
每天23:00自动触发，3个Agent用3种模型分别出一份公众号文章。
讲述"一个人和他的AI"今天一天的故事，面向公众号读者。

## Prompt
独立维护在 `prompt.md`，会持续优化。

## 触发方式
cron定时任务，每天23:00

## 执行方式
3个Agent并行，每个用不同模型：
1. writer/claude-opus-4-6-thinking（深度思考版）
2. researcher/claude-opus-4-6-thinking（调研视角版）  
3. coder/gpt-5.3-codex（boom渠道版）

## 输出
- 3份飞书文档（自动创建）
- 3份本地md文件：reports/gongzhonghao-YYYY-MM-DD-{agent}.md
