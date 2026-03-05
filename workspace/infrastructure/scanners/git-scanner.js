'use strict';

const { execSync } = require('child_process');
const { BaseScanner } = require('./base-scanner');

const PATH_EVENT_MAP = [
  { pattern: /^skills\/isc-core\/rules\/.*\.json$/, events: { A: 'isc.rule.created', M: 'isc.rule.modified', D: 'isc.rule.deleted' } },
  { pattern: /^skills\/[^/]+\/SKILL\.md$/, events: { A: 'skill.lifecycle.created', M: 'skill.lifecycle.modified' } },
  { pattern: /^infrastructure\//, events: { _default: 'system.infrastructure.modified' } },
  { pattern: /^tests\//, events: { _default: 'test.suite.modified' } },
];

class GitScanner extends BaseScanner {
  constructor(options = {}) {
    super('git-scanner', options);
    this.minutes = options.minutes || 5;
    this.cwd = options.cwd || process.cwd();
  }

  async scan() {
    try {
      const output = execSync(
        `git diff --name-status HEAD~1 2>/dev/null || git diff --name-status --cached 2>/dev/null || echo ""`,
        { cwd: this.cwd, encoding: 'utf-8', timeout: 10000 }
      ).trim();

      this._recordScan();

      if (!output) return [];

      const events = [];
      const lines = output.split('\n').filter(Boolean);

      for (const line of lines) {
        const [status, filePath] = line.split('\t');
        if (!filePath) continue;

        for (const rule of PATH_EVENT_MAP) {
          if (rule.pattern.test(filePath)) {
            const eventType = (rule.events[status] || rule.events._default);
            if (eventType) {
              this.emit(eventType, { file: filePath, status });
              events.push({ eventType, file: filePath, status });
            }
            break;
          }
        }
      }

      return events;
    } catch (err) {
      this.stats.errors++;
      throw err;
    }
  }
}

module.exports = { GitScanner };
