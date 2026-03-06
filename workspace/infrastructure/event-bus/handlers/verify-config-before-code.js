const fs = require('fs');
const path = require('path');
const { exists, readText } = require('./p0-utils');

/**
 * 编码前必须查配置，禁止hardcode API地址/模型名/Key
 * 感知：code.module.created / code.module.modified
 * 执行：扫描代码→检测hardcode→自动替换→无法修复则throw→闭环
 */
module.exports = async function(event, rule, context) {
  const workspace = (context && context.workspace) || '/root/.openclaw/workspace';
  const logger = context.logger;
  const bus = context.bus;

  logger.info('[verify-config-before-code] 启动代码配置检查');

  try {
    // 获取变更的代码文件
    const filePath = event.filePath || event.payload?.filePath || event.path;
    const filePaths = event.files || event.payload?.files || (filePath ? [filePath] : []);

    if (filePaths.length === 0) {
      logger.warn('[verify-config-before-code] 无文件待检查');
      return { status: 'skipped', reason: 'no_files' };
    }

    // Hardcode检测模式
    const hardcodePatterns = [
      {
        name: 'API_URL_LITERAL',
        // 匹配 http(s):// 字面URL赋值（排除注释和文档）
        regex: /(?:['"`])https?:\/\/(?:api\.|[\w-]+\.(?:openai|anthropic|azure|googleapis|amazonaws))[\w.\/:-]+(?:['"`])/g,
        category: 'api_url',
        envVar: 'API_BASE_URL',
        severity: 'high'
      },
      {
        name: 'MODEL_NAME_LITERAL',
        // 匹配模型名字面量
        regex: /(?:['"`])(?:gpt-[34][a-z0-9.-]*|claude-[a-z0-9.-]*|gemini-[a-z0-9.-]*|llama-[a-z0-9.-]*|text-davinci-[0-9]+|text-embedding-[a-z0-9-]+)(?:['"`])/gi,
        category: 'model_name',
        envVar: 'MODEL_NAME',
        severity: 'medium'
      },
      {
        name: 'API_KEY_LITERAL',
        // 匹配看起来像API key的字面量（sk-xxx, key-xxx, 长hex/base64）
        regex: /(?:['"`])(?:sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,}|[a-f0-9]{32,}|[A-Za-z0-9+\/]{40,}={0,2})(?:['"`])/g,
        category: 'api_key',
        envVar: 'API_KEY',
        severity: 'critical'
      },
      {
        name: 'HARDCODED_PORT',
        // 匹配硬编码的端口号赋值
        regex: /(?:port|PORT)\s*[:=]\s*(?:['"`]?\d{4,5}['"`]?)/g,
        category: 'port',
        envVar: 'PORT',
        severity: 'low'
      },
      {
        name: 'HARDCODED_HOST',
        // 匹配硬编码的内网IP
        regex: /(?:['"`])(?:192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?(?:['"`])/g,
        category: 'internal_host',
        envVar: 'SERVICE_HOST',
        severity: 'medium'
      }
    ];

    const allViolations = [];
    const allFixes = [];
    const unfixable = [];

    for (const fp of filePaths) {
      if (!exists(fp)) {
        logger.warn(`[verify-config-before-code] 文件不存在: ${fp}`);
        continue;
      }

      // 跳过非代码文件
      const ext = path.extname(fp).toLowerCase();
      const codeExts = ['.js', '.ts', '.jsx', '.tsx', '.py', '.mjs', '.cjs', '.java', '.go', '.rb'];
      if (!codeExts.includes(ext)) {
        logger.info(`[verify-config-before-code] 跳过非代码文件: ${fp}`);
        continue;
      }

      let content = readText(fp);
      let modified = false;
      const fileViolations = [];

      for (const pattern of hardcodePatterns) {
        const matches = content.match(pattern.regex);
        if (matches && matches.length > 0) {
          for (const match of matches) {
            // 检查是否在注释中
            const lineIndex = content.indexOf(match);
            const lineStart = content.lastIndexOf('\n', lineIndex) + 1;
            const lineContent = content.substring(lineStart, content.indexOf('\n', lineIndex));

            if (isInComment(lineContent, ext)) {
              continue; // 跳过注释中的匹配
            }

            const violation = {
              file: path.relative(workspace, fp),
              pattern: pattern.name,
              match: match.substring(0, 80),
              category: pattern.category,
              severity: pattern.severity,
              line: content.substring(0, lineIndex).split('\n').length
            };

            fileViolations.push(violation);

            // 尝试自动替换
            const replacement = generateConfigReference(pattern, ext);
            if (replacement && pattern.severity !== 'critical') {
              // 非关键类型尝试自动替换
              content = content.replace(match, replacement);
              modified = true;
              allFixes.push({
                file: violation.file,
                original: match.substring(0, 50),
                replacement,
                pattern: pattern.name
              });
            } else {
              // API key等关键类型不自动替换，标记为unfixable
              unfixable.push(violation);
            }
          }
        }
      }

      allViolations.push(...fileViolations);

      // 写回修复后的文件
      if (modified) {
        fs.writeFileSync(fp, content, 'utf-8');
        logger.info(`[verify-config-before-code] 已自动修复: ${fp}`);
      }
    }

    const result = {
      status: unfixable.length > 0 ? 'failed' : 'completed',
      filesChecked: filePaths.length,
      violations: allViolations.length,
      autoFixed: allFixes.length,
      unfixable: unfixable.length,
      details: {
        violations: allViolations,
        fixes: allFixes,
        unfixable
      }
    };

    bus.emit('code.config.check.completed', {
      filesChecked: filePaths.length,
      violations: allViolations.length,
      autoFixed: allFixes.length,
      unfixable: unfixable.length,
      passed: unfixable.length === 0
    });

    if (unfixable.length > 0) {
      const msg = `❌ 代码配置检查失败：发现 ${unfixable.length} 个无法自动修复的hardcode (${unfixable.map(u => u.pattern).join(', ')})`;
      logger.error('[verify-config-before-code]', msg);
      if (context.notify) context.notify(msg);
      throw new Error(msg);
    }

    logger.info('[verify-config-before-code] 检查完成', {
      violations: allViolations.length,
      autoFixed: allFixes.length
    });

    return result;
  } catch (err) {
    if (err.message.includes('代码配置检查失败')) throw err;
    logger.error('[verify-config-before-code] 执行失败:', err.message);
    bus.emit('code.config.check.failed', { error: err.message });
    throw err;
  }
};

/**
 * 检查匹配是否在注释中
 */
function isInComment(line, ext) {
  const trimmed = line.trim();
  if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.java', '.go'].includes(ext)) {
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }
  if (['.py', '.rb', '.sh'].includes(ext)) {
    return trimmed.startsWith('#');
  }
  return false;
}

/**
 * 根据模式和文件类型生成配置引用替换
 */
function generateConfigReference(pattern, ext) {
  const envVar = pattern.envVar;

  if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    return `process.env.${envVar}`;
  }
  if (ext === '.py') {
    return `os.environ.get('${envVar}')`;
  }
  if (ext === '.go') {
    return `os.Getenv("${envVar}")`;
  }
  if (ext === '.java') {
    return `System.getenv("${envVar}")`;
  }
  if (ext === '.rb') {
    return `ENV['${envVar}']`;
  }

  return `process.env.${envVar}`;
}
