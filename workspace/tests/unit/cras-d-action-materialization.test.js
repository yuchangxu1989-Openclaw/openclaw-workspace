const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '../..');
const script = path.join(WORKSPACE, 'scripts', 'cras-d-materialize-action-cards.js');
const backlogJson = path.join(WORKSPACE, 'reports', 'cras-d-action-cards.json');
const backlogMd = path.join(WORKSPACE, 'reports', 'cras-d-action-cards.md');

describe('CRAS-D action card materialization', () => {
  test('materializes high-confidence strategy actions into task governance artifacts', () => {
    const out = execFileSync('node', [script], { encoding: 'utf8', cwd: WORKSPACE });
    const data = JSON.parse(out);

    expect(data.ok).toBe(true);
    expect(data.count).toBe(4);
    expect(fs.existsSync(backlogJson)).toBe(true);
    expect(fs.existsSync(backlogMd)).toBe(true);

    const backlog = JSON.parse(fs.readFileSync(backlogJson, 'utf8'));
    expect(Array.isArray(backlog.cards)).toBe(true);
    expect(backlog.cards.length).toBe(4);

    for (const card of backlog.cards) {
      const memoryPath = path.join(WORKSPACE, card.memory_task);
      const dtoPath = path.join(WORKSPACE, card.dto_task);
      const closeLoopPath = path.join(WORKSPACE, card.close_loop);
      expect(fs.existsSync(memoryPath)).toBe(true);
      expect(fs.existsSync(dtoPath)).toBe(true);
      expect(fs.existsSync(closeLoopPath)).toBe(true);

      const memoryTask = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
      expect(Array.isArray(memoryTask.acceptance)).toBe(true);
      expect(memoryTask.acceptance.length).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(memoryTask.validation_commands)).toBe(true);
      expect(memoryTask.validation_commands.length).toBeGreaterThan(0);
    }

    const tracker = fs.readFileSync(path.join(WORKSPACE, 'PROJECT-TRACKER.md'), 'utf8');
    expect(tracker).toContain('### CRAS-D 研究策略执行卡（自动生成）');
    expect(tracker).toContain('CRAS-D研究策略落地 / 将研究结论绑定本地执行压力与积压');
  });
});
