# 评测集质量审计 - 批次4

## 审计依据
- 已阅读《AEO评测标准与基线V3》
- 已读取 C2 标杆文件 `00-real-badcases.json` 前3条用于口径对齐

## 总结论
- 本批次共审计 **318** 条（247+54+17）。
- 结构字段与V3对齐度整体一般：存在字段缺失/命名不一致、难度标注漂移、输入模板化、expected_output可验证性不足。
- 三个文件都存在“像规则描述而非真实用户话术”的样本，影响“真实对话占比”与C2有效性。

## 文件：`goodcases-from-badcases.json`（247条）
- 难度分布：{'C1': 11, 'C3': 39, 'C2': 190, 'C4': 7}
- 格式完整性问题：247 处字段缺失/空值
- 难度标注疑点：7 条
- input模板化/不真人：12 条（按启发式）
- expected_output偏泛化：1 条（按启发式）
- 典型缺失（前10）：
  - #1 id=goodcase-BADCASE-DELEGATION-001 缺 `category`
  - #2 id=goodcase-BADCASE-DELEGATION-002 缺 `category`
  - #3 id=goodcase-BADCASE-DELEGATION-003 缺 `category`
  - #4 id=goodcase-BADCASE-DELEGATION-004 缺 `category`
  - #5 id=goodcase-BADCASE-DELEGATION-005 缺 `category`
  - #6 id=goodcase-BADCASE-TASKBOARD-UPDATE-001 缺 `category`
  - #7 id=goodcase-badcase-spawn-no-board-push-repeated 缺 `category`
  - #8 id=goodcase-badcase-subagent-empty-run-writer 缺 `category`
  - #9 id=goodcase-badcase-subagent-sandbox-isolation 缺 `category`
  - #10 id=goodcase-badcase-feishu-doc-create-empty 缺 `category`
- 难度疑似错配（前15）：
  - #3 id=goodcase-BADCASE-DELEGATION-003：标C3但输入过短单意图
  - #75 id=goodcase-CI-020：标C3但输入过短单意图
  - #82 id=goodcase-CI-027：标C3但输入过短单意图
  - #115 id=goodcase-GR-030：标C3但输入过短单意图
  - #188 id=goodcase-SESSION-0308-008：标C3但输入过短单意图
  - #193 id=goodcase-SESSION-0308-013：标C3但输入过短单意图
  - #208 id=goodcase-SESSION-0308-028：标C3但输入过短单意图
- 模板化input样例（前10）：
  - #1 id=goodcase-BADCASE-DELEGATION-001：用户要求修复intent-engine的bug
  - #2 id=goodcase-BADCASE-DELEGATION-002：用户要求写飞书文档报告
  - #3 id=goodcase-BADCASE-DELEGATION-003：用户要求分析评测结果并输出报告
  - #4 id=goodcase-BADCASE-DELEGATION-004：用户要求创建ISC规则JSON文件
  - #12 id=goodcase-badcase-report-as-md-not-feishu：用户要求飞书文档交付，但子Agent产出写入本地md文件
  - #56 id=goodcase-CI-001：算了
  - #58 id=goodcase-CI-003：嗯
  - #64 id=goodcase-CI-009：你怎么看？
  - #69 id=goodcase-CI-014：你确定？
  - #73 id=goodcase-CI-018：哎，又来了
- expected_output不可验样例（前10）：
  - #8 id=goodcase-badcase-subagent-empty-run-writer：子Agent必须真正调用read/write工具完成任务

## 文件：`纠偏类.json`（54条）
- 难度分布：{None: 54}
- 格式完整性问题：225 处字段缺失/空值
- 难度标注疑点：0 条
- input模板化/不真人：0 条（按启发式）
- expected_output偏泛化：0 条（按启发式）
- 典型缺失（前10）：
  - #1 id=RC-001 缺 `expected_output`
  - #1 id=RC-001 缺 `category`
  - #1 id=RC-001 缺 `difficulty`
  - #1 id=RC-001 缺 `source`
  - #2 id=RC-002 缺 `expected_output`
  - #2 id=RC-002 缺 `category`
  - #2 id=RC-002 缺 `difficulty`
  - #2 id=RC-002 缺 `source`
  - #3 id=RC-003 缺 `expected_output`
  - #3 id=RC-003 缺 `category`
