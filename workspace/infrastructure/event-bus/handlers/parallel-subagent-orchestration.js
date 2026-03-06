'use strict';

/**
 * 自主执行器：并行子Agent编排
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 复杂任务 → 自动拆分为并行/串行阶段 → 协调子Agent执行 → 汇总结果 → 闭环
 */

const fs = require('fs');
const path = require('path');

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const workflow = rule.workflow || payload.workflow;

  if (!workflow || !workflow.stages) {
    return { status: 'skip', reason: '无工作流定义' };
  }

  const config = rule.executor?.config || { max_parallel: 5, retry_failed: true, aggregate_results: true };
  const results = { stages: [], totalAgents: 0, completed: 0, failed: 0 };

  // 按阶段执行
  for (const stage of workflow.stages) {
    const stageResult = {
      name: stage.name,
      type: stage.type,
      agents: [],
      status: 'pending',
    };

    // 检查依赖
    if (stage.depends_on && stage.depends_on.length > 0) {
      const unmet = stage.depends_on.filter(dep => {
        const depStage = results.stages.find(s => s.name === dep);
        return !depStage || depStage.status !== 'completed';
      });
      if (unmet.length > 0) {
        stageResult.status = 'skipped';
        stageResult.reason = `依赖未满足: ${unmet.join(', ')}`;
        results.stages.push(stageResult);
        continue;
      }
    }

    const agents = stage.agents || [];
    results.totalAgents += agents.length;

    if (stage.type === 'parallel') {
      // 并行执行 - 通过事件总线分发
      const parallelTasks = agents.map(agent => ({
        role: agent.role,
        task: agent.task,
        timeout: agent.timeout || 120,
        status: 'dispatched',
      }));

      // 发送调度事件
      for (const task of parallelTasks) {
        if (context?.bus?.emit) {
          context.bus.emit('orchestration.subagent.dispatch', {
            stage: stage.name,
            role: task.role,
            task: task.task,
            timeout: task.timeout,
            ruleId: rule.id,
          });
        }
        task.status = 'dispatched';
        stageResult.agents.push(task);
      }

      stageResult.status = 'completed';
      results.completed += agents.length;

    } else if (stage.type === 'sequential') {
      // 串行执行
      for (const agent of agents) {
        const agentResult = {
          role: agent.role,
          task: agent.task,
          status: 'dispatched',
        };

        if (context?.bus?.emit) {
          context.bus.emit('orchestration.subagent.dispatch', {
            stage: stage.name,
            role: agent.role,
            task: agent.task,
            timeout: agent.timeout || 120,
            ruleId: rule.id,
            sequential: true,
          });
        }

        agentResult.status = 'dispatched';
        stageResult.agents.push(agentResult);
        results.completed++;
      }
      stageResult.status = 'completed';
    }

    results.stages.push(stageResult);
  }

  // 记录编排日志
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logEntry = {
    timestamp: new Date().toISOString(),
    ruleId: rule.id,
    stages: results.stages.length,
    totalAgents: results.totalAgents,
    status: results.failed > 0 ? 'partial' : 'dispatched',
  };
  try {
    fs.appendFileSync(
      path.join(logDir, 'orchestration.jsonl'),
      JSON.stringify(logEntry) + '\n'
    );
  } catch { /* best effort */ }

  return {
    status: 'dispatched',
    stages: results.stages.length,
    totalAgents: results.totalAgents,
    dispatched: results.completed,
    failed: results.failed,
  };
};
