#!/usr/bin/env python3
"""
P0-2: 黄金评测集补V4字段 - 第2批50条
跳过已有V4字段的case，为下一批50条补齐: scoring_rubric, north_star_indicator, gate
"""
import json, os, sys

EVAL_DIR = "/root/.openclaw/workspace/skills/aeo/evaluation-sets"

# V4五大北极星指标
NORTH_STARS = {
    "言出法随达成率": "言出法随达成率",
    "自主闭环率": "自主闭环率",
    "认知层真实代码覆盖率": "认知层真实代码覆盖率",
    "独立QA覆盖率": "独立QA覆盖率",
    "根因分析覆盖率": "根因分析覆盖率",
}

# ============================================================
# 北极星指标映射规则（基于skill名+dimension+description+input）
# ============================================================
def infer_north_star(skill, case):
    """根据case内容推断最相关的北极星指标"""
    dim = case.get("dimension", "")
    desc = case.get("description", "")
    inp = case.get("input", "")
    if isinstance(inp, dict):
        inp = json.dumps(inp, ensure_ascii=False)
    cat = case.get("category", "")
    domain = case.get("domain", "")
    tags = case.get("tags", [])
    text = f"{skill} {dim} {desc} {inp} {cat} {domain} {' '.join(tags)}".lower()

    # 根因分析覆盖率: debugging, error, root cause, monitoring, diagnostics, anti-entropy
    if any(k in text for k in ["root.cause", "根因", "error", "错误", "debug", "诊断",
                                 "anti-entropy", "monitor", "监控", "stability", "稳定",
                                 "errorrate", "error_rate", "crash", "崩溃", "degradation",
                                 "slow.query", "慢查询", "connection.pool", "连接池"]):
        return "根因分析覆盖率"

    # 独立QA覆盖率: QA, quality, audit, evaluation, test, security, safety
    if any(k in text for k in ["qa", "quality", "audit", "质量", "评估", "评测",
                                 "security", "安全", "safety", "sql.inject", "xss",
                                 "注入", "防护", "sanitiz", "aeo", "eval"]):
        return "独立QA覆盖率"

    # 自主闭环率: autonomous, pipeline, cron, auto, self-healing, agent-mode, dispatch
    if any(k in text for k in ["自主", "闭环", "autonomous", "pipeline", "流水线",
                                 "cron", "auto", "自动", "agent.mode", "dispatch",
                                 "evolver", "进化", "council", "裁决",
                                 "anti-entropy", "熵减"]):
        return "自主闭环率"

    # 认知层真实代码覆盖率: code, architecture, coverage, vector, search, api
    if any(k in text for k in ["code", "代码", "architecture", "架构", "coverage",
                                 "覆盖", "vector", "向量", "api", "接口",
                                 "performance", "性能", "rate.limit", "throttl",
                                 "convert", "转换", "cogvi", "视觉", "image", "video",
                                 "ocr", "vision", "asr", "tts"]):
        return "认知层真实代码覆盖率"

    # 言出法随达成率: execution, command, direct action, relevance, helpfulness
    if any(k in text for k in ["执行", "命令", "execute", "command", "relevance",
                                 "相关", "helpfulness", "帮助", "coherence", "连贯",
                                 "creativity", "创造", "prompt", "input", "登录",
                                 "login", "auth"]):
        return "言出法随达成率"

    # 默认
    return "言出法随达成率"


# ============================================================
# Gate映射规则
# ============================================================
def infer_gate(skill, case):
    """Gate-A=基础功能/正确性/安全; Gate-B=高级质量/创新/优化"""
    dim = case.get("dimension", "")
    desc = case.get("description", "")
    cat = case.get("category", "")
    tags = case.get("tags", [])
    text = f"{dim} {desc} {cat} {' '.join(tags)}".lower()

    # Gate-B: 高级场景
    if any(k in text for k in ["creativity", "创造", "optimization", "优化",
                                 "performance", "性能", "scalab", "扩展",
                                 "advanced", "高级", "stress", "load",
                                 "resilience", "degradation", "降级"]):
        return "Gate-B"

    # Gate-A: 基础场景
    return "Gate-A"


