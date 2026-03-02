# 向量维护定时任务

## 任务信息

| 项目 | 内容 |
|------|------|
| 任务名称 | 向量维护-每日凌晨2点 |
| 执行时间 | 每天 02:00 |
| Cron表达式 | `0 2 * * *` |
| API密钥 | API_KEY_8 (智谱Embedding API) |

## 功能说明

维护任务每天凌晨2点自动执行以下操作：

### 1. 清理孤儿向量
- 扫描所有向量文件
- 发现源文件已不存在的向量（孤儿向量）
- 自动备份并删除孤儿向量

### 2. 检查并修复缺失向量
- 扫描所有源文件（技能、记忆、知识、AEO用例）
- 发现尚未向量化的源文件
- 自动调用智谱Embedding API进行向量化
- 生成的向量为1024维

### 3. 生成维护报告
- 统计源文件和向量数量
- 计算向量化覆盖率
- 记录维护操作详情
- 生成JSON格式的详细报告

## 文件位置

| 文件类型 | 路径 |
|----------|------|
| 维护脚本 | `/root/.openclaw/workspace/infrastructure/vector-service/vector-maintenance.sh` |
| 向量化脚本 | `/root/.openclaw/workspace/infrastructure/vector-service/vectorize.sh` |
| 日志文件 | `/root/.openclaw/workspace/infrastructure/vector-service/logs/vector-maintenance.log` |
| 报告文件 | `/root/.openclaw/workspace/infrastructure/vector-service/reports/maintenance-report-YYYYMMDD.json` |
| 摘要文件 | `/root/.openclaw/workspace/infrastructure/vector-service/reports/maintenance-summary-YYYYMMDD.log` |
| Cron配置 | `/root/.openclaw/workspace/cron/vector-maintenance.cron` |
| 向量存储 | `/root/.openclaw/workspace/infrastructure/vector-service/vectors/` |

## 手动执行

```bash
# 执行完整的维护任务
cd /root/.openclaw/workspace/infrastructure/vector-service
bash vector-maintenance.sh

# 仅清理孤儿向量（dry-run模式）
./vectorize.sh --cleanup-orphans

# 清理孤儿向量（实际删除）
./vectorize.sh --cleanup-orphans --dry-run false

# 仅检查缺失向量（dry-run模式）
./vectorize.sh --check-missing

# 检查并自动修复缺失向量
./vectorize.sh --check-missing --auto-fix
```

## 监控

### 查看最近一次维护结果
```bash
ls -la /root/.openclaw/workspace/infrastructure/vector-service/reports/
cat /root/.openclaw/workspace/infrastructure/vector-service/reports/maintenance-report-$(date +%Y%m%d).json
```

### 查看维护日志
```bash
tail -100 /root/.openclaw/workspace/infrastructure/vector-service/logs/vector-maintenance.log
```

### 查看cron执行日志
```bash
tail -50 /tmp/vector-maintenance-cron.log
```

### 检查cron任务
```bash
crontab -l | grep vector-maintenance
```

## 报告示例

```json
{
  "maintenance_date": "2026-03-01T01:00:51+08:00",
  "task_name": "向量维护-每日凌晨2点",
  "statistics": {
    "source_files": {
      "skills": 28,
      "memory": 22,
      "knowledge": 0,
      "aeo": 0,
      "total": 50
    },
    "vectors": {
      "skills": 28,
      "memory": 22,
      "knowledge": 0,
      "aeo": 0,
      "total": 50
    },
    "maintenance": {
      "orphans_cleaned": 1,
      "missing_found": 1,
      "missing_fixed": 1,
      "coverage_percent": 100
    }
  },
  "status": "success"
}
```

## 故障排除

### 任务未执行
1. 检查cron服务是否运行: `systemctl status cron`
2. 检查cron任务: `crontab -l`
3. 检查日志: `tail -50 /tmp/vector-maintenance-cron.log`

### 向量修复失败
1. 检查API密钥: 确认 `/root/.openclaw/.secrets/zhipu-keys.env` 存在
2. 检查网络连接
3. 查看详细日志: `tail -200 /root/.openclaw/workspace/infrastructure/vector-service/logs/vectorization.log`

### 孤儿向量清理失败
1. 检查备份目录权限
2. 检查向量目录权限

## 更新历史

- 2026-03-01: 创建定时任务，整合孤儿向量清理和缺失向量修复功能
