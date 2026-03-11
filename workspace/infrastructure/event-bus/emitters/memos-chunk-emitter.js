'use strict';
/**
 * memos-chunk-emitter.js
 * MemOS chunk 事件发射器
 *
 * 当 MemOS 写入新 chunk 时调用 emitChunkCreated()，
 * 向 L3 EventBus 发布 memos.chunk.created 事件。
 *
 * 消费者：向量化服务、纠偏引擎、统计聚合等。
 *
 * 用法：
 *   const { emitChunkCreated } = require('./emitters/memos-chunk-emitter');
 *   emitChunkCreated({ chunkId, content, summary, scope, sessionKey });
 */

const path = require('path');
const bus = require(path.join(__dirname, '..', 'bus.js'));

const SOURCE = 'memos';

/**
 * 发布 memos.chunk.created 事件
 * @param {object} opts
 * @param {string} opts.chunkId   - chunk 唯一 ID
 * @param {string} [opts.content] - chunk 文本（可截断，避免事件过大）
 * @param {string} [opts.summary] - 摘要
 * @param {string} [opts.scope]   - public | private
 * @param {string} [opts.sessionKey] - 来源会话
 * @param {string} [opts.role]    - user | assistant | system
 * @param {object} [opts.extra]   - 任意附加元数据
 * @returns {object} 发布的事件对象
 */
function emitChunkCreated(opts = {}) {
  const { chunkId, content, summary, scope, sessionKey, role, extra } = opts;

  if (!chunkId) {
    throw new Error('[memos-chunk-emitter] chunkId is required');
  }

  const payload = {
    chunkId,
    scope: scope || 'private',
    timestamp: new Date().toISOString(),
  };

  // 可选字段，只在有值时附加
  if (summary)    payload.summary = summary;
  if (sessionKey) payload.sessionKey = sessionKey;
  if (role)       payload.role = role;
  if (content)    payload.contentPreview = content.slice(0, 500); // 截断防膨胀
  if (extra)      payload.extra = extra;

  return bus.emit('memos.chunk.created', payload, SOURCE);
}

/**
 * 发布 memos.chunk.deleted 事件（预留）
 */
function emitChunkDeleted(opts = {}) {
  const { chunkId, reason } = opts;
  if (!chunkId) throw new Error('[memos-chunk-emitter] chunkId is required');

  return bus.emit('memos.chunk.deleted', {
    chunkId,
    reason: reason || 'unknown',
    timestamp: new Date().toISOString(),
  }, SOURCE);
}

module.exports = { emitChunkCreated, emitChunkDeleted };