# ============================================================
# 评分标准生成（基于case内容生成具体有意义的rubric）
# ============================================================
RUBRIC_TEMPLATES = {
    # 按dimension
    "relevance": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "回答完全切题，覆盖用户问题的所有关键点，无冗余信息"},
            {"score": "7-8", "condition": "回答基本切题，覆盖主要关键点，有少量冗余或遗漏"},
            {"score": "4-6", "condition": "回答部分切题，遗漏重要信息或包含较多无关内容"},
            {"score": "1-3", "condition": "回答严重偏题或未理解用户意图"},
        ]
    },
    "coherence": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "逻辑严密，上下文连贯，推理链完整无断裂"},
            {"score": "7-8", "condition": "整体连贯，偶有逻辑跳跃但不影响理解"},
            {"score": "4-6", "condition": "存在明显逻辑断裂或前后矛盾"},
            {"score": "1-3", "condition": "逻辑混乱，无法形成有效推理链"},
        ]
    },
    "helpfulness": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "提供可直接执行的完整方案，包含具体步骤和代码示例"},
            {"score": "7-8", "condition": "提供有效方案但缺少部分细节，用户需少量补充"},
            {"score": "4-6", "condition": "方向正确但过于笼统，用户需大量自行补充"},
            {"score": "1-3", "condition": "未提供实质性帮助或方案不可行"},
        ]
    },
    "creativity": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "提出创新性方案，超越常规思路，具有实际可行性"},
            {"score": "7-8", "condition": "有一定创新元素，在常规方案基础上有改进"},
            {"score": "4-6", "condition": "方案中规中矩，无明显创新"},
            {"score": "1-3", "condition": "完全套用模板，无任何创新思考"},
        ]
    },
    "safety": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "主动识别安全风险，提供防护措施，无任何安全隐患"},
            {"score": "7-8", "condition": "基本安全，但未主动提示潜在风险"},
            {"score": "4-6", "condition": "存在轻微安全隐患，如未校验输入或未加密敏感数据"},
            {"score": "1-3", "condition": "存在严重安全漏洞，如明文密码、SQL注入风险"},
        ]
    },
    "accuracy": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "功能完全正确，所有断言通过，边界条件处理完善"},
            {"score": "7-8", "condition": "核心功能正确，少数边界条件未覆盖"},
            {"score": "4-6", "condition": "部分功能正确，存在明显bug或逻辑错误"},
            {"score": "1-3", "condition": "功能基本不可用，核心逻辑错误"},
        ]
    },
    "responseTime": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "响应时间<200ms，P99<500ms，无超时"},
            {"score": "7-8", "condition": "响应时间200-500ms，偶有慢请求但不影响体验"},
            {"score": "4-6", "condition": "响应时间500ms-2s，用户可感知延迟"},
            {"score": "1-3", "condition": "响应时间>2s或频繁超时"},
        ]
    },
    "errorRate": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "错误率<0.1%，异常全部被捕获并优雅处理"},
            {"score": "7-8", "condition": "错误率0.1%-1%，大部分异常被处理"},
            {"score": "4-6", "condition": "错误率1%-5%，部分异常未被捕获"},
            {"score": "1-3", "condition": "错误率>5%，频繁崩溃或未处理异常"},
        ]
    },
    "compatibility": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "与所有已知上下游系统完全兼容，版本变更无影响"},
            {"score": "7-8", "condition": "主要系统兼容，少数边缘场景需适配"},
            {"score": "4-6", "condition": "部分系统不兼容，需要手动干预"},
            {"score": "1-3", "condition": "严重不兼容，阻塞核心流程"},
        ]
    },
    "stability": {
        "scale": "1-10",
        "criteria": [
            {"score": "9-10", "condition": "7×24小时稳定运行，无内存泄漏、无僵尸进程"},
            {"score": "7-8", "condition": "基本稳定，偶有需要重启的情况但可自愈"},
            {"score": "4-6", "condition": "每天需要人工干预1-2次"},
            {"score": "1-3", "condition": "频繁崩溃，无法持续运行"},
        ]
    },
}

def generate_rubric_for_rich_case(case):
    """为有详细内容的rich case生成针对性rubric"""
    desc = case.get("description", "")
    cat = case.get("category", "")
    domain = case.get("domain", "")
    tags = case.get("tags", [])
    text = f"{desc} {cat} {domain} {' '.join(tags)}".lower()

    if "login" in text or "auth" in text:
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "认证流程完全正确，token格式合规，错误码精确，安全防护到位"},
                {"score": "7-8", "condition": "认证流程正确，但缺少部分安全细节（如token过期处理）"},
                {"score": "4-6", "condition": "基本认证可用，但存在安全隐患或错误码不准确"},
                {"score": "1-3", "condition": "认证流程有严重缺陷，如明文传输或绕过漏洞"},
            ]
        }
    elif "performance" in text or "load" in text or "stress" in text:
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "P95<300ms，错误率<0.1%，资源利用率合理，无内存泄漏"},
                {"score": "7-8", "condition": "P95<500ms，错误率<1%，偶有资源波动"},
                {"score": "4-6", "condition": "P95>500ms或错误率>1%，存在性能瓶颈"},
                {"score": "1-3", "condition": "严重性能问题，超时频繁或资源耗尽"},
            ]
        }
    elif "rate.limit" in text or "throttl" in text:
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "限流策略精确生效，429状态码正确返回，Retry-After头准确"},
                {"score": "7-8", "condition": "限流基本生效，但边界值处理不够精确"},
                {"score": "4-6", "condition": "限流部分生效，存在绕过可能或误限正常请求"},
                {"score": "1-3", "condition": "限流机制失效或严重误判"},
            ]
        }
    elif "connection.pool" in text or "degradation" in text or "resilience" in text:
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "优雅降级完美执行，请求排队有序，无数据丢失，自动恢复"},
                {"score": "7-8", "condition": "降级基本正常，少量请求超时但无崩溃"},
                {"score": "4-6", "condition": "降级部分生效，有请求丢失或长时间阻塞"},
                {"score": "1-3", "condition": "降级失败，系统崩溃或数据损坏"},
            ]
        }
    elif "query" in text or "optim" in text:
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "准确识别慢查询，优化建议具体可执行（含索引方案和预期提升）"},
                {"score": "7-8", "condition": "识别慢查询正确，优化建议方向正确但缺少量化预期"},
                {"score": "4-6", "condition": "部分慢查询未识别，或优化建议过于笼统"},
                {"score": "1-3", "condition": "未能识别慢查询或建议错误"},
            ]
        }
    elif "sql.inject" in text or "xss" in text or "security" in text:
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "攻击100%被拦截，安全日志完整，无信息泄露，防护规则精确"},
                {"score": "7-8", "condition": "主要攻击被拦截，但存在少量变体绕过可能"},
                {"score": "4-6", "condition": "部分攻击被拦截，防护规则不够全面"},
                {"score": "1-3", "condition": "防护基本失效，攻击可成功执行"},
            ]
        }
    elif "vector" in text or "semantic" in text or "search" in text:
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "检索结果Top5全部语义相关，相似度>0.7，响应<100ms"},
                {"score": "7-8", "condition": "Top5中4个以上语义相关，相似度>0.5"},
                {"score": "4-6", "condition": "Top5中仅2-3个相关，存在明显噪声结果"},
                {"score": "1-3", "condition": "检索结果与查询无关或系统报错"},
            ]
        }
    else:
        # 通用rich case rubric
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "功能完全符合预期，所有断言通过，边界条件覆盖完善"},
                {"score": "7-8", "condition": "核心功能正确，少数边界条件未覆盖"},
                {"score": "4-6", "condition": "部分功能正确，存在可复现的缺陷"},
                {"score": "1-3", "condition": "核心功能不可用或严重偏离预期"},
            ]
        }


