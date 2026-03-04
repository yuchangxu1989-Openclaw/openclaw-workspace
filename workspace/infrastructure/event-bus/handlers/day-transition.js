'use strict';

/**
 * EventBus Handler: day.completed → day-transition
 * 
 * 当检测到 day.completed 事件时，自动触发Day流转：
 *   1. 分析当前Day的closure数据
 *   2. 生成Day N+1 scope文档
 *   3. 发射DTO信号供调度系统消费
 * 
 * @event day.completed
 * @payload {{ day: number }} day - 已完成的Day编号
 */

const { transition } = require('../../task-flow/day-transition');

module.exports = {
  name: 'day-transition-handler',
  events: ['day.completed'],
  
  handle(event) {
    const dayNum = event.payload?.day || event.payload?.dayNum;
    
    if (!dayNum || typeof dayNum !== 'number') {
      console.error('[day-transition-handler] Invalid event: missing or non-numeric day number');
      return { success: false, error: 'Missing day number' };
    }
    
    console.log(`[day-transition-handler] Day ${dayNum} completed, initiating transition to Day ${dayNum + 1}`);
    
    const result = transition(dayNum);
    
    if (result.success) {
      console.log(`[day-transition-handler] ✅ Transition ${dayNum} → ${result.nextDay} complete`);
    } else {
      console.error(`[day-transition-handler] ❌ Transition failed: ${result.error}`);
    }
    
    return result;
  }
};
