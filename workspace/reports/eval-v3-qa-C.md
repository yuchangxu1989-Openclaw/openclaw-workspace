# eval-v3 QA-C 批次9-12核查报告

依据：AEO评测标准与基线V3（已先读）
范围：指定6个文件，全量逐条核查（非抽样）

## /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/goodcases-from-badcases.json
- 样本数: 84
- C2数: 50（占比 59.5%）
- difficulty非法（非C1/C2）: 0 []
- C2不符合V3定义: 32 [168, 169, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 182, 196, 229, 230, 232, 233, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246]
- source真实性存疑/缺失: 0 []
- expected_output不可验证: 0 []
- multi_turn标注不准确: 0 []
- 删除合理性不足（删除但无充分理由）: 0 []

## /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/mined-from-memory.json
- 样本数: 35
- C2数: 35（占比 100.0%）
- difficulty非法（非C1/C2）: 0 []
- C2不符合V3定义: 35 [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
- source真实性存疑/缺失: 0 []
- expected_output不可验证: 0 []
- multi_turn标注不准确: 0 []
- 删除合理性不足（删除但无充分理由）: 0 []

## /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/session-20260308-evening.json
- 样本数: 0
- C2数: 0（空文件）
- difficulty非法（非C1/C2）: 0 []
- C2不符合V3定义: 0 []
- source真实性存疑/缺失: 0 []
- expected_output不可验证: 0 []
- multi_turn标注不准确: 0 []
- 删除合理性不足（删除但无充分理由）: 0 []

## /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/交付质量类.json
- 样本数: 0
- C2数: 0（空文件）
- difficulty非法（非C1/C2）: 0 []
- C2不符合V3定义: 0 []
- source真实性存疑/缺失: 0 []
- expected_output不可验证: 0 []
- multi_turn标注不准确: 0 []
- 删除合理性不足（删除但无充分理由）: 0 []

## /root/.openclaw/workspace/tests/benchmarks/intent/c2-golden/纠偏类.json
- 样本数: 41
- C2数: 21（占比 51.2%）
- difficulty非法（非C1/C2）: 0 []
- C2不符合V3定义: 0 []
- source真实性存疑/缺失: 41 [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
- expected_output不可验证: 0 []
- multi_turn标注不准确: 0 []
- 删除合理性不足（删除但无充分理由）: 0 []

## /root/.openclaw/workspace/tests/benchmarks/intent/auto-generated-from-corrections.json
- 样本数: 23
- C2数: 0（占比 0.0%）
- difficulty非法（非C1/C2）: 23 [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
- C2不符合V3定义: 0 []
- source真实性存疑/缺失: 0 []
- expected_output不可验证: 23 [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
- multi_turn标注不准确: 0 []
- 删除合理性不足（删除但无充分理由）: 0 []

## 总体结论
- 总样本数: 183
- 总C2占比: 57.9%（目标≥80%）
- 结论: 不通过（C2占比未达标）
- 备注: 对空文件（session-20260308-evening.json、交付质量类.json）按0条计入，直接拉低覆盖与占比，建议立即补齐真实多轮C2用例。