#!/usr/bin/env node
/**
 * Todo.md 自动管理机制
 * 自动扩展任务清单，集成到 ISC 反思改进层
 */

const fs = require('fs');
const path = require('path');
const { WORKSPACE } = require('../shared/paths');

const TODO_PATH = path.join(WORKSPACE, 'todo.md');

class TodoManager {
  constructor() {
    this.tasks = [];
    this.load();
  }

  load() {
    if (fs.existsSync(TODO_PATH)) {
      const content = fs.readFileSync(TODO_PATH, 'utf-8');
      this.parse(content);
    }
  }

  parse(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^- \[([ x])\] (.+)$/);
      if (match) {
        this.tasks.push({
          done: match[1] === 'x',
          text: match[2],
          created: new Date().toISOString()
        });
      }
    }
  }

  addTask(text, priority = 'medium') {
    const task = {
      done: false,
      text,
      priority,
      created: new Date().toISOString(),
      id: `task_${Date.now()}`
    };
    this.tasks.push(task);
    this.save();
    return task;
  }

  completeTask(index) {
    if (this.tasks[index]) {
      this.tasks[index].done = true;
      this.tasks[index].completed = new Date().toISOString();
      this.save();
      return true;
    }
    return false;
  }

  // 从大任务自动分解子任务
  decomposeTask(bigTask) {
    const subtasks = [];
    
    // 根据任务类型自动分解
    if (bigTask.includes('构建') || bigTask.includes('开发')) {
      subtasks.push('需求分析');
      subtasks.push('架构设计');
      subtasks.push('核心实现');
      subtasks.push('测试验证');
      subtasks.push('文档编写');
    } else if (bigTask.includes('集成') || bigTask.includes('部署')) {
      subtasks.push('环境准备');
      subtasks.push('配置检查');
      subtasks.push('逐步集成');
      subtasks.push('验证测试');
    } else {
      subtasks.push('分析调研');
      subtasks.push('方案设计');
      subtasks.push('实施执行');
      subtasks.push('验证完成');
    }

    const parent = this.addTask(bigTask, 'high');
    for (const sub of subtasks) {
      this.addTask(`  └─ ${sub}`, 'medium');
    }
    
    return parent;
  }

  // 发现后续任务时自动添加
  discoverFollowUp(originalTask, newTask) {
    this.addTask(`[后续] ${newTask} (from: ${originalTask})`, 'medium');
  }

  save() {
    const lines = ['# Todo 清单', '', '## 进行中', ''];
    
    for (const task of this.tasks.filter(t => !t.done)) {
      const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
      lines.push(`- [ ] ${priority} ${task.text}`);
    }
    
    lines.push('', '## 已完成', '');
    for (const task of this.tasks.filter(t => t.done)) {
      lines.push(`- [x] ${task.text}`);
    }
    
    fs.writeFileSync(TODO_PATH, lines.join('\n'), 'utf-8');
  }

  getReport() {
    const pending = this.tasks.filter(t => !t.done).length;
    const done = this.tasks.filter(t => t.done).length;
    return `Todo: ${pending} 待办 / ${done} 已完成`;
  }
}

// 导出模块
module.exports = { TodoManager };

// 直接运行
if (require.main === module) {
  const todo = new TodoManager();
  console.log(todo.getReport());
}
