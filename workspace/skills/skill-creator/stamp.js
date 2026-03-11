'use strict';
/**
 * skill-creator 流水线标记模块
 * 在流水线成功执行后写入 .skill-creator-stamp 到目标技能目录
 */
const fs = require('fs');
const path = require('path');

function writeStamp(skillDir, pipelineSteps = ['validate', 'create', 'post-create']) {
  const stamp = {
    created_by: 'skill-creator',
    timestamp: new Date().toISOString(),
    version: '1.0',
    pipeline_steps: pipelineSteps,
  };
  const stampPath = path.join(skillDir, '.skill-creator-stamp');
  fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 2) + '\n');
  return stampPath;
}

function verifyStamp(skillDir) {
  const stampPath = path.join(skillDir, '.skill-creator-stamp');
  if (!fs.existsSync(stampPath)) return { valid: false, reason: 'stamp文件不存在' };
  try {
    const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
    if (stamp.created_by !== 'skill-creator') return { valid: false, reason: 'created_by不是skill-creator' };
    if (!stamp.timestamp) return { valid: false, reason: '缺少timestamp' };
    return { valid: true, stamp };
  } catch (e) {
    return { valid: false, reason: `stamp解析失败: ${e.message}` };
  }
}

module.exports = { writeStamp, verifyStamp };
