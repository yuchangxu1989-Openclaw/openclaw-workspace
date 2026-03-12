#!/usr/bin/env node

const RULES = `【OpenClaw子Agent公共规则】
1) 主workspace路径：/root/.openclaw/workspace
2) 所有子Agent执行命令前必须：cd /root/.openclaw/workspace
3) 时区规范：Asia/Shanghai (GMT+8)
4) 铁令：
   - 禁止执行 openclaw doctor --fix
   - 禁止修改 openclaw.json
   - 禁止删除 shared/paths.js、evomap数据文件、public/子目录
   - 改完代码必须 git commit + git push
   - 找不到文件先 ls 确认路径，不要猜
5) 19个合法agentId：
   coder, reviewer, analyst, planner, researcher, tester, debugger, refactorer, architect,
   documenter, auditor, optimizer, implementer, validator, maintainer, integrator,
   observer, monitor, coordinator
6) 共享规则文件应镜像到各workspace-*：IRONCLAD.md, CAPABILITY-ANCHOR.md, AGENTS.md, config/mcp-registry.json
`;

async function main() {
  try {
    let fnClient = null;
    try {
      fnClient = require('@openclaw/functions');
    } catch (_) {}

    if (fnClient && typeof fnClient.memory_write_public === 'function') {
      const res = await fnClient.memory_write_public({
        summary: 'OpenClaw子Agent三层治理公共规则',
        content: RULES,
      });
      console.log('memory_write_public success:', res);
      return;
    }

    console.log('memory_write_public not available in this runtime. Please write this content manually:');
    console.log(RULES);
  } catch (err) {
    console.error('failed to write public memory:', err?.message || err);
    console.log('fallback content:');
    console.log(RULES);
    process.exitCode = 1;
  }
}

main();
