# SEEF-本地任务编排 自主决策自动化部署与验证指南

## 1. 系统要求

### 1.1 硬件要求
- **CPU**: 2核+
- **内存**: 4GB+
- **磁盘**: 20GB+ 可用空间

### 1.2 软件要求
- **操作系统**: Linux (Ubuntu 20.04+)
- **Python**: 3.8+
- **Node.js**: 16+
- **Git**: 2.25+

## 2. 部署步骤

### 2.1 环境准备

```bash
# 1. 进入工作目录
cd /root/.openclaw/workspace

# 2. 检查Python版本
python3 --version  # 需 >= 3.8

# 3. 检查Node.js版本
node --version     # 需 >= 16

# 4. 安装Python依赖
pip3 install watchdog  # 用于aligner文件监控

# 5. 安装Node.js依赖
cd skills/evomap-a2a
npm install ws
```

### 2.2 SEEF子技能部署

```bash
# 1. 确保子技能文件可执行
chmod +x /root/.openclaw/workspace/skills/seef/subskills/*.py

# 2. 验证子技能完整性
cd /root/.openclaw/workspace/skills/seef
python3 -m py_compile subskills/evaluator.py
python3 -m py_compile subskills/discoverer.py
python3 -m py_compile subskills/optimizer.py
python3 -m py_compile subskills/creator.py
python3 -m py_compile subskills/aligner.py
python3 -m py_compile subskills/validator.py
python3 -m py_compile subskills/recorder.py

# 3. 创建必要目录
mkdir -p /root/.openclaw/workspace/skills/seef/logs
mkdir -p /root/.openclaw/workspace/skills/seef/events
mkdir -p /root/.openclaw/workspace/skills/seef/backups
mkdir -p /root/.openclaw/workspace/skills/seef/evolution-pipeline
```

### 2.3 DTO事件总线配置

```bash
# 1. 创建DTO配置目录
mkdir -p /root/.openclaw/workspace/skills/lto-core/config

# 2. 创建事件总线配置
cat > /root/.openclaw/workspace/skills/lto-core/config/event-bus.json << 'EOF'
{
  "enabled": true,
  "persistence": {
    "enabled": true,
    "path": "/root/.openclaw/workspace/skills/seef/events"
  },
  "subscriptions": [
    "seef.evaluation.requested",
    "seef.discovery.requested",
    "seef.optimization.requested",
    "seef.creation.requested",
    "seef.alignment.requested",
    "seef.validation.requested",
    "seef.recording.requested"
  ]
}
EOF
```

### 2.4 定时任务配置

```bash
# 编辑crontab配置自动触发
crontab -e

# 添加以下内容（每日凌晨2点执行PDCA循环）
0 2 * * * cd /root/.openclaw/workspace/skills/seef && python3 seef.py --mode pdca >> /root/.openclaw/workspace/skills/seef/logs/cron.log 2>&1

# 验证crontab
crontab -l
```

## 3. 功能验证

### 3.1 单个子技能测试

```bash
cd /root/.openclaw/workspace/skills/seef

# 1. 测试Evaluator
echo "=== 测试 Evaluator ==="
python3 subskills/evaluator.py /root/.openclaw/workspace/skills/file-sender

# 2. 测试Discoverer
echo "=== 测试 Discoverer ==="
python3 subskills/discoverer.py

# 3. 测试Optimizer（需要evaluator和discoverer结果）
echo "=== 测试 Optimizer ==="
python3 subskills/evaluator.py /root/.openclaw/workspace/skills/file-sender -o /tmp/eval_result.json
python3 subskills/discoverer.py -o /tmp/discover_result.json
python3 subskills/optimizer.py -e /tmp/eval_result.json -d /tmp/discover_result.json

# 4. 测试Creator
echo "=== 测试 Creator ==="
python3 subskills/creator.py -n test-skill -t standard -d "Test skill for validation"

# 5. 测试Aligner
echo "=== 测试 Aligner ==="
python3 subskills/aligner.py /root/.openclaw/workspace/skills/file-sender --auto-fix

# 6. 测试Validator
echo "=== 测试 Validator ==="
python3 subskills/validator.py /root/.openclaw/workspace/skills/file-sender

# 7. 测试Recorder
echo "=== 测试 Recorder ==="
python3 subskills/recorder.py -t test_trace_001
```

