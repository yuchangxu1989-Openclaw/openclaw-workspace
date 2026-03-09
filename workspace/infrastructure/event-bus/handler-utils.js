'use strict';

/**
 * handler-utils.js — ISC Handler 公共组件库
 *
 * 从50+个handler中抽取的重复逻辑，统一维护。
 * 用法: const { gitExec, writeReport, emitEvent, ... } = require('./handler-utils');
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 在指定仓库根目录执行 git 命令
 * @param {string} root - 仓库根目录路径
 * @param {string} cmd - git 子命令（不含 "git" 前缀）
 * @param {object} [opts] - 可选配置
 * @param {number} [opts.timeout=10000] - 超时毫秒数
 * @returns {string} 命令输出（已trim），出错返回空字符串
 */
function gitExec(root, cmd, opts = {}) {
  const timeout = opts.timeout || 10000;
  try {
    return execSync(`cd "${root}" && git ${cmd}`, {
      encoding: 'utf8',
      timeout,
    }).trim();
  } catch {
    return '';
  }
}

/**
 * 将数据写入 JSON 报告文件，自动创建父目录
 * @param {string} filePath - 报告文件路径
 * @param {any} data - 要序列化的数据
 * @param {object} [opts] - 可选配置
 * @param {number} [opts.indent=2] - JSON 缩进空格数
 * @returns {string} 写入的文件路径
 */
function writeReport(filePath, data, opts = {}) {
  const indent = opts.indent ?? 2;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, indent) + '\n', 'utf8');
  return filePath;
}

/**
 * 通过事件总线发射事件（安全调用，bus 不存在时静默跳过）
 * @param {object} bus - 事件总线实例（需有 emit 方法）
 * @param {string} eventName - 事件名称
 * @param {object} payload - 事件载荷
 * @returns {Promise<boolean>} 是否成功发射
 */
async function emitEvent(bus, eventName, payload) {
  if (!bus?.emit) return false;
  try {
    await bus.emit(eventName, payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * 扫描目录下匹配指定模式的文件，对每个文件执行回调
 * @param {string} dir - 扫描目录
 * @param {RegExp} pattern - 文件名匹配正则
 * @param {function} callback - 回调函数 (filePath, fileName) => void
 * @param {object} [opts] - 可选配置
 * @param {number} [opts.maxDepth=5] - 最大递归深度
 * @param {string[]} [opts.skip] - 跳过的目录名
 * @returns {string[]} 匹配的文件路径列表
 */
function scanFiles(dir, pattern, callback, opts = {}) {
  const maxDepth = opts.maxDepth ?? 5;
  const skip = opts.skip || ['node_modules', '.git', '.entropy-archive'];
  const matched = [];

  function walk(d, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.includes(entry.name)) continue;
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        matched.push(fullPath);
        if (callback) callback(fullPath, entry.name);
      }
    }
  }

  walk(dir, 0);
  return matched;
}

/**
 * 检查文件是否存在
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function checkFileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * 读取并解析 ISC 规则 JSON 文件
 * @param {string} rulePath - 规则文件路径
 * @returns {object|null} 解析后的规则对象，失败返回 null
 */
function readRuleJson(rulePath) {
  try {
    const content = fs.readFileSync(rulePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 统一的门禁结果输出格式
 * @param {string} ruleName - 规则/门禁名称
 * @param {Array<{name: string, ok: boolean, message?: string}>} checks - 检查项列表
 * @param {object} [opts] - 可选配置
 * @param {boolean} [opts.failClosed=true] - 出错时是否默认阻塞（fail-closed）
 * @returns {{ok: boolean, status: string, ruleName: string, passed: number, failed: number, total: number, checks: Array, exitCode: number}}
 */
function gateResult(ruleName, checks, opts = {}) {
  const failClosed = opts.failClosed !== false;
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.length - passed;
  const ok = failed === 0;

  let status;
  if (ok) {
    status = 'pass';
  } else if (failClosed) {
    status = 'blocked';
  } else {
    status = 'fail';
  }

  return {
    ok,
    status,
    ruleName,
    passed,
    failed,
    total: checks.length,
    checks,
    exitCode: ok ? 0 : 1,
  };
}

module.exports = {
  gitExec,
  writeReport,
  emitEvent,
  scanFiles,
  checkFileExists,
  readRuleJson,
  gateResult,
};
