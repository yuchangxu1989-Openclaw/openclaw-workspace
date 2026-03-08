const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..');
const captureScript = path.join(WORKSPACE, 'scripts', 'cras-e-capture.js');
const statusScript = path.join(WORKSPACE, 'scripts', 'cras-e-status.js');

describe('CRAS-E conversation-driven evolution hardening', () => {
  test('capture script materializes high-priority tasks into memory/tasks and tracker', () => {
    const input = 'CRAS不能只是定时任务，必须是个持续进化的技能。失忆后也要确保还能自主进化。每轮对话都要洞察意图。';
    const out = execFileSync('node', [captureScript, input], { encoding: 'utf8' });
    const data = JSON.parse(out);

    expect(data.ok).toBe(true);
    expect(data.tasks.length).toBeGreaterThanOrEqual(3);

    const tasksDir = path.join(WORKSPACE, 'memory', 'tasks');
    expect(fs.existsSync(tasksDir)).toBe(true);
    const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    const tracker = fs.readFileSync(path.join(WORKSPACE, 'PROJECT-TRACKER.md'), 'utf8');
    expect(tracker).toContain('CRAS-E持续进化中枢改造');
    expect(tracker).toContain('每轮对话意图洞察强制化');
  });

  test('status script emits a durable summary report', () => {
    const out = execFileSync('node', [statusScript], { encoding: 'utf8' });
    const data = JSON.parse(out);

    expect(data.ok).toBe(true);
    expect(fs.existsSync(data.jsonFile)).toBe(true);
    expect(fs.existsSync(data.mdFile)).toBe(true);
    expect(data.summary.open_task_count).toBeGreaterThan(0);
  });
});