### 3.2 主程序PDCA闭环测试

```bash
cd /root/.openclaw/workspace/skills/seef

# 1. 完整PDCA循环测试
echo "=== 完整PDCA循环测试 ==="
python3 seef.py --mode pdca --target /root/.openclaw/workspace/skills/file-sender

# 2. 固定闭环模式测试
echo "=== 固定闭环模式测试 ==="
python3 seef.py --mode fixed

# 3. 自由编排模式测试
echo "=== 自由编排模式测试 ==="
python3 seef.py --mode flexible --steps evaluator,discoverer,optimizer
```

### 3.3 EvoMap A2A协议测试

```bash
cd /root/.openclaw/workspace/skills/evomap-a2a

# 1. 模块加载测试
node -e "const EvoMapA2A = require('./index.js'); console.log('模块加载成功'); console.log('协议:', new EvoMapA2A().protocol);"

# 2. 本地模式测试（无需Hub）
node << 'EOF'
const EvoMapA2A = require('./index.js');

async function test() {
    const client = new EvoMapA2A({
        hubUrl: null,  // 本地模式
        nodeId: 'test_node_001'
    });
    
    console.log('状态:', client.getStatus());
    console.log('协议:', client.protocol);
    console.log('版本:', client.protocolVersion);
    
    // 测试消息构建
    const msg = client._buildMessage('test', { data: 'test' });
    console.log('消息格式验证:');
    console.log('  protocol:', msg.protocol);
    console.log('  protocol_version:', msg.protocol_version);
    console.log('  message_type:', msg.message_type);
    console.log('  message_id:', msg.message_id);
    console.log('  timestamp:', msg.timestamp);
    console.log('  node_id:', msg.node_id);
    console.log('  node_type:', msg.node_type);
    
    console.log('\n✓ EvoMap A2A协议测试通过');
}

test();
EOF
```

### 3.4 DTO事件总线测试

```bash
# 1. 检查事件目录
cd /root/.openclaw/workspace/skills/seef
ls -la events/

# 2. 手动触发事件测试
python3 << 'EOF'
import sys
sys.path.insert(0, '/root/.openclaw/workspace/skills/seef')
from seef import DTOEventBus

# 创建事件总线
bus = DTOEventBus()
bus.connect()

# 发布测试事件
result = bus.publish('seef.test.event', {
    'test': True,
    'timestamp': '2026-03-01T00:00:00Z'
})

print('事件发布成功:')
print(f'  类型: {result["event_type"]}')
print(f'  来源: {result["source"]}')

# 验证事件文件
import os
events_dir = '/root/.openclaw/workspace/skills/seef/events'
events = [f for f in os.listdir(events_dir) if f.startswith('seef.test.event')]
print(f'  事件文件: {len(events)} 个')

print('\n✓ DTO事件总线测试通过')
EOF
```

## 4. 集成验证

### 4.1 子技能间数据传递验证

```bash
# 运行完整PDCA并检查数据传递
cd /root/.openclaw/workspace/skills/seef
python3 seef.py --mode pdca --target /root/.openclaw/workspace/skills/file-sender 2>&1 | tee /tmp/seef_output.log

# 检查日志中的数据传递
echo "=== 数据传递检查 ==="
grep "数据管道" /tmp/seef_output.log || echo "未找到数据传递日志"

# 检查生成的日志文件
ls -la logs/seef_*.json | head -5
```

### 4.2 PDCA状态机验证

