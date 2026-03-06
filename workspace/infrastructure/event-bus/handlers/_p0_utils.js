const fs = require('fs');
const path = require('path');

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function walk(dir, exts = null, acc = []) {
  if (!exists(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, acc);
    else if (!exts || exts.includes(path.extname(e.name))) acc.push(p);
  }
  return acc;
}
function hasAny(text, patterns) {
  return patterns.some((pat) => {
    try { return new RegExp(pat, 'i').test(text); } catch { return text.includes(pat); }
  });
}

module.exports = { exists, readText, readJson, walk, hasAny };