def generate_rubric(skill, case):
    """为case生成评分标准"""
    dim = case.get("dimension", "")
    # Rich case (有assertions或detailed input)
    if "assertions" in case or (isinstance(case.get("input"), dict) and "endpoint" in case.get("input", {})):
        return generate_rubric_for_rich_case(case)
    # Simple case - 按dimension匹配模板
    if dim in RUBRIC_TEMPLATES:
        return RUBRIC_TEMPLATES[dim]
    # antiPattern类型
    if dim == "antiPattern" or "禁止" in case.get("expected", "") or "不应" in case.get("description", ""):
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "完全避免反模式行为，直接执行用户指令，无多余确认或反问"},
                {"score": "7-8", "condition": "基本避免反模式，但措辞中有轻微犹豫或冗余确认"},
                {"score": "4-6", "condition": "部分触发反模式行为，如不必要的反问"},
                {"score": "1-3", "condition": "完全触发反模式，违反用户明确指令"},
            ]
        }
    # capability_routing类型
    if dim == "capability_routing":
        return {
            "scale": "1-10",
            "criteria": [
                {"score": "9-10", "condition": "正确识别能力需求并路由到最优模型，执行流程完全正确"},
                {"score": "7-8", "condition": "路由基本正确，但未选择最优模型或流程有冗余步骤"},
                {"score": "4-6", "condition": "路由方向正确但模型选择错误，或遗漏关键能力"},
                {"score": "1-3", "condition": "路由完全错误，触发能力遗忘或拒绝执行"},
            ]
        }
    # 默认
    return RUBRIC_TEMPLATES.get("relevance")


# ============================================================
# 主处理逻辑
# ============================================================
def process():
    # 获取所有skill目录，按字母排序
    skill_dirs = sorted([
        d for d in os.listdir(EVAL_DIR)
        if os.path.isdir(os.path.join(EVAL_DIR, d))
    ])

    processed = 0
    target = 50
    modified_files = []

    for skill_dir in skill_dirs:
        if processed >= target:
            break

        tc_path = os.path.join(EVAL_DIR, skill_dir, "test-cases.json")
        if not os.path.exists(tc_path):
            continue

        with open(tc_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 获取cases数组
        if isinstance(data, dict):
            cases = data.get("cases", data.get("testCases", []))
            cases_key = "cases" if "cases" in data else "testCases" if "testCases" in data else None
        elif isinstance(data, list):
            cases = data
            cases_key = None
        else:
            continue

        if not cases:
            continue

        modified = False
        for case in cases:
            if processed >= target:
                break

            # 跳过已有V4字段的case（不计入processed，只处理新的）
            if "scoring_rubric" in case and "north_star_indicator" in case and "gate" in case:
                continue

            # 补V4字段
            case["scoring_rubric"] = generate_rubric(skill_dir, case)
            case["north_star_indicator"] = infer_north_star(skill_dir, case)
            case["gate"] = infer_gate(skill_dir, case)
            modified = True
            processed += 1

        if modified:
            # 写回文件
            with open(tc_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            modified_files.append(f"{skill_dir}/test-cases.json ({len(cases)} cases)")

    print(f"✅ 已处理 {processed} 条评测case")
    print(f"📝 修改了 {len(modified_files)} 个文件:")
    for mf in modified_files:
        print(f"   - {mf}")


if __name__ == "__main__":
    process()
