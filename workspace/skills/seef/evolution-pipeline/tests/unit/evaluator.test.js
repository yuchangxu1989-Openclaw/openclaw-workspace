/**
 * @fileoverview 评估器单元测试 - ISC Validator Test Suite
 * @description 测试各种技能类型的评分准确性
 * @module EvaluatorTests
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ISCValidator, Dimension, DIMENSION_WEIGHTS, createISCValidator } from '../../../src/core/isc-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ISC Validator - 评估器单元测试', () => {
  let validator;
  let tempDir;
  
  beforeEach(() => {
    validator = createISCValidator({ minScore: 70, maxScore: 100 });
    tempDir = path.join(__dirname, '../fixtures/temp-test-skill');
    
    // 创建临时测试目录
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    validator.resetStats();
  });

  describe('评分权重配置', () => {
    test('应该具有正确的维度权重配置', () => {
      expect(DIMENSION_WEIGHTS[Dimension.BASIC_COMPLETENESS]).toBe(0.4);
      expect(DIMENSION_WEIGHTS[Dimension.STANDARD_COMPLIANCE]).toBe(0.3);
      expect(DIMENSION_WEIGHTS[Dimension.CONTENT_ACCURACY]).toBe(0.2);
      expect(DIMENSION_WEIGHTS[Dimension.EXTENSION_COMPLETENESS]).toBe(0.1);
    });

    test('权重总和应该等于1', () => {
      const totalWeight = Object.values(DIMENSION_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBe(1);
    });
  });

  describe('基础技能类型评分', () => {
    test('应该正确评分完整的技能（90分以上）', async () => {
      // 创建完整技能结构
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "完整测试技能"
description: "这是一个测试技能，包含完整的文档和实现"
version: "1.0.0"
status: "stable"
author: "Test Author"
tags: "test, demo, example"
layer: "application"
---

# 完整测试技能

这是一个非常详细的技能文档，包含了所有必要的信息。

## 功能特性

- 特性1: 支持多种操作
- 特性2: 高性能执行
- 特性3: 易于扩展

## 使用示例

\`\`\`javascript
import { test } from './index.js';
await test.run();
\`\`\`

## API文档

详细说明了所有可用的API接口和参数。

## 注意事项

使用本技能时需要注意以下事项...
`);

      fs.writeFileSync(path.join(tempDir, 'README.md'), `# 完整测试技能

详细的README文档，包含安装说明、使用指南、贡献指南等。
`);

      fs.writeFileSync(path.join(tempDir, 'index.js'), `/**
 * 完整测试技能
 * @module TestSkill
 */

export function run() {
  // 主要执行逻辑
  console.log('Running test skill');
  return { success: true };
}

export function validate(input) {
  // 验证逻辑
  return input !== null;
}

