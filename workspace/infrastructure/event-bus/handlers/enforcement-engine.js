const fs = require('fs');
const path = require('path');

function hasApprovalMarker(content) {
  const markers = [
    /审核门\s*[:：]\s*(通过|已通过|pass)/i,
    /design[\s_-]*gate\s*[:：]\s*(approved|pass|passed)/i,
    /review(ed)?\s*[:：]\s*(yes|approved|pass)/i,
    /\[x\]\s*(审核通过|design gate approved)/i
  ];
  return markers.some((r) => r.test(content));
}

module.exports = async function(event, rule, context) {
  const root = (context && (context.workspaceRoot || context.cwd || context.rootDir)) || process.cwd();
  const designDir = path.join(root, 'designs');

  if (!fs.existsSync(designDir)) {
    return { ok: false, reason: 'designs目录不存在', violations: ['missing-designs-dir'] };
  }

  const docs = fs.readdirSync(designDir)
    .filter((n) => /\.(md|markdown|txt)$/i.test(n))
    .map((n) => path.join(designDir, n));

  const unapproved = [];
  for (const file of docs) {
    const content = fs.readFileSync(file, 'utf8');
    if (!hasApprovalMarker(content)) {
      unapproved.push(path.relative(root, file));
    }
  }

  return {
    ok: unapproved.length === 0,
    checked: docs.length,
    unapproved,
    ruleId: rule && rule.id,
    eventType: event && event.type,
    message: unapproved.length === 0 ? '所有设计文档已通过审核门' : `发现${unapproved.length}个未通过审核门的设计文档`
  };
};
