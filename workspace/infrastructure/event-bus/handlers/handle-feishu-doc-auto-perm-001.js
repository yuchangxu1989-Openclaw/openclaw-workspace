'use strict';

const path = require('path');
const { execSync } = require('child_process');
const {
  writeReport,
  emitEvent,
  checkFileExists,
  gateResult,
} = require('../../../skills/isc-core/lib/handler-utils');

module.exports = async function(event, rule, context) {
  const logger = context?.logger || console;
  const root = context?.workspace || context?.workspaceRoot || context?.cwd || process.cwd();
  const bus = context?.bus;
  const actions = [];

  // ─── 1. 感知：获取文档信息 ───
  const docToken = event?.payload?.doc_token || event?.payload?.docToken;
  const docType = event?.payload?.doc_type || event?.payload?.docType || 'docx';

  const checks = [];

  // 检查必要参数
  checks.push({
    name: 'doc_token_present',
    ok: !!docToken,
    message: docToken ? `文档token: ${docToken}` : '缺少doc_token参数',
  });

  if (!docToken) {
    const result = gateResult(rule?.id || 'feishu-doc-auto-perm-001', checks);
    return { ok: false, autonomous: true, actions: [], message: '缺少doc_token', ...result };
  }

  // ─── 2. 执行：调用授权脚本 ───
  const scriptPath = path.join(root, 'scripts', 'auto-grant-feishu-perm.sh');
  const scriptExists = checkFileExists(scriptPath);

  checks.push({
    name: 'script_exists',
    ok: scriptExists,
    message: scriptExists ? '授权脚本存在' : `授权脚本不存在: ${scriptPath}`,
  });

  let grantOk = false;
  let grantOutput = '';

  if (scriptExists) {
    try {
      grantOutput = execSync(`bash "${scriptPath}" "${docToken}" "${docType}"`, {
        encoding: 'utf8',
        timeout: 30000,
        cwd: root,
      }).trim();
      grantOk = true;
    } catch (err) {
      grantOutput = err.message || 'script execution failed';
    }
  }

  checks.push({
    name: 'perm_granted',
    ok: grantOk,
    message: grantOk
      ? `权限授予成功: ${grantOutput.slice(0, 100)}`
      : `权限授予失败: ${grantOutput.slice(0, 100)}`,
  });

  // ─── 3. 输出 ───
  const result = gateResult(rule?.id || 'feishu-doc-auto-perm-001', checks);

  // ─── 4. 持久化 ───
  const reportPath = path.join(root, 'reports', 'feishu-perm', `report-${Date.now()}.json`);
  writeReport(reportPath, {
    timestamp: new Date().toISOString(),
    handler: 'feishu-doc-auto-perm-001',
    docToken, docType,
    grantOk, grantOutput,
    ...result,
  });
  actions.push(`report_written:${reportPath}`);

  // ─── 5. 闭环 ───
  await emitEvent(bus, 'feishu-perm.granted', {
    ok: result.ok, docToken, docType, actions,
  });

  return {
    ok: result.ok,
    autonomous: true,
    actions,
    message: result.ok
      ? `飞书文档 ${docToken} 权限自动授予成功`
      : `飞书文档权限授予失败`,
    ...result,
  };
};
