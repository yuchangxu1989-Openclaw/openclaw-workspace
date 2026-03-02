class TriggerRegistry {
  constructor() {
    this.triggers = new Map();
  }

  register(taskId, trigger) {
    const key = `${trigger.type}:${taskId}`;
    this.triggers.set(key, { taskId, trigger });
  }

  getTriggersForTask(taskId) {
    const results = [];
    for (const [key, value] of this.triggers) {
      if (value.taskId === taskId) {
        results.push(value.trigger);
      }
    }
    return results;
  }
}

module.exports = TriggerRegistry;
