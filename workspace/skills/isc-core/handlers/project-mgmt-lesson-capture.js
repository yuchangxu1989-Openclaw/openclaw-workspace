#!/usr/bin/env node
/**
 * ISC Handler: Project Management — Lesson Capture Gate
 * Sprint结束或里程碑完成时，检查经验教训和指标数据是否已沉淀。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { checkFileExists, scanFiles, gateResult, writeReport } = require('../lib/handler-utils');

const WORKSPACE = process.env.WORKSPACE || path.resolve(__dirname, '../../..');

function checkLessonCapture() {
  const checks = [];
  const lessonsDir = path.join(WORKSPACE, 'skills', 'project-mgmt', 'lessons');
  const metricsDir = path.join(WORKSPACE, 'skills', 'project-mgmt', 'metrics');

  // 1. lessons 目录存在且有内容
  const lessonsExist = checkFileExists(lessonsDir);
  checks.push({
    name: 'lessons-dir-exists',
    ok: lessonsExist,
    message: lessonsExist ? 'Lessons directory exists' : 'Missing lessons directory',
  });

  if (lessonsExist) {
    const lessonFiles = scanFiles(lessonsDir, /\.md$/, null, { maxDepth: 1 });
    checks.push({
      name: 'lesson-files-present',
      ok: lessonFiles.length > 0,
      message: `Found ${lessonFiles.length} lesson files`,
    });
  }

  // 2. 反模式库存在
  const antiPatterns = path.join(lessonsDir, 'anti-patterns.md');
  checks.push({
    name: 'anti-patterns-file',
    ok: checkFileExists(antiPatterns),
    message: checkFileExists(antiPatterns) ? 'anti-patterns.md exists' : 'Missing anti-patterns.md',
  });

  // 3. metrics 目录存在
  const metricsExist = checkFileExists(metricsDir);
  checks.push({
    name: 'metrics-dir-exists',
    ok: metricsExist,
    message: metricsExist ? 'Metrics directory exists' : 'Missing metrics directory',
  });

  if (metricsExist) {
    const metricFiles = scanFiles(metricsDir, /\.json$/, null, { maxDepth: 1 });
    checks.push({
      name: 'metrics-files-present',
      ok: metricFiles.length > 0,
      message: `Found ${metricFiles.length} metrics files`,
    });
  }

  // 4. 最新 lesson 文件包含必要字段
  if (lessonsExist) {
    const lessonFiles = scanFiles(lessonsDir, /\.md$/, null, { maxDepth: 1 }).sort().reverse();
    if (lessonFiles.length > 0) {
      const content = fs.readFileSync(lessonFiles[0], 'utf8');
      const requiredFields = ['目标', '做对了', '做错了', '改进'];
      const hasFields = requiredFields.some(f => content.includes(f));
      checks.push({
        name: 'lesson-has-required-fields',
        ok: hasFields,
        message: hasFields ? 'Latest lesson has structured fields' : 'Latest lesson missing structured fields',
      });
    }
  }

  return checks;
}

function main() {
  const checks = checkLessonCapture();
  const result = gateResult('project-mgmt-lesson-capture', checks);

  const reportPath = path.join(WORKSPACE, 'reports', 'isc', `lesson-capture-${Date.now()}.json`);
  writeReport(reportPath, result);

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

main();
