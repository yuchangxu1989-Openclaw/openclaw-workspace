'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { KnowledgeDiscoveryProbe } = require('../../infrastructure/probes/knowledge-discovery-probe');

function makeBus() {
  const events = [];
  return { emit: (type, payload) => events.push({ type, payload }), events };
}

function setupTmpWorkspace(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-probe-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe('KnowledgeDiscoveryProbe', () => {
  test('extends BaseScanner', () => {
    const { BaseScanner } = require('../../infrastructure/scanners/base-scanner');
    const probe = new KnowledgeDiscoveryProbe();
    expect(probe).toBeInstanceOf(BaseScanner);
  });

  test('scan returns result object', async () => {
    const dir = setupTmpWorkspace({});
    const probe = new KnowledgeDiscoveryProbe({ workspaceRoot: dir });
    const result = await probe.scan();
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('actionable');
  });

  test('finds discoveries in MEMORY.md', async () => {
    const dir = setupTmpWorkspace({ 'MEMORY.md': '今天学习了新的设计模式\n发现了一个优化方法' });
    const bus = makeBus();
    const probe = new KnowledgeDiscoveryProbe({ bus, workspaceRoot: dir });
    const result = await probe.scan();
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  test('finds discoveries in memory/*.md', async () => {
    const dir = setupTmpWorkspace({ 'memory/2026-03-01.md': '原则：保持简单' });
    const bus = makeBus();
    const probe = new KnowledgeDiscoveryProbe({ bus, workspaceRoot: dir });
    const result = await probe.scan();
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  test('emits knowledge.discovery.actionable', async () => {
    const dir = setupTmpWorkspace({ 'MEMORY.md': '发现：新的测试方法很有效' });
    const bus = makeBus();
    const probe = new KnowledgeDiscoveryProbe({ bus, workspaceRoot: dir });
    await probe.scan();
    expect(bus.events.some(e => e.type === 'knowledge.discovery.actionable')).toBe(true);
  });

  test('no discoveries in empty workspace', async () => {
    const dir = setupTmpWorkspace({});
    const probe = new KnowledgeDiscoveryProbe({ workspaceRoot: dir });
    const result = await probe.scan();
    expect(result.total).toBe(0);
    expect(result.actionable).toBe(0);
  });

  test('updates lastScanTime after scan', async () => {
    const dir = setupTmpWorkspace({});
    const probe = new KnowledgeDiscoveryProbe({ workspaceRoot: dir });
    await probe.scan();
    expect(probe.getLastScanTime()).not.toBeNull();
  });

  test('handles missing memory directory', async () => {
    const dir = setupTmpWorkspace({ 'MEMORY.md': 'nothing special here' });
    const probe = new KnowledgeDiscoveryProbe({ workspaceRoot: dir });
    const result = await probe.scan();
    expect(result).toHaveProperty('total');
  });

  test('discovery item has source and keyword', async () => {
    const dir = setupTmpWorkspace({ 'MEMORY.md': '学习了event sourcing' });
    const bus = makeBus();
    const probe = new KnowledgeDiscoveryProbe({ bus, workspaceRoot: dir });
    await probe.scan();
    const ev = bus.events.find(e => e.type === 'knowledge.discovery.actionable');
    expect(ev.payload).toHaveProperty('source');
    expect(ev.payload).toHaveProperty('keyword');
  });

  test('increments scan stats', async () => {
    const dir = setupTmpWorkspace({});
    const probe = new KnowledgeDiscoveryProbe({ workspaceRoot: dir });
    await probe.scan();
    await probe.scan();
    expect(probe.getStats().scans).toBe(2);
  });

  test('handles file with no matching keywords', async () => {
    const dir = setupTmpWorkspace({ 'MEMORY.md': 'just a regular note about nothing' });
    const probe = new KnowledgeDiscoveryProbe({ workspaceRoot: dir });
    const result = await probe.scan();
    expect(result.total).toBe(0);
  });
});
