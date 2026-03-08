# Benchmark Shard B Repickup Progress — 2026-03-07

- Scope: PB-014 ~ PB-026（Case 分片 B）
- Focus: Benchmark timeout 收口 / repo 状态复核

## 执行结果

1. 在现有仓库中定位到 benchmark 相关实现位于 `principle-e2e-spec/`。
2. 复核了核心 runner：`principle-e2e-spec/scripts/benchmark_runner.py`。
3. 复核了回归测试：`principle-e2e-spec/scripts/test_capability_regression.py`。
4. 实测回归：
   - `python3 scripts/test_capability_regression.py` ✅ 通过
   - `bash scripts/run_regression.sh` ✅ 通过
5. 发现一个易踩坑点：`scripts/run_regression.sh` 是 bash 脚本，若误用 `python3 scripts/run_regression.sh` 会报 `SyntaxError`；改用 `bash` 执行后正常通过。

## 对 timeout 收口的判断

- 当前仓库内未发现 PB-014 ~ PB-026 的独立 case 文件、任务清单或 timeout 失败产物。
- 在可见 benchmark 范围内，现有 capability regression 与 smoke 均可在短时内完成，未复现新的 benchmark timeout。
- 因缺少 PB-014 ~ PB-026 对应输入/失败样本，本次未做代码修改；先完成 repo 内可执行 benchmark 的复跑与收口确认。

## 产物

- 回归脚本复跑通过，无新增代码改动。
- 本进度文件：`reports/benchmark-shard-b-repickup-2026-03-07.md`

## 建议下一步

- 若主任务侧持有 PB-014 ~ PB-026 的 case 清单、失败日志或 timeout 命令行，请补充后可继续逐案收口。
- 对调用方补充一条说明：统一使用 `bash scripts/run_regression.sh`，避免把 shell 脚本当 Python 执行造成伪失败。
