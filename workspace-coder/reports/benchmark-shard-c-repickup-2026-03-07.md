# Benchmark timeout 收口 / Case 分片C 回捞进度（2026-03-07）

- 分片范围：PB-027 ~ PB-038
- 仓库：`principle-e2e-spec`
- 处理方式：直接在现有仓库执行回归与 smoke，确认当前 timeout 收口是否仍阻塞；补充记录本轮发现。

## 本轮执行

1. 执行能力回归：
   - `python3 scripts/test_capability_regression.py`
   - 结果：通过
2. 执行统一回归脚本：
   - `./scripts/run_regression.sh`
   - 结果：通过
3. 额外验证 benchmark runner 的单 case 用法：
   - `python3 scripts/benchmark_runner.py --case examples/benchmark_case_pass.json --runtime examples/closed_book_pass.json --out examples/.smoke-out.json`
   - 结果：可正常产出
4. 额外探测一个潜在收口点：
   - 直接将 `08-capability-test-cases.json`（case 列表）传给 `--case`
   - 结果：失败，报错 `AttributeError: 'list' object has no attribute 'get'`

## 结论

- 当前仓库内未复现新的 Benchmark timeout 卡死；现有回归与 smoke 路径均可在预期时间内完成。
- 但发现一个**非 timeout、属于 runner 入参鲁棒性缺口**：`benchmark_runner.py` 只接受单个 case object，若误传 case 列表文件会直接抛异常退出。
- 因此，PB-027 ~ PB-038 这一轮回捞结论可先记为：
  - **timeout 收口：当前回归路径已通**
  - **遗留缺口：需补 runner 对 case-list 输入的友好报错/批处理支持**

## 产物

- 回归输出：`examples/.smoke-out.json`
- 进度记录：`reports/benchmark-shard-c-repickup-2026-03-07.md`

## 建议后续

1. 给 `benchmark_runner.py` 增加 case schema 校验，至少对 list 输入 fail-fast，并输出明确错误信息。
2. 如 PB-027 ~ PB-038 原本就是批量 benchmark case，建议补一个 batch runner，避免调度层误把 case 集合文件直接传给单 case runner。