```bash
python3 << 'EOF'
import sys
sys.path.insert(0, '/root/.openclaw/workspace/skills/seef')
from seef import SEEF, PDCAState, PDCAPhase

# 创建SEEF实例
seef = SEEF()

# 验证PDCA状态转换
print('=== PDCA状态机验证 ===')
print(f'初始状态: {seef.pdca.state.value}')

# 模拟状态转换
seef.pdca.transition(PDCAState.DO)
print(f'DO状态: {seef.pdca.state.value}')

seef.pdca.transition(PDCAState.CHECK)
print(f'CHECK状态: {seef.pdca.state.value}')

seef.pdca.transition(PDCAState.ACT)
print(f'ACT状态: {seef.pdca.state.value}')

seef.pdca.transition(PDCAState.COMPLETED)
print(f'COMPLETED状态: {seef.pdca.state.value}')

print('\n✓ PDCA状态机验证通过')
EOF
```

### 4.3 ISC标准准入准出验证

```bash
python3 << 'EOF'
import sys
sys.path.insert(0, '/root/.openclaw/workspace/skills/seef')
from seef import ISCComplianceChecker

checker = ISCComplianceChecker()

# 测试准入检查
print('=== ISC准入检查测试 ===')
result = checker.check_entry('/root/.openclaw/workspace/skills/file-sender')
print(f'准入检查结果: {"通过" if result["passed"] else "未通过"}')
for check in result['checks']:
    status = '✓' if check['passed'] else '✗'
    print(f'  {status} {check["name"]}: {check["message"]}')

# 测试准出检查
print('\n=== ISC准出检查测试 ===')
validation_results = {'exit_status': 'approved'}
alignment_results = {'exit_status': 'aligned'}
result = checker.check_exit(validation_results, alignment_results)
print(f'准出检查结果: {"通过" if result["passed"] else "未通过"}')
for check in result['checks']:
    status = '✓' if check['passed'] else '✗'
    print(f'  {status} {check["name"]}: {check["message"]}')

print('\n✓ ISC标准验证通过')
EOF
```

## 5. 自动化验证脚本

```bash
# 创建自动化验证脚本
cat > /root/.openclaw/workspace/skills/seef/scripts/verify-deployment.sh << 'VERIFICATION_EOF'
#!/bin/bash
set -e

echo "========================================="
echo "SEEF-本地任务编排 部署验证脚本"
echo "========================================="

SEEF_DIR="/root/.openclaw/workspace/skills/seef"
cd "$SEEF_DIR"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# 计数器
PASSED=0
FAILED=0

# 测试函数
run_test() {
    local name="$1"
    local cmd="$2"
    
    echo -n "测试: $name ... "
    if eval "$cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}通过${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}失败${NC}"
        ((FAILED++))
        return 1
    fi
}

echo ""
echo "1. 文件完整性检查"
echo "-------------------"
run_test "evaluator.py存在" "test -f subskills/evaluator.py"
run_test "discoverer.py存在" "test -f subskills/discoverer.py"
run_test "optimizer.py存在" "test -f subskills/optimizer.py"
run_test "creator.py存在" "test -f subskills/creator.py"
run_test "aligner.py存在" "test -f subskills/aligner.py"
run_test "validator.py存在" "test -f subskills/validator.py"
run_test "recorder.py存在" "test -f subskills/recorder.py"
run_test "seef.py存在" "test -f seef.py"
run_test "evomap-a2a存在" "test -f /root/.openclaw/workspace/skills/evomap-a2a/index.js"
run_test "lto-subscriptions.yaml存在" "test -f config/lto-subscriptions.yaml"

echo ""
echo "2. 语法检查"
echo "------------"
run_test "evaluator语法" "python3 -m py_compile subskills/evaluator.py"
run_test "discoverer语法" "python3 -m py_compile subskills/discoverer.py"
run_test "optimizer语法" "python3 -m py_compile subskills/optimizer.py"
run_test "creator语法" "python3 -m py_compile subskills/creator.py"
run_test "aligner语法" "python3 -m py_compile subskills/aligner.py"
run_test "validator语法" "python3 -m py_compile subskills/validator.py"
run_test "recorder语法" "python3 -m py_compile subskills/recorder.py"
run_test "seef.py语法" "python3 -m py_compile seef.py"

echo ""
echo "3. 子技能基本功能测试"
echo "---------------------"
run_test "evaluator执行" "python3 subskills/evaluator.py /root/.openclaw/workspace/skills/file-sender > /dev/null"
run_test "discoverer执行" "timeout 30 python3 subskills/discoverer.py > /dev/null"
run_test "optimizer执行" "python3 subskills/optimizer.py > /dev/null"
run_test "creator执行" "python3 subskills/creator.py -n verify-test-skill -t standard > /dev/null"
run_test "aligner执行" "timeout 30 python3 subskills/aligner.py > /dev/null"
run_test "validator执行" "python3 subskills/validator.py /root/.openclaw/workspace/skills/file-sender > /dev/null"
run_test "recorder执行" "python3 subskills/recorder.py -t verify_trace > /dev/null"

echo ""
echo "4. PDCA闭环测试"
echo "---------------"
run_test "PDCA完整循环" "timeout 120 python3 seef.py --mode pdca > /dev/null"

echo ""
echo "5. 事件总线测试"
echo "---------------"
run_test "events目录可写" "test -d events && touch events/.test && rm events/.test"
run_test "DTO配置存在" "test -f /root/.openclaw/workspace/skills/lto-core/config/event-bus.json"

echo ""
echo "========================================="
echo "验证结果: $PASSED 通过, $FAILED 失败"
echo "========================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！部署成功。${NC}"
    exit 0
else
    echo -e "${RED}✗ 部分测试失败，请检查部署。${NC}"
    exit 1
fi
VERIFICATION_EOF

chmod +x /root/.openclaw/workspace/skills/seef/scripts/verify-deployment.sh

# 运行验证脚本
/root/.openclaw/workspace/skills/seef/scripts/verify-deployment.sh
```

