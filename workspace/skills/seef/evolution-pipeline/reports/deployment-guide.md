# EvoMap进化流水线 - 部署文档

**版本:** 1.0.0  
**适用环境:** Linux (Ubuntu 22.04+)  
**更新日期:** 2026-03-01

---

## 目录

1. [环境准备](#1-环境准备)
2. [安装步骤](#2-安装步骤)
3. [配置详解](#3-配置详解)
4. [启动与运行](#4-启动与运行)
5. [系统集成](#5-系统集成)
6. [升级与维护](#6-升级与维护)
7. [故障排查](#7-故障排查)

---

## 1. 环境准备

### 1.1 系统要求

| 组件 | 最低要求 | 推荐配置 |
|:-----|:---------|:---------|
| 操作系统 | Ubuntu 20.04 | Ubuntu 22.04 LTS |
| Node.js | 18.x | 22.x |
| 内存 | 512 MB | 1 GB |
| 磁盘 | 1 GB | 5 GB |
| CPU | 1 核 | 2 核 |

### 1.2 前置依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # v22.x.x
npm --version   # 10.x.x

# 安装 Git
sudo apt install -y git

# 安装常用工具
sudo apt install -y vim htop curl wget
```

### 1.3 目录准备

```bash
# 创建工作目录
sudo mkdir -p /opt/openclaw
sudo chown $USER:$USER /opt/openclaw

# 或者使用现有工作空间
mkdir -p /root/.openclaw/workspace
```

---

## 2. 安装步骤

### 2.1 方式一: 源码安装（推荐）

```bash
# 进入工作目录
cd /root/.openclaw/workspace/skills

# 确认 evolution-pipeline 已存在
ls -la seef/evolution-pipeline/

# 进入项目目录
cd seef/evolution-pipeline

# 安装依赖
npm install

# 验证安装
node src/index.js --help
```

### 2.2 方式二: 克隆安装

```bash
# 如果尚未存在，可以克隆
# git clone https://github.com/openclaw/seef-evolution-pipeline.git
# cd seef-evolution-pipeline
# npm install
```

### 2.3 验证安装

```bash
# 运行单元测试
npm test

# 运行集成测试
node tests/e2e-test.js

# 检查版本
node -e "import('./src/index.js').then(m => console.log('模块加载成功'))"
```

---

## 3. 配置详解

### 3.1 主配置文件

配置文件路径: `config/pipeline.config.json`

```bash
# 复制示例配置（如有）
# cp config/pipeline.config.example.json config/pipeline.config.json

# 编辑配置
vim config/pipeline.config.json
```

### 3.2 配置项说明

#### 3.2.1 监控配置 (watch)

```json
{
  "watch": {
    "paths": [
      "/root/.openclaw/workspace/skills"
    ],
    "ignored": [
      "**/node_modules/**",
      "**/.git/**",
      "**/.pipeline/**",
      "**/logs/**",
      "**/tests/**",
      "**/*.log",
      "**/evolution-pipeline/**"
    ],
    "debounceMs": 300000,
    "checkIntervalMs": 300000
  }
}
```

| 参数 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `paths` | 监控的目录列表 | - |
| `ignored` | 忽略的文件模式 | - |
| `debounceMs` | 防抖时间（毫秒） | 300000 (5分钟) |
| `checkIntervalMs` | 检查间隔（毫秒） | 300000 |

#### 3.2.2 流水线状态配置 (pipeline)

```json
{
  "pipeline": {
    "states": {
      "DEVELOP": {
        "next": ["TEST"],
        "autoTransition": false,
        "timeoutMinutes": null
      },
      "TEST": {
        "next": ["REVIEW", "DEVELOP"],
        "autoTransition": true,
        "timeoutMinutes": 30
      }
    }
  }
}
```

#### 3.2.3 ISC校验配置 (isc)

```json
{
  "isc": {
    "minScore": 70,
    "maxScore": 100,
    "autoFix": false,
    "reportFormat": "json",
    "requiredDimensions": {
      "basicCompleteness": {
        "minScore": 30,
        "weight": 0.4
      },
      "standardCompliance": {
        "minScore": 20,
        "weight": 0.3
      },
      "contentAccuracy": {
        "minScore": 15,
        "weight": 0.2
      },
      "extensionCompleteness": {
        "minScore": 5,
        "weight": 0.1
      }
    }
  }
}
```

| 参数 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `minScore` | 最低通过分数 | 70 |
| `autoFix` | 自动修复问题 | false |
| `reportFormat` | 报告格式 | json |

#### 3.2.4 EvoMap同步配置 (evomap)

```json
{
  "evomap": {
    "hubUrl": "wss://hub.evomap.network",
    "autoSync": true,
    "syncIntervalMs": 600000,
    "maxRetries": 3,
    "retryDelayMs": 5000,
    "offlineMode": true
  }
}
```

| 参数 | 说明 | 默认值 |
|:-----|:-----|:-------|
| `hubUrl` | EvoMap Hub地址 | wss://hub.evomap.network |
| `autoSync` | 自动同步 | true |
| `syncIntervalMs` | 同步间隔 | 600000 (10分钟) |
| `maxRetries` | 最大重试次数 | 3 |
| `offlineMode` | 离线模式 | true (开发测试) |

#### 3.2.5 通知配置 (notification)

```json
{
  "notification": {
    "enabled": true,
    "channels": ["console", "file"],
    "logPath": "/root/.openclaw/workspace/skills/seef/evolution-pipeline/logs"
  }
}
```

#### 3.2.6 存储配置 (storage)

```json
{
  "storage": {
    "type": "filesystem",
    "statePath": "/root/.openclaw/workspace/skills/seef/evolution-pipeline/.pipeline/state",
    "backupEnabled": true,
    "backupIntervalHours": 24
  }
}
```

### 3.3 环境变量配置

创建 `.env` 文件:

```bash
# 工作模式
NODE_ENV=production

# 日志级别
LOG_LEVEL=info

# EvoMap Hub认证（如需要）
# EVOMAP_API_KEY=your-api-key
# EVOMAP_API_SECRET=your-api-secret

# 自定义状态目录（可选）
# STATE_DIR=/custom/state/path
```

---

## 4. 启动与运行

### 4.1 交互式运行

```bash
# 进入项目目录
cd /root/.openclaw/workspace/skills/seef/evolution-pipeline

# 启动监控模式
node src/index.js watch

# 或使用 npm
npm run watch
```

### 4.2 后台运行

```bash
# 使用 nohup
nohup node src/index.js watch > logs/pipeline.log 2>&1 &

# 查看进程
ps aux | grep evolution-pipeline

# 停止进程
kill $(pgrep -f "evolution-pipeline")
```

### 4.3 手动触发

```bash
# 执行单次流水线
node src/index.js run

# 执行指定技能
node src/index.js run isc-core

# 扫描所有技能
node src/index.js scan

# 查看状态
node src/index.js status
```

### 4.4 运行模式说明

| 模式 | 命令 | 说明 |
|:-----|:-----|:-----|
| 监控模式 | `watch` | 持续监控文件变化 |
| 单次模式 | `run` | 执行一次后退出 |
| 扫描模式 | `scan` | 扫描并显示所有技能状态 |
| 状态模式 | `status` | 显示当前系统状态 |

---

## 5. 系统集成

### 5.1 Systemd 服务（推荐）

创建服务文件:

```bash
sudo tee /etc/systemd/system/evolution-pipeline.service > /dev/null << 'EOF'
[Unit]
Description=EvoMap Evolution Pipeline
Documentation=https://docs.openclaw.io/evolution-pipeline
After=network.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/root/.openclaw/workspace/skills/seef/evolution-pipeline
ExecStart=/usr/bin/node src/index.js watch
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=evolution-pipeline
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info

# 资源限制
LimitAS=1G
LimitRSS=500M
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF
```

管理服务:

```bash
# 重新加载配置
sudo systemctl daemon-reload

# 启用开机启动
sudo systemctl enable evolution-pipeline

# 启动服务
sudo systemctl start evolution-pipeline

# 查看状态
sudo systemctl status evolution-pipeline

# 查看日志
sudo journalctl -u evolution-pipeline -f

# 停止服务
sudo systemctl stop evolution-pipeline

# 重启服务
sudo systemctl restart evolution-pipeline
```

### 5.2 Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# 复制项目文件
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# 创建状态目录
RUN mkdir -p .pipeline/state logs

# 非root用户运行
USER node

EXPOSE 3000

CMD ["node", "src/index.js", "watch"]
```

构建与运行:

```bash
# 构建镜像
docker build -t evolution-pipeline:1.0.0 .

# 运行容器
docker run -d \
  --name evolution-pipeline \
  -v /root/.openclaw/workspace/skills:/skills:ro \
  -v $(pwd)/.pipeline/state:/app/.pipeline/state \
  -v $(pwd)/logs:/app/logs \
  evolution-pipeline:1.0.0

# 查看日志
docker logs -f evolution-pipeline
```

### 5.3 日志轮转

创建日志轮转配置:

```bash
sudo tee /etc/logrotate.d/evolution-pipeline > /dev/null << 'EOF'
/root/.openclaw/workspace/skills/seef/evolution-pipeline/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 openclaw openclaw
    sharedscripts
    postrotate
        systemctl reload evolution-pipeline > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

## 6. 升级与维护

### 6.1 版本升级

```bash
# 1. 停止服务
sudo systemctl stop evolution-pipeline

# 2. 备份状态
cp -r .pipeline/state .pipeline/state.backup.$(date +%Y%m%d)

# 3. 拉取更新
git pull origin main

# 4. 更新依赖
npm install

# 5. 运行迁移（如有）
# node scripts/migrate.js

# 6. 验证
npm test

# 7. 启动服务
sudo systemctl start evolution-pipeline
```

### 6.2 数据备份

```bash
#!/bin/bash
# backup.sh - 备份脚本

BACKUP_DIR="/backup/evolution-pipeline"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份状态文件
tar czf $BACKUP_DIR/state_$DATE.tar.gz .pipeline/state/

# 备份配置
cp config/pipeline.config.json $BACKUP_DIR/config_$DATE.json

# 保留最近30个备份
ls -t $BACKUP_DIR/state_*.tar.gz | tail -n +31 | xargs rm -f

echo "备份完成: $BACKUP_DIR/state_$DATE.tar.gz"
```

添加到 crontab:

```bash
# 每天凌晨3点备份
0 3 * * * /root/.openclaw/workspace/skills/seef/evolution-pipeline/scripts/backup.sh
```

### 6.3 健康检查

创建健康检查脚本 `scripts/health-check.sh`:

```bash
#!/bin/bash

PID=$(pgrep -f "evolution-pipeline")
if [ -z "$PID" ]; then
    echo "ERROR: 进程未运行"
    exit 1
fi

# 检查内存使用
MEM=$(ps -p $PID -o %mem --no-headers | tr -d ' ')
if (( $(echo "$MEM > 80" | bc -l) )); then
    echo "WARNING: 内存使用过高 ${MEM}%"
fi

# 检查磁盘空间
DISK=$(df -h . | tail -1 | awk '{print $5}' | tr -d '%')
if [ $DISK -gt 90 ]; then
    echo "ERROR: 磁盘空间不足 ${DISK}%"
    exit 1
fi

echo "OK: 系统健康"
exit 0
```

---

## 7. 故障排查

### 7.1 查看日志

```bash
# Systemd 日志
sudo journalctl -u evolution-pipeline -n 100 --no-pager

# 实时日志
sudo journalctl -u evolution-pipeline -f

# 应用日志
tail -f logs/pipeline.log

# 错误日志
grep ERROR logs/pipeline.log
```

### 7.2 常见问题

#### 问题1: 服务无法启动

**症状**: `systemctl start` 失败

**排查**:
```bash
# 查看详细错误
sudo journalctl -u evolution-pipeline -n 50

# 检查配置文件
node -e "JSON.parse(require('fs').readFileSync('config/pipeline.config.json'))"

# 检查权限
ls -la .pipeline/
ls -la logs/
```

**解决**:
```bash
# 修复权限
chmod 755 .pipeline logs
chmod 644 config/pipeline.config.json
```

#### 问题2: 文件监控不生效

**症状**: 修改技能文件后无响应

**排查**:
```bash
# 检查 inotify 限制
cat /proc/sys/fs/inotify/max_user_watches

# 检查监控进程
lsof +D /root/.openclaw/workspace/skills | grep node
```

**解决**:
```bash
# 增加 inotify 限制
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

#### 问题3: 状态文件损坏

**症状**: 报错 "状态文件解析失败"

**解决**:
```bash
# 备份损坏的状态
mv .pipeline/state/{skill-id}.json .pipeline/state/{skill-id}.json.corrupted

# 系统将自动创建新状态文件
# 或手动重置
node -e "
const fs = require('fs');
const data = {
  skillId: '{skill-id}',
  currentState: 'idle',
  history: [],
  savedAt: new Date().toISOString()
};
fs.writeFileSync('.pipeline/state/{skill-id}.json', JSON.stringify(data, null, 2));
"
```

#### 问题4: 内存泄漏

**症状**: 内存持续增长

**排查**:
```bash
# 查看内存使用
ps aux | grep evolution-pipeline

# 生成堆转储
node --heap-prof src/index.js watch

# 分析堆转储
# 使用 Chrome DevTools 分析 .heapprofile 文件
```

**解决**:
- 重启服务: `sudo systemctl restart evolution-pipeline`
- 检查是否有大量未清理的状态机实例
- 调整垃圾回收策略

### 7.3 性能调优

```bash
# Node.js 性能优化
export NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size"

# 在 systemd 服务中设置
sudo systemctl edit evolution-pipeline
```

添加:
```ini
[Service]
Environment="NODE_OPTIONS=--max-old-space-size=512"
```

### 7.4 联系支持

- **文档**: https://docs.openclaw.io/evolution-pipeline
- **Issues**: https://github.com/openclaw/seef-evolution-pipeline/issues
- **邮件**: support@openclaw.io

---

## 附录

### A. 目录结构

```
/root/.openclaw/workspace/skills/seef/evolution-pipeline/
├── src/                    # 源代码
├── config/                 # 配置文件
├── tests/                  # 测试文件
├── reports/                # 测试报告
├── docs/                   # 文档
├── logs/                   # 日志目录（运行后创建）
├── .pipeline/              # 运行时状态（运行后创建）
│   └── state/              # 状态文件
├── scripts/                # 脚本工具
├── package.json            # 项目配置
├── SKILL.md                # 技能定义
└── README.md               # 使用说明
```

### B. 快速命令参考

```bash
# 启动
npm run watch

# 停止
pkill -f evolution-pipeline

# 状态
sudo systemctl status evolution-pipeline

# 日志
sudo journalctl -u evolution-pipeline -f

# 测试
npm test
node tests/e2e-test.js
node tests/performance-test.js
node tests/chaos-test.js
```

---

**文档版本:** 1.0.0  
**维护者:** SEEF Core Team  
**最后更新:** 2026-03-01
