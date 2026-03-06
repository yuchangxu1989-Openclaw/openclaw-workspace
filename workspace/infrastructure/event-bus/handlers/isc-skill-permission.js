const fs = require('fs');
const path = require('path');
const { exists, readText, walk, hasAny } = require('./p0-utils');

/**
 * 技能权限分级（Filesystem/Network/Shell/Credential四维度）
 * 感知：isc.rule.matched / isc.category.matched
 * 执行：扫描技能代码→分析权限使用→生成分类报告→自动插入声明→闭环
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger;
  const bus = context.bus;

  logger.info('[isc-skill-permission] 启动技能权限分级分析');

  try {
    const skillPath = event.skillPath || event.payload?.skillPath || event.path || path.join(workspace, 'skills');

    if (!exists(skillPath)) {
      logger.warn('[isc-skill-permission] 技能路径不存在:', skillPath);
      return { status: 'skipped', reason: 'skill_path_not_found' };
    }

    // 权限检测模式定义
    const permissionPatterns = {
      filesystem: {
        level: 'filesystem',
        patterns: [
          'fs.readFile', 'fs.writeFile', 'fs.mkdir', 'fs.rmdir', 'fs.unlink',
          'fs.readdir', 'fs.stat', 'fs.access', 'fs.rename', 'fs.copyFile',
          'fs.createReadStream', 'fs.createWriteStream', 'fs.existsSync',
          'fs.readFileSync', 'fs.writeFileSync', 'fs.mkdirSync',
          "require('fs')", 'require("fs")', "from 'fs'",
          'open(', 'os.path', 'shutil', 'pathlib'
        ]
      },
      network: {
        level: 'network',
        patterns: [
          'http.get', 'http.request', 'https.get', 'https.request',
          'fetch(', 'axios', 'request(', 'got(', 'urllib',
          'net.connect', 'net.createServer', 'socket',
          "require('http')", "require('https')", "require('net')",
          'require("http")', 'require("https")', 'require("net")',
          'XMLHttpRequest', 'WebSocket', 'requests.get', 'requests.post',
          'urllib', 'curl', 'wget'
        ]
      },
      shell: {
        level: 'shell',
        patterns: [
          'child_process', 'exec(', 'execSync', 'spawn(', 'spawnSync',
          'execFile', 'fork(', 'shell=True', 'subprocess',
          'os.system', 'os.popen', 'Deno.run', 'Bun.spawn',
          "require('child_process')", 'require("child_process")'
        ]
      },
      credential: {
        level: 'credential',
        patterns: [
          'API_KEY', 'api_key', 'apiKey', 'SECRET', 'secret',
          'PASSWORD', 'password', 'TOKEN', 'token', 'CREDENTIAL',
          'credential', 'AUTH', 'auth_token', 'access_token',
          'private_key', 'PRIVATE_KEY', 'client_secret', 'CLIENT_SECRET',
          '.env', 'dotenv', 'keyring', 'keychain'
        ]
      }
    };

    // 扫描代码文件
    const codeFiles = walk(skillPath, ['.js', '.ts', '.py', '.sh', '.mjs', '.cjs']);
    const results = [];
    const permissionSummary = { filesystem: false, network: false, shell: false, credential: false };

    for (const file of codeFiles) {
      const content = readText(file);
      const filePerms = { file: path.relative(workspace, file), permissions: [] };

      for (const [category, config] of Object.entries(permissionPatterns)) {
        if (hasAny(content, config.patterns)) {
          filePerms.permissions.push(category);
          permissionSummary[category] = true;
          
          // 找到具体匹配的模式
          const matched = config.patterns.filter(p => content.includes(p));
          filePerms[`${category}_evidence`] = matched.slice(0, 5); // 最多5个证据
        }
      }

      if (filePerms.permissions.length > 0) {
        results.push(filePerms);
      }
    }

    // 计算权限等级
    const activePerms = Object.entries(permissionSummary).filter(([, v]) => v).map(([k]) => k);
    let riskLevel = 'low';
    if (permissionSummary.credential) riskLevel = 'critical';
    else if (permissionSummary.shell) riskLevel = 'high';
    else if (permissionSummary.network) riskLevel = 'medium';
    else if (permissionSummary.filesystem) riskLevel = 'low';

    logger.info(`[isc-skill-permission] 权限分析完成: ${activePerms.join(', ')} | 风险等级: ${riskLevel}`);

    // 检查并更新SKILL.md
    const skillMdCandidates = [
      path.join(skillPath, 'SKILL.md'),
      ...walk(skillPath, ['.md']).filter(f => path.basename(f) === 'SKILL.md')
    ];

    let skillMdUpdated = false;
    for (const skillMd of skillMdCandidates) {
      if (exists(skillMd)) {
        const mdContent = readText(skillMd);
        if (!mdContent.includes('## Permissions') && !mdContent.includes('## 权限声明')) {
          // 自动插入权限声明
          const permSection = generatePermissionSection(permissionSummary, riskLevel);
          const updatedContent = mdContent + '\n\n' + permSection;
          fs.writeFileSync(skillMd, updatedContent, 'utf-8');
          logger.info(`[isc-skill-permission] 已向 ${skillMd} 插入权限声明`);
          skillMdUpdated = true;
        }
        break;
      }
    }

    // 生成报告
    const report = {
      timestamp: new Date().toISOString(),
      skillPath: path.relative(workspace, skillPath),
      riskLevel,
      permissions: permissionSummary,
      activePermissions: activePerms,
      filesAnalyzed: codeFiles.length,
      filesWithPermissions: results.length,
      details: results,
      skillMdUpdated
    };

    const reportsDir = path.join(workspace, 'infrastructure', 'event-bus', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const reportPath = path.join(reportsDir, `skill-permission-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    bus.emit('skill.permission.classified', {
      skillPath,
      riskLevel,
      permissions: activePerms,
      reportPath
    });

    return {
      status: 'completed',
      riskLevel,
      permissions: permissionSummary,
      activePermissions: activePerms,
      filesAnalyzed: codeFiles.length,
      reportPath,
      skillMdUpdated
    };
  } catch (err) {
    logger.error('[isc-skill-permission] 执行失败:', err.message);
    bus.emit('skill.permission.classification.failed', { error: err.message });
    throw err;
  }
};

function generatePermissionSection(perms, riskLevel) {
  const riskEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };
  let section = `## 权限声明\n\n`;
  section += `> 风险等级: ${riskEmoji[riskLevel] || '⚪'} ${riskLevel.toUpperCase()}\n\n`;
  section += `| 维度 | 需要 | 说明 |\n`;
  section += `|------|------|------|\n`;
  section += `| Filesystem | ${perms.filesystem ? '✅' : '❌'} | 文件系统读写 |\n`;
  section += `| Network | ${perms.network ? '✅' : '❌'} | 网络请求 |\n`;
  section += `| Shell | ${perms.shell ? '✅' : '❌'} | 命令执行 |\n`;
  section += `| Credential | ${perms.credential ? '✅' : '❌'} | 密钥/凭证访问 |\n`;
  return section;
}
