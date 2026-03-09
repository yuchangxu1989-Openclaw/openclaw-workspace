#!/bin/bash
# spawn-glm5.sh - spawn GLM-5 子Agent脚本
# 用法: ./spawn-glm5.sh "任务描述"

TASK="$1"

if [ -z "$TASK" ]; then
    echo "用法: $0 '任务描述'"
    exit 1
fi

# 加载GLM-5 Key
export $(grep -v '^#' /root/.openclaw/.secrets/zhipu-keys.env | xargs)

# 将任务写入临时文件（避免命令行引号问题）
TEMP_FILE=$(mktemp)
echo "$TASK" > "$TEMP_FILE"

# 调用GLM-5技能执行
cd /root/.openclaw/workspace/skills/glm-5-coder
node -e "
const fs = require('fs');
const GLM5Coder = require('./index.cjs');

const task = fs.readFileSync('$TEMP_FILE', 'utf8');
const coder = new GLM5Coder();

coder.code(task).then(result => {
  console.log(result.content);
  if (result.reasoning) {
    console.log('\n--- 思考过程 ---\n', result.reasoning);
  }
  fs.unlinkSync('$TEMP_FILE');
}).catch(err => {
  console.error('Error:', err.message);
  fs.unlinkSync('$TEMP_FILE');
  process.exit(1);
});
"
