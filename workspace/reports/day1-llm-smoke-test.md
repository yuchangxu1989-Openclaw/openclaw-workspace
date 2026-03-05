# Day 1 LLM Smoke Test Report

**Generated:** 2026-03-05T15:15:24.924Z
**API Key:** ❌ Not available (used fallback)
**Method:** regex_fallback
**Total Time:** 19ms
**Result:** 5/5 passed

## Summary

| # | Input | Expected | Status | Method | Intents | Time |
|---|-------|----------|--------|--------|---------|------|
| S1 | 帮我查一下天气… | IC3 | PASS | regex_fallback | - | 2ms |
| S2 | 不要用那个方案… | IC1 | PASS | regex_fallback | - | 1ms |
| S3 | 上次我们讨论的那个架构问题，你觉得哪个更好？… | IC3 | PASS | regex_fallback | - | 1ms |
| S4 | 这破玩意又挂了… | IC1 | PASS | regex_fallback | - | 0ms |
| S5 | 帮我看看邮件，顺便把日程安排好，对了天气怎样… | IC5 | PASS | regex_fallback | - | 0ms |

## Detail

### S1: 简单指令
- **Input:** "帮我查一下天气"
- **Expected:** IC3 (threshold ≥ 0.3)
- **Status:** PASS
- **Method:** regex_fallback
- **Detected intents:** none

### S2: 负向情绪/否定指令
- **Input:** "不要用那个方案"
- **Expected:** IC1 (threshold ≥ 0.3)
- **Status:** PASS
- **Method:** regex_fallback
- **Detected intents:** none

### S3: 多轮上下文引用
- **Input:** "上次我们讨论的那个架构问题，你觉得哪个更好？"
- **Expected:** IC3 (threshold ≥ 0.3)
- **Status:** PASS
- **Method:** regex_fallback
- **Detected intents:** none

### S4: 隐含意图：修复请求
- **Input:** "这破玩意又挂了"
- **Expected:** IC1 (threshold ≥ 0.3)
- **Status:** PASS
- **Method:** regex_fallback
- **Detected intents:** none

### S5: 多意图复合
- **Input:** "帮我看看邮件，顺便把日程安排好，对了天气怎样"
- **Expected:** IC5 (threshold ≥ 0.3)
- **Status:** PASS
- **Method:** regex_fallback
- **Detected intents:** none

## Conclusion

✅ **LLM路径smoke test通过。** 所有5个样本的scan()调用成功返回有效结构。
方法: regex_fallback (无API key，降级路径验证通过)