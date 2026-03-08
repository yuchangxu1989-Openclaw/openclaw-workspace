# SEEF Validator - 技能验证器

## 概述

SEEF Validator 是 SEEF 七大子技能之一，作为技能进入生产环境前的最后一道关卡，确保其功能、质量与规范三重达标，是准入与准出的最终裁决者。

## 核心功能

### 1. 功能验证 (Functionality Validation)
- 入口文件存在性与可解析性检查
- 导出函数完整性验证
- 错误处理机制检查

### 2. 质量验证 (Quality Validation)
- 文档充足性评估（SKILL.md 行数、章节完整性）
- 代码量合理性检查
- 文件大小限制验证
- package.json 规范性检查

### 3. 规范验证 (Compliance Validation)
- 文件命名规范检查
- 必需文件存在性验证
- ISC 标准术语使用检查
- 版本格式验证

### 4. 准入准出门禁 (Gate Control)
- **准入阶段 (Admission)**: 基础可用性测试
- **准出阶段 (Checkout)**: 集成兼容性测试 + 最终质量裁决

## 使用方法

### 命令行调用

```bash
node index.js '{"skillId":"my-skill","skillPath":"skills/my-skill","skillName":"My Skill","phase":"checkout","trigger":"manual"}'
```

### 参数说明

```javascript
{
  "skillId": "技能唯一标识符",
  "skillPath": "技能相对路径（相对于workspace）",
  "skillName": "技能显示名称",
  "phase": "验证阶段 (admission/checkout)",
  "trigger": "触发来源 (manual/lto/pipeline)"
}
```

### 编程调用

```javascript
const { validate } = require('./index.js');

const result = await validate({
  skillId: 'my-skill',
  skillPath: 'skills/my-skill',
  skillName: 'My Skill',
  phase: 'checkout',
  trigger: 'pipeline'
});

console.log(result.passed); // true/false
console.log(result.score);  // 0-100
```

## 验证规则

### 准入规则 (Admission Rules)

**强制项 (Mandatory)**:
- ✅ 存在 SKILL.md
- ✅ 存在入口文件 (index.js/index.cjs)
- ✅ 包含功能描述
- ✅ 包含使用说明章节

**可选项 (Optional)**:
- 存在 package.json
- 包含示例代码
- 包含错误处理
- 包含测试用例

**通过阈值**:
- 强制项通过率: 100%
- 可选项通过率: ≥75%

### 准出规则 (Checkout Rules)

**强制项 (Mandatory)**:
- ✅ 功能正常运行
- ✅ 无关键问题
- ✅ 符合 ISC 规范
- ✅ 文档完整

**可选项 (Optional)**:
- 性能可接受
- 安全检查通过
- 测试覆盖率充足

**通过阈值**:
- 强制项通过率: 100%
- 可选项通过率: ≥95%
- 最低综合得分: ≥80

## 输出格式

### 验证报告结构

```json
{
  "skillId": "my-skill",
  "skillName": "My Skill",
  "skillPath": "skills/my-skill",
  "timestamp": 1709280000000,
  "phase": "checkout",
  "trigger": "pipeline",
  "passed": true,
  "score": 85,
  "gates": {
    "functionality": {
      "passed": true,
      "score": 100,
      "checks": [...]
    },
    "quality": {
      "passed": true,
      "score": 80,
      "checks": [...]
    },
    "compliance": {
      "passed": true,
      "score": 90,
      "checks": [...]
    }
  },
  "violations": [],
  "recommendations": [],
  "nextSteps": ["recorder", "publish"],
  "metadata": {
    "validatorVersion": "1.0.0",
    "iscRulesVersion": "1.0.0",
    "validationTime": 1709280000000
  }
}
```

### 准出证明 (Checkout Receipt)

验证通过后自动生成准出证明：

```json
{
  "skillId": "my-skill",
  "skillName": "My Skill",
  "checkoutTime": 1709280000000,
  "validatorVersion": "1.0.0",
  "score": 85,
  "gateDecision": "APPROVED",
  "signature": "a1b2c3d4e5f6g7h8",
  "validUntil": 1711872000000
}
```

证明存储位置: `skills/seef/.signals/checkout-receipts/`

## 与其他子技能的协同

### 上游输入
- **Evaluator**: 提供初步评估结果
- **Optimizer**: 提供优化后的技能
- **Creator**: 提供新创建的技能

### 下游输出
- **通过**: 触发 Recorder 记录 + 发布流程
- **未通过**: 返回 Optimizer 重新优化

### 数据流

```
Evaluator/Optimizer/Creator
         ↓
    Validator (准入)
         ↓
   [功能/质量/规范验证]
         ↓
    Validator (准出)
         ↓
   ✅ 通过 → Recorder → Publish
   ❌ 未通过 → Optimizer → Validator
```

## ISC 规则集成

Validator 严格遵循 ISC (Inter-Skill Coordination) 标准：

- 加载 `isc-core/config/validation-rules.json`
- 支持自定义规则覆盖
- 自动适配 ISC 版本更新

## 报告存储

所有验证报告存储在：
```
reports/seef-validations/
  ├── {skillId}-admission-{timestamp}.json
  └── {skillId}-checkout-{timestamp}.json
```

## 错误处理

- 技能路径不存在 → 返回错误报告
- 关键文件缺失 → 标记为关键违规
- 解析失败 → 记录详细错误信息

## 版本历史

- **v1.0.0** (2026-03-01): P1 阶段初始实现
  - 功能验证
  - 质量验证
  - 规范验证
  - 准入准出门禁
  - 准出证明生成

## 许可证

MIT License
