# 智谱Embedding全量向量化执行报告

## 📊 执行概况

| 项目 | 值 |
|------|-----|
| **执行时间** | 2026-03-01 00:46:25 ~ 00:46:54 |
| **总耗时** | ~29秒 |
| **执行状态** | ✅ 成功完成 |
| **API Key** | API_KEY_5 (152da11008724c1499911eb6c094aa43.xQUocLUkVIrZzlEk) |
| **引擎** | zhipu-embedding-3 |
| **向量维度** | 1024维 |

---

## 📁 处理文件统计

| 类型 | 数量 | 状态 |
|------|------|------|
| **技能 (SKILL.md)** | 28 | ✅ 全部成功 |
| **记忆 (.md)** | 22 | ✅ 全部成功 |
| **知识 (.json)** | 0 | 无待处理文件 |
| **AEO评测用例** | 0 | 无待处理文件 |
| **总计** | **50** | ✅ 100%成功 |

---

## 🔧 技能文件列表 (28个)

1. skill-file-sender
2. skill-parallel-subagent
3. skill-isc-document-quality
4. skill-glm-asr
5. skill-glm-5-coder
6. skill-evolver
7. skill-dto-core
8. skill-feishu-chat-backup
9. skill-pdca-engine
10. skill-evolution-pipeline
11. skill-seef
12. skill-feishu-evolver-wrapper
13. skill-isc-core
14. skill-cras-generated-1771827136412
15. skill-evomap-a2a
16. skill-capability-anchor
17. skill-cras
18. skill-cras-generated-1772042431830
19. skill-council-of-seven
20. skill-isc-capability-anchor-sync
21. skill-aeo
22. skill-feishu-report-sender
23. skill-cras-generated-1772128853925
24. skill-lep-executor
25. skill-system-monitor
26. skill-cras-generated-1771827197478
27. skill-paths-center
28. skill-convert-helper

---

## 📝 记忆文件列表 (22个)

1. memory-2026-02-27
2. memory-aeo-dto-logs
3. memory-2026-02-23
4. memory-lessons-openclaw-14b-tokens
5. memory-2026-03-01-global-pipeline-run
6. memory-vectorization-refactor-2026-02-28
7. memory-2026-02-27-system-check
8. memory-check-sediment-2026-02-25-0540
9. memory-2026-03-01-cras-govern
10. memory-active-learning-2026-02-25-0513
11. memory-2025-02-28
12. memory-2025-02-27-n023-report
13. memory-2026-02-26
14. memory-cras-govern-20260227-1200
15. memory-2026-02-25
16. memory-2026-02-28-pipeline-run
17. memory-elite-memory-tracking
18. memory-check-sediment-2026-02-25
19. memory-2026-02-27-pipeline-run
20. memory-2025-02-27
21. memory-2026-02-28
22. memory-aeo-cron-2026-02-27-0645

---

## 💾 输出位置

```
/root/.openclaw/workspace/infrastructure/vector-service/vectors/
├── index-meta.json           # 索引元数据
├── index.count               # 向量计数 (51)
├── skill-*.json              # 28个技能向量文件
└── memory-*.json             # 22个记忆向量文件
```

---

## ⚡ 技术细节

- **批量大小**: 5 (智谱API限制)
- **API调用次数**: 10次 (50个文件 ÷ 5批量)
- **API延迟**: 200ms/批次
- **向量格式**: JSON，包含源路径、1024维向量、元数据

---

## ✅ 验证结果

| 检查项 | 结果 |
|--------|------|
| 向量文件生成 | ✅ 50个文件 |
| 向量维度验证 | ✅ 1024维 |
| 索引文件更新 | ✅ index-meta.json |
| API调用成功率 | ✅ 100% (10/10) |

---

## 🔧 代码修复

本次执行修复了 `zhipu-vectorizer.cjs` 的API Key加载逻辑：
- **问题**: 原代码只读取 `ZHIPU_API_KEY_1`
- **修复**: 改为优先从环境变量 `ZHIPU_API_KEY` 读取，支持任意API Key
- **影响**: 现在可以灵活使用 API_KEY_1 ~ API_KEY_8

---

**报告生成时间**: 2026-03-01 00:48:00
**执行脚本**: `vectorize.sh`
**向量化引擎**: 智谱Embedding API (embedding-3)
