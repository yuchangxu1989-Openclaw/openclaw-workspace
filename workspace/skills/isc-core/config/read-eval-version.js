/**
 * 评测标准版本动态读取器
 * 所有需要引用评测标准版本的JS文件统一从这里读取
 * 升级版本只需改 eval-standard-version.json
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'eval-standard-version.json');

function getEvalStandard() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error(`[eval-version] 无法读取 ${CONFIG_PATH}: ${e.message}`);
    return { version: 'UNKNOWN', doc_token: '', updated_at: '' };
  }
}

module.exports = { getEvalStandard, CONFIG_PATH };
