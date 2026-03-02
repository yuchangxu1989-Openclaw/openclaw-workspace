'use strict';

const path = require('path');
const bus = require(path.join(__dirname, '..', '..', 'infrastructure', 'event-bus', 'bus.js'));

/**
 * AEO 事件桥接
 * 
 * 将 AEO 评测结果发布到事件总线，供下游系统（如 CRAS）消费。
 * 
 * 事件类型：
 *   aeo.assessment.completed - 评测通过
 *   aeo.assessment.failed    - 评测未通过
 *   aeo.assessment.batch     - 批量评测完成
 */

/**
 * AEO 评测完成后调用此函数发布事件
 * @param {Object} result - 评测结果
 * @param {string} result.skill_name - 技能名称
 * @param {string} result.track - 评测轨道 ('effect' 或 'quality')
 * @param {number} result.score - 评测分数
 * @param {boolean} result.passed - 是否通过
 * @param {Array} [result.issues] - 发现的问题列表
 * @returns {Object} 发布的事件对象
 */
function onAssessmentComplete(result) {
  const eventType = result.passed
    ? 'aeo.assessment.completed'
    : 'aeo.assessment.failed';

  const event = bus.emit(eventType, {
    skill_name: result.skill_name,
    track: result.track,
    score: result.score,
    passed: result.passed,
    issues: result.issues || [],
    timestamp: Date.now()
  }, 'aeo');

  console.log(`[AEO-Bridge] 发布事件: ${eventType} for ${result.skill_name}`);
  return event;
}

/**
 * 批量发布评测结果
 * @param {Array<Object>} results - 评测结果数组
 * @returns {Array<Object>} 发布的事件数组
 */
function publishBatchResults(results) {
  const events = results.map(r => onAssessmentComplete(r));

  // 额外发布一个批量汇总事件
  const summary = {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    skills: results.map(r => r.skill_name),
    timestamp: Date.now()
  };

  bus.emit('aeo.assessment.batch', summary, 'aeo');
  console.log(`[AEO-Bridge] 批量发布完成: ${summary.passed}/${summary.total} 通过`);

  return events;
}

module.exports = { onAssessmentComplete, publishBatchResults };