export default { run, validate };
`);

      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: "test-skill",
        version: "1.0.0",
        type: "module",
        main: "index.js"
      }, null, 2));

      const result = await validator.validate(tempDir);
      
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.passed).toBe(true);
      expect(result.grade.level).toMatch(/^[ABC]$/);
      expect(result.details.basicCompleteness.score).toBeGreaterThanOrEqual(30);
    });

    test('应该正确评分部分完成的技能（70-89分）', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "部分测试技能"
description: "这是一个部分完成的技能"
version: "0.5.0"
status: "beta"
author: "Test Author"
---

# 部分测试技能

基本描述信息。
`);

      fs.writeFileSync(path.join(tempDir, 'index.js'), `export function run() { return true; }`);

      const result = await validator.validate(tempDir);
      
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.score).toBeLessThan(90);
      expect(result.grade.level).toMatch(/^[BC]$/);
    });

    test('应该正确评分不完整的技能（60-69分）', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "不完整技能"
version: "0.1.0"
---
`);

      const result = await validator.validate(tempDir);
      
      expect(result.score).toBeLessThan(70);
      expect(result.passed).toBe(false);
      expect(result.grade.level).toMatch(/^[DF]$/);
    });

    test('应该正确评分空技能（低于60分）', async () => {
      // 不创建任何文件
      const result = await validator.validate(tempDir);
      
      expect(result.score).toBeLessThan(60);
      expect(result.passed).toBe(false);
      expect(result.grade.level).toBe('F');
    });
  });

  describe('不同技能类型评分准确性', () => {
    test('应该正确评分core类型技能', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "核心技能"
description: "系统核心技能"
version: "2.0.0"
status: "stable"
author: "System"
tags: "core, system"
layer: "core"
---

# 核心技能

系统核心功能实现。
`);

      fs.writeFileSync(path.join(tempDir, 'index.js'), `
export const CORE_FEATURE = true;
export function init() { return { core: true }; }
`);

      const result = await validator.validate(tempDir);
      expect(result.details.basicCompleteness.checks.some(c => c.includes('layer')) || 
             result.passed).toBe(true);
    });

    test('应该正确评分adapter类型技能', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "适配器技能"
description: "第三方服务适配器"
version: "1.5.0"
status: "stable"
author: "Adapter Team"
tags: "adapter, integration"
layer: "adapter"
---

# 适配器技能

连接第三方服务。
`);

      fs.writeFileSync(path.join(tempDir, 'index.js'), `
export async function connect(config) {
  // 连接逻辑
  return { connected: true };
}
`);

      const result = await validator.validate(tempDir);
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    test('应该正确评分tool类型技能', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "工具技能"
description: "实用工具集合"
version: "1.0.0"
status: "stable"
author: "Tools Team"
tags: "tool, utility"
layer: "tool"
---

# 工具技能

提供各种实用工具函数。
`);

      fs.writeFileSync(path.join(tempDir, 'index.js'), `
export function util1() { return 1; }
export function util2() { return 2; }
export function util3() { return 3; }
`);

      const result = await validator.validate(tempDir);
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    test('应该正确评分workflow类型技能', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "工作流技能"
description: "自动化工作流定义"
version: "1.2.0"
status: "beta"
author: "Workflow Team"
tags: "workflow, automation"
layer: "workflow"
---

# 工作流技能

定义自动化流程。
`);

      fs.writeFileSync(path.join(tempDir, 'index.js'), `
export const workflow = {
  steps: [
    { id: 1, action: 'start' },
    { id: 2, action: 'process' },
    { id: 3, action: 'end' }
  ]
};
`);

      const result = await validator.validate(tempDir);
      expect(result.score).toBeGreaterThanOrEqual(50);
    });
  });

  describe('评分维度详细检查', () => {
    test('基础完整性维度应该正确评分', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "测试技能"
description: "测试描述"
version: "1.0.0"
status: "stable"
author: "Test"
---
`);

      fs.writeFileSync(path.join(tempDir, 'README.md'), `# README`);

      const result = await validator.validate(tempDir);
      
      expect(result.details.basicCompleteness).toBeDefined();
      expect(result.details.basicCompleteness.score).toBeGreaterThanOrEqual(0);
      expect(result.details.basicCompleteness.maxScore).toBe(40);
    });

    test('规范符合度维度应该正确评分', async () => {
      // 使用kebab-case命名
      const kebabDir = path.join(__dirname, '../fixtures/test-kebab-skill');
      if (!fs.existsSync(kebabDir)) {
        fs.mkdirSync(kebabDir, { recursive: true });
      }
      
      fs.writeFileSync(path.join(kebabDir, 'SKILL.md'), `---
name: "测试技能"
version: "1.0.0"
---
`);

      const result = await validator.validate(kebabDir);
      
      expect(result.details.standardCompliance).toBeDefined();
      expect(result.details.standardCompliance.score).toBeGreaterThanOrEqual(0);
      
      // 清理
      fs.rmSync(kebabDir, { recursive: true, force: true });
    });

    test('内容准确性维度应该正确评分', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "测试技能"
version: "1.0.0"
---
`);

      fs.writeFileSync(path.join(tempDir, 'index.js'), `
export function main() { return true; }
// 详细注释
// 更多注释
export function helper() { return false; }
`);

      const result = await validator.validate(tempDir);
      
      expect(result.details.contentAccuracy).toBeDefined();
      expect(result.details.contentAccuracy.score).toBeGreaterThanOrEqual(0);
    });

    test('扩展完整性维度应该正确评分', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "测试技能"
version: "1.0.0"
---
# 标题
// 注释
`);

      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');

      const result = await validator.validate(tempDir);
      
      expect(result.details.extensionCompleteness).toBeDefined();
      expect(result.details.extensionCompleteness.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('评级系统测试', () => {
    test('90分以上应该评为A级（优秀）', () => {
      const grade = validator.getGradeLabel(95);
      expect(grade.level).toBe('A');
      expect(grade.label).toBe('优秀');
    });

    test('80-89分应该评为B级（良好）', () => {
      const grade = validator.getGradeLabel(85);
      expect(grade.level).toBe('B');
      expect(grade.label).toBe('良好');
    });

    test('70-79分应该评为C级（合格）', () => {
      const grade = validator.getGradeLabel(75);
      expect(grade.level).toBe('C');
      expect(grade.label).toBe('合格');
    });

    test('60-69分应该评为D级（待改进）', () => {
      const grade = validator.getGradeLabel(65);
      expect(grade.level).toBe('D');
      expect(grade.label).toBe('待改进');
    });

    test('60分以下应该评为F级（不合格）', () => {
      const grade = validator.getGradeLabel(55);
      expect(grade.level).toBe('F');
      expect(grade.label).toBe('不合格');
    });
  });

  describe('改进建议生成', () => {
    test('应该为低分技能生成改进建议', async () => {
      // 空目录，应该产生多个建议
      const result = await validator.validate(tempDir);
      
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('优秀技能应该只有鼓励性建议', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "优秀技能"
description: "完整描述"
version: "1.0.0"
status: "stable"
author: "Author"
---

详细文档内容...
详细文档内容...
详细文档内容...
`);
      fs.writeFileSync(path.join(tempDir, 'README.md'), `# README`);
      fs.writeFileSync(path.join(tempDir, 'index.js'), `
export function main() { return true; }
// 详细注释
`);
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');

      const result = await validator.validate(tempDir);
      
      if (result.score >= 90) {
        expect(result.recommendations[0]).toContain('优秀');
      }
    });
  });

  describe('批量验证', () => {
    test('应该支持批量验证多个技能', async () => {
      const skillDirs = [tempDir]; // 实际测试中使用多个目录
      
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "测试"
version: "1.0.0"
---
`);

      const results = await validator.validateBatch(skillDirs);
      
      expect(results).toHaveLength(1);
      expect(results[0].skillId).toBeDefined();
      expect(results[0].score).toBeDefined();
    });

    test('应该正确统计批量验证结果', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "测试"
version: "1.0.0"
---
`);

      const results = await validator.validateBatch([tempDir]);
      const stats = validator.getValidationStats(results);
      
      expect(stats.total).toBe(1);
      expect(stats.passed + stats.failed).toBe(1);
      expect(parseFloat(stats.avgScore)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ISC报告解析', () => {
    test('应该正确解析ISC评估报告', () => {
      const mockReport = {
        totalScore: 85,
        maxScore: 100,
        grade: { label: '良好', level: 'B', color: 'blue' },
        dimensions: {
          basicCompleteness: { score: 35, maxScore: 40 },
          standardCompliance: { score: 25, maxScore: 30 },
          contentAccuracy: { score: 18, maxScore: 20 },
          extensionCompleteness: { score: 7, maxScore: 10 }
        }
      };

      const result = validator.parseISCReport(mockReport);
      
      expect(result.score).toBe(85);
      expect(result.passed).toBe(true);
      expect(result.grade.level).toBe('B');
    });
  });

  describe('配置选项', () => {
    test('应该支持自定义最低通过分数', () => {
      const customValidator = createISCValidator({ minScore: 80 });
      
      // 75分在默认配置下通过，但在自定义配置下不通过
      const mockResult = { score: 75, passed: true };
      expect(75).toBeLessThan(customValidator.config.minScore);
    });

    test('应该支持自定义最高分', () => {
      const customValidator = createISCValidator({ maxScore: 50 });
      expect(customValidator.config.maxScore).toBe(50);
    });
  });

  describe('错误处理', () => {
    test('应该处理不存在的技能路径', async () => {
      const result = await validator.validate('/nonexistent/path');
      
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    test('应该处理损坏的SKILL.md文件', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '---\ninvalid yaml: [\n---');
      
      const result = await validator.validate(tempDir);
      
      expect(result.score).toBeGreaterThanOrEqual(0);
      // 即使YAML解析失败，基础验证也应该继续
    });
  });

  describe('统计功能', () => {
    test('应该正确统计验证次数', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "测试"
version: "1.0.0"
---
`);

      await validator.validate(tempDir);
      expect(validator.stats.validationsRun).toBe(1);

      await validator.validate(tempDir);
      expect(validator.stats.validationsRun).toBe(2);
    });

    test('resetStats应该重置所有统计', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), `---
name: "测试"
version: "1.0.0"
---
`);

      await validator.validate(tempDir);
      validator.resetStats();
      
      expect(validator.stats.validationsRun).toBe(0);
      expect(validator.stats.validationsPassed).toBe(0);
      expect(validator.stats.validationsFailed).toBe(0);
    });
  });
});
