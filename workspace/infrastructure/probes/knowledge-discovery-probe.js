'use strict';

const fs = require('fs');
const path = require('path');
const { BaseScanner } = require('../scanners/base-scanner');

const DISCOVERY_KEYWORDS = ['学习', '发现', '原则', 'learning', 'discovery', 'principle'];

class KnowledgeDiscoveryProbe extends BaseScanner {
  constructor(options = {}) {
    super('knowledge-discovery-probe', options);
    this.workspaceRoot = options.workspaceRoot || process.cwd();
    this.rulesDir = options.rulesDir || path.join(this.workspaceRoot, 'skills/isc-core/rules');
    this.skillsDir = options.skillsDir || path.join(this.workspaceRoot, 'skills');
  }

  async scan() {
    this._recordScan();
    const discoveries = [];

    // Scan MEMORY.md
    const memoryFile = path.join(this.workspaceRoot, 'MEMORY.md');
    if (fs.existsSync(memoryFile)) {
      const content = fs.readFileSync(memoryFile, 'utf-8');
      discoveries.push(...this._extractDiscoveries(content, 'MEMORY.md'));
    }

    // Scan memory/*.md
    const memoryDir = path.join(this.workspaceRoot, 'memory');
    if (fs.existsSync(memoryDir)) {
      const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8');
        discoveries.push(...this._extractDiscoveries(content, `memory/${file}`));
      }
    }

    // Check coverage
    const existingKnowledge = this._loadExistingKnowledge();
    const actionable = [];

    for (const d of discoveries) {
      if (!this._isCovered(d, existingKnowledge)) {
        actionable.push(d);
        this.emit('knowledge.discovery.actionable', {
          source: d.source,
          line: d.line,
          keyword: d.keyword,
          text: d.text,
        });
      }
    }

    return { total: discoveries.length, actionable: actionable.length, items: actionable };
  }

  _extractDiscoveries(content, source) {
    const discoveries = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const kw of DISCOVERY_KEYWORDS) {
        if (line.includes(kw)) {
          discoveries.push({ source, line: i + 1, keyword: kw, text: line.trim() });
          break;
        }
      }
    }
    return discoveries;
  }

  _loadExistingKnowledge() {
    const knowledge = [];

    // Load ISC rules
    if (fs.existsSync(this.rulesDir)) {
      try {
        const files = fs.readdirSync(this.rulesDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const rule = JSON.parse(fs.readFileSync(path.join(this.rulesDir, file), 'utf-8'));
            knowledge.push(rule.name || rule.id || file);
            if (rule.description) knowledge.push(rule.description);
          } catch { /* skip invalid */ }
        }
      } catch { /* skip */ }
    }

    // Load skill names
    if (fs.existsSync(this.skillsDir)) {
      try {
        const dirs = fs.readdirSync(this.skillsDir);
        knowledge.push(...dirs);
      } catch { /* skip */ }
    }

    return knowledge;
  }

  _isCovered(discovery, existingKnowledge) {
    const text = discovery.text.toLowerCase();
    for (const k of existingKnowledge) {
      if (typeof k === 'string' && k.length > 3) {
        const kLower = k.toLowerCase();
        // Check if any significant word from knowledge matches
        const words = kLower.split(/[\s\-_/]+/).filter(w => w.length > 3);
        const matchCount = words.filter(w => text.includes(w)).length;
        if (matchCount >= 2) return true;
      }
    }
    return false;
  }
}

module.exports = { KnowledgeDiscoveryProbe };
