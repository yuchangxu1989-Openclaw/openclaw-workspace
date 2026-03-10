# 审计报告：V4评测用例执行链粒度核查

- 日期：2026-03-10
- 审计对象：全部评测用例的 execution_chain_steps 字段
- 审计者：reviewer（质量仲裁官）
- 审计依据：V4评测标准宪法文档 `JxhNdoc7ko7ZLwxJUJHcWyeDnYd`

---

## 一、V4标准对执行链粒度的要求

V4评测标准（宪法级）对执行链相关指标有明确要求：

| 指标 | 阈值 | 精度要求 |
|------|------|----------|
| 执行链规划正确率 | ≥ 95% | 步骤必须与实际执行路径一致 |
| 执行链展开完整率 | ≥ 95% | 每个环节都有执行+验真 |
| 认知层真实代码覆盖率 | 100% | 精确到**文件路径+函数名+行号** |
| 根因分析覆盖率 | 100% | 精确到**具体文件+行号+原因描述** |

标准原文明确要求：
> "输出精确到文件路径+函数名+行号的分析"
> "根因分析必须精确到具体文件+行号+原因描述"
> "只看文档摘要做判断的，不计为有效认知映射"

**结论：V4标准要求执行链步骤必须精确到工具调用+文件路径+行号级别，不接受模糊描述。**

---

## 二、评测用例覆盖现状

### 2.1 各文件执行链覆盖统计