## 6. 故障排查

### 6.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 子技能导入失败 | Python路径问题 | 检查 `sys.path.insert` 是否正确 |
| DTO事件未生成 | events目录权限 | 确保events目录可写 |
| PDCA状态卡住 | 子技能返回异常 | 检查子技能日志 |
| EvoMap连接失败 | Hub URL未配置 | 检查 `EVOMAP_HUB_URL` 环境变量 |

### 6.2 日志检查

```bash
# 查看最近日志
tail -50 /root/.openclaw/workspace/skills/seef/logs/seef_*.json

# 查看事件文件
ls -lt /root/.openclaw/workspace/skills/seef/events/ | head -20

# 查看crontab日志
tail -20 /root/.openclaw/workspace/skills/seef/logs/cron.log
```

### 6.3 重置操作

```bash
# 清理事件文件
rm -f /root/.openclaw/workspace/skills/seef/events/*.json

# 清理临时结果
rm -f /tmp/eval_result.json /tmp/discover_result.json

# 重置知识库（谨慎操作）
rm -f /root/.openclaw/workspace/skills/seef/evolution.db
```

## 7. 验证清单

部署完成后，请确认以下检查项：

- [ ] 所有7个子技能文件存在且可执行
- [ ] Python语法检查全部通过
- [ ] DTO事件总线配置正确
- [ ] events目录可写
- [ ] crontab定时任务已配置
- [ ] 单个子技能测试通过
- [ ] PDCA闭环测试通过
- [ ] EvoMap A2A协议字段正确
- [ ] 数据传递管道工作正常
- [ ] ISC标准检查工作正常

## 8. 后续维护

### 8.1 定期维护任务

```bash
# 每周执行
0 0 * * 0 /root/.openclaw/workspace/skills/seef/scripts/verify-deployment.sh >> /var/log/seef-verify.log 2>&1

# 每月清理旧日志
0 2 1 * * find /root/.openclaw/workspace/skills/seef/logs -name "*.json" -mtime +30 -delete
```

### 8.2 监控指标

```bash
# 检查执行成功率
grep -c '"status": "completed"' /root/.openclaw/workspace/skills/seef/logs/seef_*.json 2>/dev/null || echo "0"

# 检查事件生成数量
ls /root/.openclaw/workspace/skills/seef/events/*.json 2>/dev/null | wc -l

# 检查知识库大小
du -h /root/.openclaw/workspace/skills/seef/evolution.db 2>/dev/null || echo "N/A"
```

---

**文档版本**: 1.0.0  
**最后更新**: 2026-03-01  
**维护者**: SEEF-本地任务编排 Team
