---
name: feishu-report-sender
description: 飞书报告发送器 - 将CRAS、EvoMap的报告队列实际推送到飞书
version: "1.0.13"
status: active
tags: [feishu, report, sender]
---

# 飞书报告发送器

distribution: internal


## 功能

- 读取CRAS-B用户洞察报告队列
- 读取EvoMap进化报告队列
- 实际发送到飞书用户

## 使用

```bash
# Node方式
node /root/.openclaw/workspace/skills/feishu-report-sender/index.js

# Shell方式
bash /root/.openclaw/workspace/skills/feishu-report-sender/send.sh
```

## 队列路径

- CRAS: `/root/.openclaw/workspace/skills/cras/feishu_queue/`
- EvoMap: `/root/.openclaw/workspace/evolver/reports/`
