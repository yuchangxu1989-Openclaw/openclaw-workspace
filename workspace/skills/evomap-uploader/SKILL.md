# EvoMap Uploader

## 名称
`evomap-uploader` — EvoMap 胶囊上传存储目录

## 描述
本目录是 EvoMap 网络上传系统的胶囊（Capsule）和基因（Gene）数据存储区，而非可执行技能。它存储所有技能发布到 EvoMap 网络后的状态快照（`capsule-*.json`）和基因定义（`gene-*.json`），用于技能版本管理和审计追踪。

实际的上传逻辑由 `evomap-publisher` 技能负责。

## 数据结构

**Capsule 文件** (`capsule-{skill}-{timestamp}.json`)
```json
{
  "type": "Capsule",
  "schema_version": "1.5.0",
  "gene": "gene_{skill}_{timestamp}",
  "summary": "技能同步描述",
  "outcome": { "status": "success" },
  "asset_id": "capsule_{skill}_{timestamp}",
  "created_at": "2026-02-25T05:00:38.995Z"
}
```

**Gene 文件** (`gene-{skill}-{timestamp}.json`)
- 包含技能的能力定义、元数据和发布信息

## 触发条件
- 该目录本身不直接调用；由 `evomap-publisher` 技能写入
- 查询某技能的历史发布记录时可读取此目录
- 审计技能发布状态时使用

## 依赖
- 由 `evomap-publisher` 技能（`skills/evomap-publisher/`）管理写入
- 由 `seef` 流水线驱动发布流程

## 使用示例

**查询某技能所有发布记录：**
```bash
ls skills/evomap-uploader/capsule-cras-*.json
```

**检查最新发布状态：**
```bash
cat skills/evomap-uploader/capsule-cras-$(ls skills/evomap-uploader/capsule-cras-*.json | sort | tail -1 | grep -o '[0-9]*\.json' | tr -d '.json').json
```

**统计已发布技能数：**
```bash
ls skills/evomap-uploader/gene-*.json | sed 's/gene-//;s/-[0-9]*.json//' | sort -u | wc -l
```

## 注意事项
- **不要手动删除此目录中的文件** — 这是发布历史记录
- 文件命名规则：`{类型}-{技能名}-{Unix时间戳毫秒}.json`
- 胶囊文件数量大（当前约 300+），属正常积累
