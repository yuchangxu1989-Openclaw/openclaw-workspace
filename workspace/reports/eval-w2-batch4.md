# C2评测第二波 - Batch 4 (mined-r2-22~28)

**执行时间**: 2026-03-09 09:27 CST
**Runner**: `skills/aeo/bin/run-eval.js --limit 10`

## 汇总

| 数据集 | 准确率 | 正确 | 总数 | 主要预测 |
|--------|--------|------|------|----------|
| mined-r2-22 | 0.0% | 0 | 10 | 全部UNKNOWN |
| mined-r2-23 | 0.0% | 0 | 10 | 全部UNKNOWN |
| mined-r2-24 | 0.0% | 0 | 10 | 几乎全UNKNOWN (1个IC5) |
| mined-r2-25 | 0.0% | 0 | 10 | 全部IC3 |
| mined-r2-26 | 0.0% | 0 | 10 | 全部UNKNOWN |
| mined-r2-27 | 0.0% | 0 | 10 | 多数UNKNOWN (IC3×1, IC5×1) |
| mined-r2-28 | 0.0% | 0 | 10 | 混合UNKNOWN/IC2 |
| **总计** | **0.0%** | **0** | **70** | |

## 关键发现

1. **全军覆没**: 7个数据集×10条 = 70条用例，准确率0%
2. **主要失败模式**:
   - **UNKNOWN主导** (r2-22/23/24/26): 分类器无法识别C2细分类别
   - **IC3坍缩** (r2-25): 所有用例都被预测为IC3(纠偏类)，疑似输入文本高度相似导致
   - **IC2误判** (r2-28): 部分被归为IC2而非细分类别
3. **r2-25数据质量问题**: 所有10条的input文本几乎相同（"基于今天真实执行记录..."），导致全部坍缩到IC3
4. **r2-26数据质量问题**: 所有10条input仅靠序号区分（"第N次追问"），缺乏区分度

## 根因分析

- 分类器对C2细分类别（纠偏类/自主性缺失类/全局未对齐类等）**缺乏训练或prompt覆盖**
- 预测结果为UNKNOWN说明这些类别不在当前分类器的标签空间内
- r2-25/r2-26的数据集本身质量存疑，input区分度不足

## 详细输出

### mined-r2-22.json (0/10)
- ❌ C2-MINED-R2-22-001 | 期望: 全局未对齐类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-002 | 期望: 自主性缺失类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-003 | 期望: 交付质量类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-004 | 期望: 全局未对齐类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-005 | 期望: 认知错误类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-006 | 期望: 连锁跷跷板类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-007 | 期望: 反复未果类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-008 | 期望: 头痛医头类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-009 | 期望: 纠偏类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-22-010 | 期望: 自主性缺失类 | 预测: UNKNOWN

### mined-r2-23.json (0/10)
- ❌ C2-MINED-R2-23-001 | 期望: 自主性缺失类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-002 | 期望: 交付质量类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-003 | 期望: 自主性缺失类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-004 | 期望: 自主性缺失类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-005 | 期望: 反复未果类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-006 | 期望: 认知错误类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-007 | 期望: 头痛医头类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-008 | 期望: 连锁跷跷板类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-009 | 期望: 交付质量类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-23-010 | 期望: 纠偏类 | 预测: UNKNOWN

### mined-r2-24.json (0/10)
- ❌ C2-MINED-R2-24-001 | 期望: 自主性缺失类 | 预测: IC5
- ❌ C2-MINED-R2-24-002 | 期望: 交付质量类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-003 | 期望: 交付质量类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-004 | 期望: 全局未对齐类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-005 | 期望: 全局未对齐类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-006 | 期望: 头痛医头类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-007 | 期望: 连锁跷跷板类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-008 | 期望: 纠偏类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-009 | 期望: 自主性缺失类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-24-010 | 期望: 反复未果类 | 预测: UNKNOWN

### mined-r2-25.json (0/10)
- ❌ mined-r2-25-001~010 | 全部预测IC3 | 期望分布于8个不同类别
- ⚠️ 数据质量问题：所有input文本几乎相同

### mined-r2-26.json (0/10)
- ❌ mined-r2-26-001~010 | 全部预测UNKNOWN | 期望分布于8个不同类别
- ⚠️ 数据质量问题：所有input仅靠序号区分

### mined-r2-27.json (0/10)
- ❌ mined-r2-27-001 | 期望: 纠偏类 | 预测: IC3
- ❌ mined-r2-27-002 | 期望: 自主性缺失类 | 预测: UNKNOWN
- ❌ mined-r2-27-003 | 期望: 全局未对齐类 | 预测: UNKNOWN
- ❌ mined-r2-27-004 | 期望: 认知错误类 | 预测: UNKNOWN
- ❌ mined-r2-27-005 | 期望: 连锁跷跷板类 | 预测: IC5
- ❌ mined-r2-27-006 | 期望: 交付质量类 | 预测: UNKNOWN
- ❌ mined-r2-27-007 | 期望: 反复未果类 | 预测: UNKNOWN
- ❌ mined-r2-27-008 | 期望: 头痛医头类 | 预测: UNKNOWN
- ❌ mined-r2-27-009 | 期望: 交付质量类 | 预测: UNKNOWN
- ❌ mined-r2-27-010 | 期望: 全局未对齐类 | 预测: UNKNOWN

### mined-r2-28.json (0/10)
- ❌ C2-MINED-R2-28-001 | 期望: 全局未对齐类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-28-002 | 期望: 纠偏类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-28-003 | 期望: 交付质量类 | 预测: IC2
- ❌ C2-MINED-R2-28-004 | 期望: 认知错误类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-28-005 | 期望: 全局未对齐类 | 预测: IC2
- ❌ C2-MINED-R2-28-006 | 期望: 自主性缺失类 | 预测: IC2
- ❌ C2-MINED-R2-28-007 | 期望: 自主性缺失类 | 预测: IC2
- ❌ C2-MINED-R2-28-008 | 期望: 头痛医头类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-28-009 | 期望: 反复未果类 | 预测: UNKNOWN
- ❌ C2-MINED-R2-28-010 | 期望: 连锁跷跷板类 | 预测: IC2
