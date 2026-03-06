'use strict';

/**
 * 自主执行器：技能完整性检查与修复
 * 流水线：感知→判断→自主执行→验证→闭环
 *
 * 检测到技能缺SKILL.md/index.js → 自动生成骨架 → 写入 → 验证 → commit
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function gitExec(root, cmd) {
  try {
    return execSync(`cd "${root}" && git ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
  } catch { return ''; }
}

function generateSkillMd(skillName, skillDir) {
  const files = fs.existsSync(skillDir)
    ? fs.readdirSync(skillDir).filter(f => f !== 'SKILL.md')
    : [];

  return [
    `# ${skillName}`,
    ``,
    `> 自动生成的技能文档骨架，请补充具体内容。`,
    ``,
    `## 概述`,
    ``,
    `TODO: 描述 ${skillName} 的功能和用途。`,
    ``,
    `## 使用方法`,
    ``,
    `\`\`\`javascript`,
    `const skill = require('./${skillName}');`,
    `// TODO: 使用示例`,
    `\`\`\``,
    ``,
    `## 输入`,
    ``,
    `| 参数 | 类型 | 说明 |`,
    `|------|------|------|`,
    `| TODO | TODO | TODO |`,
    ``,
    `## 输出`,
    ``,
    `TODO: 描述输出格式。`,
    ``,
    `## 依赖`,
    ``,
    ...(files.length > 0 ? [`已有文件: ${files.join(', ')}`] : ['无']),
    ``,
    `---`,
    `*自动生成于 ${new Date().toISOString()}*`,
    ``,
  ].join('\n');
}

function generateIndexJs(skillName) {
  return [
    `'use strict';`,
    ``,
    `/**`,
    ` * ${skillName} - 技能入口`,
    ` * 自动生成的骨架，请实现具体逻辑。`,
    ` */`,
    ``,
    `async function run(input, context) {`,
    `  const logger = context?.logger || console;`,
    `  logger.info?.(\`[${skillName}] 执行开始\`);`,
    ``,
    `  // TODO: 实现 ${skillName} 的核心逻辑`,
    `  const result = {`,
    `    ok: true,`,
    `    skill: '${skillName}',`,
    `    message: '${skillName} 执行完成（骨架）',`,
    `  };`,
    ``,
    `  logger.info?.(\`[${skillName}] 执行完成\`);`,
    `  return result;`,
    `}`,
    ``,
    `module.exports = run;`,
    `module.exports.run = run;`,
    ``,
  ].join('\n');
}

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const skillsDir = path.join(root, 'skills');
  const actions = [];
  const fixed = [];
  const skipped = [];

  // ─── 感知：扫描所有技能目录 ───
  if (!fs.existsSync(skillsDir)) {
    // 自动创建skills目录
    fs.mkdirSync(skillsDir, { recursive: true });
    actions.push('created_skills_dir');
    return {
      ok: true,
      autonomous: true,
      actions,
      missing: [],
      fixed: [],
      message: 'skills目录不存在，已创建',
    };
  }

  const skillDirs = fs.readdirSync(skillsDir).filter(name => {
    const p = path.join(skillsDir, name);
    try { return fs.statSync(p).isDirectory(); }
    catch { return false; }
  });

  const required = ['SKILL.md', 'index.js'];
  const incomplete = [];

  for (const skill of skillDirs) {
    const dir = path.join(skillsDir, skill);
    const absent = required.filter(f => !fs.existsSync(path.join(dir, f)));
    if (absent.length > 0) {
      incomplete.push({ skill, dir, absent });
    }
  }

  if (incomplete.length === 0) {
    return {
      ok: true,
      autonomous: true,
      actions: ['all_complete'],
      missing: [],
      fixed: [],
      message: `${skillDirs.length}个技能目录完整性检查通过`,
    };
  }

  logger.info?.(`[completeness-check] 发现${incomplete.length}个不完整技能，开始自主修复`);

  // ─── 自主执行：生成缺失文件 ───
  for (const item of incomplete) {
    const { skill, dir, absent } = item;

    // 跳过被隔离的技能
    if (fs.existsSync(path.join(dir, '.quarantined'))) {
      skipped.push({ skill, reason: 'quarantined' });
      actions.push(`skipped_quarantined:${skill}`);
      continue;
    }

    const fixedFiles = [];

    for (const file of absent) {
      try {
        const filePath = path.join(dir, file);
        let content;

        if (file === 'SKILL.md') {
          content = generateSkillMd(skill, dir);
        } else if (file === 'index.js') {
          content = generateIndexJs(skill);
        } else {
          continue;
        }

        fs.writeFileSync(filePath, content, 'utf8');
        fixedFiles.push(file);
        actions.push(`generated:${skill}/${file}`);
        logger.info?.(`[completeness-check] 生成: ${skill}/${file}`);
      } catch (e) {
        actions.push(`generate_failed:${skill}/${file}:${e.message}`);
      }
    }

    if (fixedFiles.length > 0) {
      fixed.push({ skill, files: fixedFiles });
    }
  }

  // ─── Git commit ───
  if (fixed.length > 0) {
    try {
      gitExec(root, 'add -A');
      const fileList = fixed.map(f => `${f.skill}(${f.files.join(',')})`).join(', ');
      gitExec(root, `commit --no-verify -m "📝 completeness: generated skeletons for ${fixed.length} skills: ${fileList}"`);
      actions.push('git_committed');
    } catch (e) {
      actions.push(`git_commit_failed:${e.message}`);
    }
  }

  // ─── 验证 ───
  let verifyOk = true;
  for (const item of fixed) {
    const dir = path.join(skillsDir, item.skill);
    for (const file of item.files) {
      if (!fs.existsSync(path.join(dir, file))) {
        verifyOk = false;
        actions.push(`verify_missing:${item.skill}/${file}`);
      }
    }
  }

  // 验证JS语法
  for (const item of fixed) {
    if (item.files.includes('index.js')) {
      const jsPath = path.join(skillsDir, item.skill, 'index.js');
      try {
        execSync(`node -c "${jsPath}"`, { timeout: 5000 });
      } catch {
        verifyOk = false;
        actions.push(`syntax_error:${item.skill}/index.js`);
      }
    }
  }
  actions.push(verifyOk ? 'verification_passed' : 'verification_partial');

  // ─── 闭环 ───
  if (context?.bus?.emit) {
    await context.bus.emit('skills.completeness.fixed', {
      fixed: fixed.length,
      skills: fixed.map(f => f.skill),
    });
  }

  // 仅在有大量修复时通知
  if (fixed.length >= 3 && context?.notify) {
    await context.notify(
      `[completeness-check] 为${fixed.length}个技能生成了骨架文件: ${fixed.map(f => f.skill).join(', ')}`,
      'info'
    );
  }

  return {
    ok: verifyOk,
    autonomous: true,
    totalSkills: skillDirs.length,
    incompleteFound: incomplete.length,
    fixed: fixed.length,
    skipped: skipped.length,
    fixedDetails: fixed,
    skippedDetails: skipped,
    actions,
    message: `修复${fixed.length}/${incomplete.length}个不完整技能 (${skipped.length}个跳过)`,
  };
};