- 非法难度值（前10）：
  - #1 id=RC-001 difficulty=None
  - #2 id=RC-002 difficulty=None
  - #3 id=RC-003 difficulty=None
  - #4 id=RC-004 difficulty=None
  - #5 id=RC-005 difficulty=None
  - #6 id=RC-006 difficulty=None
  - #7 id=RC-007 difficulty=None
  - #8 id=RC-008 difficulty=None
  - #9 id=RC-009 difficulty=None
  - #10 id=RC-010 difficulty=None

## 文件：`auto-generated-from-corrections.json`（17条）
- 难度分布：{'C1': 9, None: 8}
- 格式完整性问题：42 处字段缺失/空值
- 难度标注疑点：0 条
- input模板化/不真人：17 条（按启发式）
- expected_output偏泛化：0 条（按启发式）
- 典型缺失（前10）：
  - #1 id=auto-eval-1772958892924-0 缺 `input`
  - #1 id=auto-eval-1772958892924-0 缺 `expected_output`
  - #2 id=auto-eval-1772958892924-1 缺 `input`
  - #2 id=auto-eval-1772958892924-1 缺 `expected_output`
  - #3 id=auto-eval-1772958892924-2 缺 `input`
  - #3 id=auto-eval-1772958892924-2 缺 `expected_output`
  - #4 id=auto-eval-1772958892924-3 缺 `input`
  - #4 id=auto-eval-1772958892924-3 缺 `expected_output`
  - #5 id=auto-eval-1772958892924-4 缺 `input`
  - #5 id=auto-eval-1772958892924-4 缺 `expected_output`
- 非法难度值（前10）：
  - #10 id=auto-eval-1772974801366-0 difficulty=None
  - #11 id=auto-eval-1772978402115-0 difficulty=None
  - #12 id=auto-eval-1772978402115-1 difficulty=None
  - #13 id=auto-eval-1772978402115-2 difficulty=None
  - #14 id=auto-eval-1772978402115-3 difficulty=None
  - #15 id=auto-eval-1772978402115-4 difficulty=None
  - #16 id=auto-eval-1772978402115-5 difficulty=None
  - #17 id=auto-eval-1772978402115-6 difficulty=None
- 模板化input样例（前10）：
  - #1 id=auto-eval-1772958892924-0：
  - #2 id=auto-eval-1772958892924-1：
  - #3 id=auto-eval-1772958892924-2：
  - #4 id=auto-eval-1772958892924-3：
  - #5 id=auto-eval-1772958892924-4：
  - #6 id=auto-eval-1772958892924-5：
  - #7 id=auto-eval-1772958892924-6：
  - #8 id=auto-eval-1772960401351-0：
  - #9 id=auto-eval-1772971201760-0：
  - #10 id=auto-eval-1772974801366-0：

## 与V3标准逐维结论（逐条审口径）
1. **格式完整性**：未完全达标。存在字段体系不一致（部分样本更像badcase schema而非golden schema），需要统一为 `id/input/expected_output/category/difficulty/source`。
2. **难度标注**：存在系统性漂移。若按V3，C2应强调多轮+隐含意图+跨模块+>=4步链路；当前有不少短句单意图却高难度，或复杂链路却标C1。
3. **input真实性**：存在模板化。多条是“任务说明句”而非用户自然表达，建议回填原始对话口语版本。
4. **expected_output质量**：部分可验性不足。应改成“可观察动作+验真信号（工具调用、产物路径、状态变更、失败分支）”。
5. **V3对齐**：部分对齐（覆盖纠偏/闭环/规则生效等主题），但在“真实来源、角色分离、执行验真证据”字段化方面不充分。

## 整改建议（可直接执行）
- 统一schema并加JSON Schema校验（CI阻断缺字段/空字段/非法difficulty）。
- 每条补充 `source_evidence`（session id + message id/时间戳）以满足真实来源审计。
- 重写模板化input为真实口语；保留原句到 `raw_input`。
- expected_output改为三段：`must_actions` / `must_artifacts` / `verification`。
- 建立难度打分器（轮次、隐含意图、跨模块、执行步数）自动给建议等级，再人工复核。
- 对247条大文件做二次人工复核优先级：先修字段缺失与难度错配，再修话术真实性。

## 备注
- 本报告已覆盖三文件全量读取与审计统计；大文件247条已全量纳入检查。