| 文件 | 用例数 | 有执行链 | 总步骤数 | 平均步长(字符) | 精确引用步骤数 |
|------|--------|----------|----------|----------------|----------------|
| intent-probe-regression-100.json | 128 | **0** ❌ | 0 | - | - |
| intent-benchmark-dataset.json | 80 | **0** ❌ | 0 | - | - |
| auto-generated-from-corrections.json | 52 | **0** ❌ | 0 | - | - |
| real-conversation-samples.json | 54 | **0** ❌ | 0 | - | - |
| multi-turn-eval-dataset.json | 42 | **0** ❌ | 0 | - | - |
| scenarios/*.json | ~80+ | **0** ❌ | 0 | - | - |
| v4-yanchu-fasu-cases-batch1.json | 10 | 10 ✅ | 67 | 25 | 9 |
| v4-autonomous-loop-cases-batch1.json | 10 | 10 ✅ | 60 | 23 | 1 |
| v4-code-coverage-cases-batch1.json | 10 | 10 ✅ | 58 | 48 | 26 |
| v4-code-coverage-cases-batch2.json | 10 | 10 ✅ | 68 | 27 | 26 |
| v4-gate-cases-batch1.json | 10 | 10 ✅ | 73 | 27 | 7 |
| v4-independent-qa-cases-batch1.json | 10 | 10 ✅ | 67 | 27 | 9 |
| v4-pregate-cases-batch1.json | 10 | 10 ✅ | 68 | 24 | 7 |
| v4-rca-coverage-cases-batch1.json | 10 | 10 ✅ | 79 | 32 | 14 |

### 2.2 关键发现

- **原始黄金集（intent/目录 356条 + scenarios/ 80+条）：全部没有 execution_chain_steps 字段**
- **V4新增用例（8个文件 80条）：全部有 execution_chain_steps**
- 所谓"423条黄金集"中，只有V4新增的80条有执行链，覆盖率仅 **80/436+ ≈ 18.3%**

---

## 三、执行链粒度深度分析

### 3.1 V4用例540个步骤的粒度分类

| 粒度等级 | 步骤数 | 占比 | 说明 |
|----------|--------|------|------|
| 精确工具调用（grep/find + 文件路径） | 5 | **0.9%** | 如 `grep -rn 'classifyIntent' skills/ --include='*.js'` |
| 精确文件引用（file:line） | 12 | **2.2%** | 如 `src/server.js:15 监听8080` |
| 中等动作描述 | 226 | **41.9%** | 如 `验证command_binding指向的skill路径存在且handler可达` |
| 模糊动作描述 | 297 | **55.0%** | 如 `主Agent捕获失败事件，分析错误类型` |

**精确步骤（工具调用+文件引用）合计仅 17/540 = 3.1%**

### 3.2 各文件粒度质量排名

| 排名 | 文件 | 质量评级 | 说明 |
|------|------|----------|------|
| 1 | v4-code-coverage-cases-batch1.json | ⭐⭐⭐⭐ | 最佳。步骤包含完整grep/find命令和文件路径 |
| 2 | v4-code-coverage-cases-batch2.json | ⭐⭐⭐⭐ | 同上，精确引用率高 |
| 3 | v4-rca-coverage-cases-batch1.json | ⭐⭐⭐ | 较好。有file:line引用，四层分析结构清晰 |
| 4 | v4-yanchu-fasu-cases-batch1.json | ⭐⭐ | 中等。正面case有具体动作，负面case标注了缺失步骤 |
| 5 | v4-gate-cases-batch1.json | ⭐⭐ | 中等。校验步骤有逻辑但缺少具体命令 |
| 6 | v4-pregate-cases-batch1.json | ⭐⭐ | 中等。类似gate |
| 7 | v4-independent-qa-cases-batch1.json | ⭐⭐ | 中等。流程描述为主 |
| 8 | v4-autonomous-loop-cases-batch1.json | ⭐ | 最差。几乎全是叙事性描述，仅1个精确引用 |

### 3.3 典型对比：好 vs 差

**好的执行链步骤（v4-code-coverage CC-POS-001）：**
```
- Agent执行 grep -rn 'classifyIntent\|intentMatch\|classify' skills/ scripts/ infrastructure/ --include='*.js' --include='*.py'
- Agent执行 find infrastructure/intent-engine/ -name '*.js' -exec grep -n 'function\|module.exports\|class ' {} +
- Agent逐文件阅读关键函数实现，记录文件路径+函数名+行号
```
→ 精确到工具、参数、搜索范围、输出格式

**差的执行链步骤（v4-autonomous-loop autonomous-loop-pos-01）：**
```
- 主Agent捕获失败事件，分析错误类型为可重试错误（网络超时）
- 主Agent自动重新派出子Agent重试部署
- 子Agent重试成功，镜像拉取完成，服务启动
```
→ 纯叙事，无工具调用、无文件引用、无具体命令

---

## 四、核查结论

### ❌ 执行链粒度优化**未完成**

1. **覆盖缺口严重**：原始黄金集（intent/ 356条 + scenarios/ 80+条）完全没有 execution_chain_steps，这些用例无法评测执行链相关指标
2. **V4新增用例粒度不达标**：540个步骤中仅3.1%达到V4标准要求的"文件路径+函数名+行号"精度
3. **55%步骤为模糊描述**：与V4标准"精确到文件路径+函数名+行号"的要求严重不符
4. **文件间质量差异大**：code-coverage类最好（⭐⭐⭐⭐），autonomous-loop类最差（⭐）

### 根因分析

| 层级 | 分析 |
|------|------|
| 代码缺陷 | 执行链步骤以自然语言字符串存储，无结构化schema约束粒度 |
| 规则缺失 | 缺少执行链步骤的粒度校验规则（如：每步必须包含tool/file/action三元组） |
| 认知偏差 | 编写者对"精确"的理解不一致——code-coverage编写者理解正确，autonomous-loop编写者理解为叙事 |
| 架构瓶颈 | 无。纯粹是数据质量问题 |

---

## 五、改进建议

### P0（Blocker）：必须立即修复

1. **为原始黄金集补充 execution_chain_steps**
   - intent/ 目录 356条用例需要补充执行链
   - scenarios/ 目录 80+条用例需要补充执行链
   - 否则这些用例无法参与执行链相关指标评测

2. **定义执行链步骤的结构化schema**
   ```json
   {
     "step_id": 1,
     "tool": "grep",
     "command": "grep -rn 'classifyIntent' skills/ --include='*.js'",
     "target_files": ["skills/**/*.js"],
     "expected_output": "匹配结果列表",
     "depends_on": [],
     "error_handling": "无匹配时扩大搜索范围到infrastructure/"
   }
   ```
   用结构化schema替代自由文本，从根本上约束粒度。

### P1（Major）：本轮必须修复

3. **统一粒度标准到code-coverage级别**
   - 以 v4-code-coverage-cases-batch1.json 为标杆
   - 每个步骤必须包含：具体工具/命令 + 操作对象（文件路径） + 预期结果
   - 重写 autonomous-loop、independent-qa、gate、pregate 的执行链步骤

4. **补充步骤间的输入输出依赖**
   - 当前步骤之间是平铺列表，无依赖关系标注
   - 应标注：step 2 依赖 step 1 的输出（如grep结果作为下一步read的输入）

### P2（Minor）：后续迭代

5. **补充异常路径的执行链**
   - 当前负面case（neg-*）标注了"缺失步骤"，但未给出正确的异常处理链
   - 应补充：异常检测→降级→告警→恢复的完整链路

6. **编写执行链粒度校验脚本**
   - 自动检测步骤是否包含工具调用或文件引用
   - 集成到CI，低于阈值自动拦截

---

## 六、审计判定

### ❌ 打回，需修复后重新审计

执行链粒度优化工作**声称要做但实际未完成**。V4新增的80条用例虽然有执行链字段，但粒度远未达到V4标准要求的精度。原始黄金集完全缺失执行链字段，是更大的缺口。

需要完成P0和P1改进项后重新提交审计。
