'use strict';

/**
 * 自主执行器：向量化标准强制执行
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 向量操作事件 → 检查引擎/维度/格式合规 → 扫描孤儿向量 → 清理/告警
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = '/root/.openclaw/workspace';
const VECTORS_DIR = path.join(WORKSPACE, 'infrastructure/vector-service/vectors');
const BACKUP_DIR = path.join(WORKSPACE, 'infrastructure/vector-service/backup/orphan-vectors');

const STANDARD = {
  engine: 'zhipu',
  model: 'embedding-3',
  dimension: 1024,
  prohibited_engines: ['tfidf', 'bge-m3', 'local'],
};

function checkVectorCompliance(vectorFile) {
  const violations = [];
  try {
    const data = JSON.parse(fs.readFileSync(vectorFile, 'utf8'));
    const meta = data.metadata || data.meta || {};
    const vectors = data.vectors || data.embeddings || [];

    // Check engine
    const engine = meta.engine || data.engine || '';
    if (STANDARD.prohibited_engines.includes(engine.toLowerCase())) {
      violations.push({ check: 'engine', expected: STANDARD.engine, actual: engine, message: `禁止使用${engine}引擎` });
    }

    // Check dimension
    if (vectors.length > 0) {
      const dim = Array.isArray(vectors[0]) ? vectors[0].length : (vectors[0]?.vector?.length || 0);
      if (dim > 0 && dim !== STANDARD.dimension) {
        violations.push({ check: 'dimension', expected: STANDARD.dimension, actual: dim, message: `维度${dim}不符合标准${STANDARD.dimension}` });
      }
    }

    // Check model
    const model = meta.model || data.model || '';
    if (model && model !== STANDARD.model && model !== '') {
      violations.push({ check: 'model', expected: STANDARD.model, actual: model, message: `模型应为${STANDARD.model}` });
    }

  } catch (e) {
    violations.push({ check: 'parse', message: `文件解析失败: ${e.message}` });
  }
  return violations;
}

function scanOrphanVectors() {
  const orphans = [];
  if (!fs.existsSync(VECTORS_DIR)) return orphans;

  const patterns = {
    skill: { vectorPattern: /^skill-(.+)\.json$/, sourceCheck: (name) => fs.existsSync(path.join(WORKSPACE, 'skills', name, 'SKILL.md')) },
    memory: { vectorPattern: /^memory-(.+)\.json$/, sourceCheck: (name) => fs.existsSync(path.join(WORKSPACE, 'memory', `${name}.md`)) },
    knowledge: { vectorPattern: /^knowledge-(.+)\.json$/, sourceCheck: (name) => fs.existsSync(path.join(WORKSPACE, 'knowledge', `${name}.json`)) },
    aeo: { vectorPattern: /^aeo-(.+)\.json$/, sourceCheck: (name) => fs.existsSync(path.join(WORKSPACE, 'aeo/evaluation-sets', `${name}.json`)) },
  };

  for (const file of fs.readdirSync(VECTORS_DIR)) {
    if (!file.endsWith('.json')) continue;
    for (const [type, config] of Object.entries(patterns)) {
      const match = file.match(config.vectorPattern);
      if (match) {
        const name = match[1];
        if (!config.sourceCheck(name)) {
          orphans.push({ file, type, name, path: path.join(VECTORS_DIR, file) });
        }
        break;
      }
    }
  }
  return orphans;
}

module.exports = async function(event, rule, context) {
  const payload = event.payload || event.data || {};
  const mode = payload.mode || 'compliance_scan';
  const results = { violations: [], orphans: [], cleaned: [] };

  // Mode 1: 合规性扫描
  if (mode === 'compliance_scan' || mode === 'full') {
    if (fs.existsSync(VECTORS_DIR)) {
      for (const file of fs.readdirSync(VECTORS_DIR)) {
        if (!file.endsWith('.json')) continue;
        const violations = checkVectorCompliance(path.join(VECTORS_DIR, file));
        if (violations.length > 0) {
          results.violations.push({ file, violations });
        }
      }
    }
  }

  // Mode 2: 孤儿向量扫描
  if (mode === 'orphan_cleanup' || mode === 'full') {
    const orphans = scanOrphanVectors();
    results.orphans = orphans;

    // 自主清理：备份后删除
    if (orphans.length > 0 && payload.dry_run !== true) {
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      for (const orphan of orphans) {
        try {
          const backupPath = path.join(BACKUP_DIR, `${orphan.file}.${Date.now()}.bak`);
          fs.copyFileSync(orphan.path, backupPath);
          fs.unlinkSync(orphan.path);
          results.cleaned.push({ file: orphan.file, backup: backupPath });
        } catch { /* best effort */ }
      }
    }
  }

  // 记录日志
  const logDir = path.resolve(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.appendFileSync(
      path.join(logDir, 'vectorization-enforcement.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        mode,
        violations: results.violations.length,
        orphans: results.orphans.length,
        cleaned: results.cleaned.length,
      }) + '\n'
    );
  } catch { /* best effort */ }

  // 告警
  if (results.violations.length > 0) {
    const msg = [
      `⚠️ **向量合规性问题**`,
      '',
      ...results.violations.map(v => `- \`${v.file}\`: ${v.violations.map(x => x.message).join(', ')}`),
    ].join('\n');
    if (context?.notify) context.notify('feishu', msg, { severity: 'high' });
  }

  const hasIssues = results.violations.length > 0;
  return {
    status: hasIssues ? 'warn' : 'pass',
    violations: results.violations.length,
    orphans_found: results.orphans.length,
    orphans_cleaned: results.cleaned.length,
    message: hasIssues ? '检测到向量合规性问题' : '向量化标准检查通过',
  };
};
