#!/usr/bin/env python3
"""
批量生成 C2 黄金评测集 —— 500+ 条"言出法随"复杂度用例
每条用例包含: trigger, expected_execution_chain, badcase_conditions, pass_criteria, required_capabilities
"""
import json, os, itertools

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "tests", "benchmarks", "intent", "c2-golden")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ============================================================
# 全局 Badcase 判定规则（写入每个文件的元数据）
# ============================================================
GLOBAL_BADCASE_RULES = [
    "认知层只看文档不看代码",
    "架构/开发产出没过独立QA Agent",
    "新ISC规则只写JSON没全链路展开",
    "非决策步骤需用户手动推动",
    "执行链缺根因分析直接改症状",
    "汇报数据与runtime不一致",
]

# ============================================================
# 变体维度（每个场景用这些维度做笛卡尔组合再采样）
# ============================================================
TRIGGER_MODES = ["直接指令", "隐含意图", "多轮渐进"]
SCOPE_LEVELS = ["2模块", "5模块", "全系统"]
EXCEPTION_PATHS = ["正常流程", "超时", "失败回滚", "部分失败"]
USER_PARTICIPATION = ["零参与", "1次确认", "多次拍板"]


def make_variant_tag(tm, sl, ep, up):
    return f"{tm}|{sl}|{ep}|{up}"


def gen_variants(n=50):
    """生成 n 个不重复的变体组合"""
    combos = list(itertools.product(TRIGGER_MODES, SCOPE_LEVELS, EXCEPTION_PATHS, USER_PARTICIPATION))
    # 48 种组合，n=50 时补 2 个边界变体
    result = combos[:]
    # 补充边界组合
    extras = [
        ("多轮渐进+情绪升级", "全系统+跨仓库", "级联失败", "零参与"),
        ("隐含意图+反问", "2模块+外部依赖", "幂等冲突", "1次确认"),
        ("直接指令+附加约束", "5模块+配置联动", "权限不足", "多次拍板"),
    ]
    result.extend(extras)
    return result[:n]


# ============================================================
# 场景 01：CRAS学术洞察→系统优化
# ============================================================
def gen_01_academic_insight():
    topics = [
        ("RAG检索增强生成", "向量检索模块", "智谱embedding"),
        ("CoT思维链推理", "意图识别模块", "IntentScanner"),
        ("Multi-Agent协作框架", "调度引擎", "dispatch-engine"),
        ("Self-Reflection自反思", "CRAS模块", "CRAS洞察系统"),
        ("Tool-Use工具调用", "技能路由", "skill-router"),
        ("Long-Context长上下文", "记忆模块", "elite-longterm-memory"),
        ("RLHF人类反馈强化学习", "AEO评测", "evaluation-runner"),
        ("知识蒸馏", "模型路由", "model-router"),
        ("Prompt Engineering", "系统提示词", "SOUL.md/AGENTS.md"),
        ("Agent Memory", "记忆架构", "memory/MEMORY.md"),
        ("Constitutional AI", "ISC规则体系", "isc-rules/"),
        ("Function Calling优化", "事件总线", "event-bus"),
        ("Mixture of Experts", "多Agent调度", "dispatcher.js"),
        ("Retrieval Augmented思维", "CRAS研究链", "cras-research"),
        ("Code Generation", "代码生成技能", "coder-agent"),
        ("Planning Agent", "任务规划", "dto-planner"),
        ("Evaluation-Driven开发", "AEO闭环", "aeo-pipeline"),
    ]
    
    trigger_templates = {
        "直接指令": [
            "去调研一下{topic}的最新进展，看看能不能优化我们的{module}",
            "搜一下{topic}领域最近有什么突破，对我们{module}有什么启发",
            "做个{topic}的技术调研，找到能落地到{component}的优化点",
            "调研{topic}最新论文，分析对{module}的适用性",
        ],
        "隐含意图": [
            "我觉得{module}的效果还不够好，业界有什么更先进的方案",
            "{component}的准确率一直上不去，是不是方法论就不对",
            "最近看到{topic}很火，我们是不是也该跟进",
            "竞品的{module}比我们强太多了，差距在哪",
        ],
        "多轮渐进": [
            "最近{topic}有什么新进展？\n[等回复后] 那这些进展能用到我们的{module}吗？\n[等回复后] 具体怎么落地？出个方案",
            "{module}最近表现怎么样？\n[等回复后] 跟业界水平比呢？\n[等回复后] 差距这么大？去调研一下{topic}看怎么追上",
            "你了解{topic}吗？\n[等回复后] 说说它对{component}可能的影响\n[等回复后] 出个优化方案并实施",
        ],
    }
    
    base_chain = [
        {"step": 1, "action": "接收调研指令，解析调研主题和目标模块", "auto": True},
        {"step": 2, "action": "使用tavily-search搜索{topic}最新论文/技术文章", "auto": True},
        {"step": 3, "action": "提取≥3篇高质量文献，生成结构化摘要", "auto": True},
        {"step": 4, "action": "grep全仓库{component}相关代码，建立本地能力基线", "auto": True, "critical": "必须读真实代码，不能只看文档"},
        {"step": 5, "action": "将文献洞察与本地代码基线做gap分析", "auto": True},
        {"step": 6, "action": "生成优化方案（含代码修改点、预期收益、风险）", "auto": True},
        {"step": 7, "action": "派独立QA Agent审查方案可行性", "auto": True, "critical": "必须独立Agent，不能自审"},
        {"step": 8, "action": "QA反馈→修正方案（若有问题自动迭代，不超3轮）", "auto": True},
        {"step": 9, "action": "提交凌霄阁七人裁决审议", "auto": True},
        {"step": 10, "action": "用户最终拍板确认", "auto": False, "user_decision": True},
        {"step": 11, "action": "执行代码修改，产出diff", "auto": True},
        {"step": 12, "action": "派独立QA Agent审查代码diff+运行测试", "auto": True, "critical": "第二次独立QA"},
    ]
    
    badcase_templates = [
        "调研只搜索了1篇文献就下结论",
        "认知层只看了CAPABILITY-ANCHOR.md没grep真实代码",
        "优化方案没有与本地代码做gap分析",
        "方案没过独立QA Agent直接提交凌霄阁",
        "中间步骤等用户推动才继续",
        "代码修改没有diff验证",
        "调研报告只有摘要没有可落地的优化点",
        "QA反馈有问题但直接忽略没迭代",
    ]
    
    pass_criteria_templates = [
        "搜索结果≥3篇且来源可验证",
        "本地代码基线通过grep真实.js/.py文件建立",
        "gap分析包含≥3个具体差距点",
        "优化方案包含代码修改位置+预期收益量化",
        "独立QA Agent审查记录存在（2次）",
        "用户仅在Step10参与决策，其余全自动",
        "最终产出包含可运行的代码diff",
    ]
    
    required_caps = ["tavily-search", "grep全仓库代码", "独立QA Agent", "凌霄阁裁决", "代码修改+diff"]
    
    cases = []
    variants = gen_variants(55)
    
    for i, (tm, sl, ep, up) in enumerate(variants):
        topic_data = topics[i % len(topics)]
        topic, module, component = topic_data
        
        # 选择触发语模板
        trigger_list = trigger_templates.get(tm.split("+")[0], trigger_templates["直接指令"])
        trigger_text = trigger_list[i % len(trigger_list)].format(
            topic=topic, module=module, component=component
        )
        
        # 根据异常路径调整执行链
        chain = []
        for step in base_chain:
            s = {**step, "action": step["action"].format(
                topic=topic, module=module, component=component
            )}
            chain.append(s)
        
        if ep == "超时":
            chain.insert(8, {"step": "8.5", "action": "QA Agent超时→触发递归收敛：replace后重派", "auto": True})
        elif ep == "失败回滚":
            chain.append({"step": 13, "action": "代码修改导致测试失败→自动回滚→根因分析→重新修改", "auto": True})
        elif ep == "部分失败":
            chain.append({"step": 13, "action": "部分测试失败→定位失败用例→针对性修复→再次QA", "auto": True})
        elif ep == "级联失败":
            chain.append({"step": 13, "action": "修改引发下游模块级联失败→全链路影响面扫描→逐层修复", "auto": True})
        elif ep == "幂等冲突":
            chain.append({"step": 13, "action": "并发修改冲突→检测幂等性→合并或排队重试", "auto": True})
        elif ep == "权限不足":
            chain.insert(3, {"step": "3.5", "action": "搜索API权限不足→自动切换备用搜索渠道", "auto": True})
        
        # 根据用户参与模式调整
        if up == "零参与":
            chain = [s for s in chain if not s.get("user_decision")]
            chain.append({"step": len(chain)+1, "action": "自动执行完成，仅汇报结果", "auto": True})
        elif up == "多次拍板":
            chain.insert(5, {"step": "5.5", "action": "用户确认调研方向是否正确", "auto": False, "user_decision": True})
        
        # 根据scope调整
        scope_note = ""
        if sl == "全系统":
            scope_note = "，影响面扫描覆盖全仓库所有模块"
        elif sl == "5模块":
            scope_note = "，影响面覆盖5个核心模块"
        elif sl == "全系统+跨仓库":
            scope_note = "，跨仓库影响面分析（含openclaw核心+workspace）"
        elif sl == "2模块+外部依赖":
            scope_note = "，含外部API依赖影响分析"
        
        # 动态badcase
        bc = badcase_templates[:3] + [
            f"scope={sl}时未覆盖{sl}范围的影响面",
            f"异常路径={ep}时未正确处理",
            f"用户参与模式={up}时流程不符合预期",
        ]
        
        cases.append({
            "id": f"C2-01-{i+1:03d}",
            "category": "CRAS学术洞察→系统优化",
            "complexity": "C2",
            "variant": make_variant_tag(tm, sl, ep, up),
            "trigger": {
                "mode": tm,
                "text": trigger_text,
                "context": f"用户希望通过{topic}领域的最新研究成果优化本地{module}{scope_note}"
            },
            "expected_execution_chain": chain,
            "badcase_conditions": bc,
            "pass_criteria": pass_criteria_templates + [
                f"变体覆盖：触发模式={tm}，范围={sl}，异常={ep}，用户参与={up}"
            ],
            "required_capabilities": required_caps,
        })
    
    return cases


# ============================================================
# 场景 02：CRAS对话洞察→长效固化
# ============================================================
def gen_02_conversation_insight():
    problem_types = [
        ("反复纠偏同一类错误", "自纠偏规则", "rule.auto-correction"),
        ("头痛医头不做根因分析", "根因分析规则", "rule.root-cause-analysis"),
        ("汇报数据与runtime不一致", "数据诚实规则", "rule.data-honesty"),
        ("交付前不自检", "交付自检规则", "rule.delivery-self-qa"),
        ("认知层只看文档不看代码", "代码认知规则", "rule.code-cognition"),
        ("新规则只写JSON不展开", "全链路展开规则", "rule.full-chain-deploy"),
        ("中间步骤等用户推动", "自主流转规则", "rule.autonomous-flow"),
        ("架构产出没过QA", "独立QA规则", "rule.independent-qa"),
        ("任务拆分粒度不合理", "任务拆分规则", "rule.task-granularity"),
        ("搜索工具选择错误", "工具选择规则", "rule.tool-selection"),
        ("模型能力否认", "能力检查规则", "rule.capability-check"),
        ("超时不收敛", "超时收敛规则", "rule.timeout-convergence"),
        ("Agent空跑不告警", "健康检查规则", "rule.agent-health"),
        ("配置错误静默失败", "配置校验规则", "rule.config-validation"),
        ("并发冲突不处理", "并发控制规则", "rule.concurrency-control"),
        ("状态虚报", "状态审计规则", "rule.status-audit"),
        ("进化停滞", "进化驱动规则", "rule.evolution-drive"),
    ]
    
    trigger_templates = {
        "直接指令": [
            "分析最近3天的对话记录，找出反复出现的{problem}问题，建个规则固化下来",
            "把最近的对话日志翻一遍，看看有没有{problem}的模式，需要建规则防止",
            "扫描memory/目录下所有日志，提取{problem}类问题并建立长效规则",
            "对话记录里{problem}出现了好几次了，分析根因并建规则",
        ],
        "隐含意图": [
            "又犯这个错了，{problem}，你说怎么办",
            "这个问题我说了不止一次了吧，{problem}",
            "你自己觉得{problem}这个问题该怎么从根上解决",
            "每次都要提醒你{problem}，能不能自己记住",
        ],
        "多轮渐进": [
            "最近系统表现怎么样？\n[等回复后] 有没有反复出现的问题？\n[等回复后] {problem}这个出现几次了？建个规则",
            "翻一下最近的日志\n[等回复后] 我看到{problem}好几次了，你注意到了吗\n[等回复后] 分析根因，建规则固化",
            "你最近有什么反思？\n[等回复后] {problem}这类问题有改善吗\n[等回复后] 没改善就建规则强制执行",
        ],
    }
    
    base_chain = [
        {"step": 1, "action": "扫描memory/目录下最近N天的日志文件", "auto": True},
        {"step": 2, "action": "提取所有{problem}相关的对话片段", "auto": True},
        {"step": 3, "action": "对提取的片段做根因分析：是认知问题/流程问题/工具问题", "auto": True, "critical": "必须根因分析，不能直接改症状"},
        {"step": 4, "action": "根据根因分类，确定需要创建的ISC规则类型", "auto": True},
        {"step": 5, "action": "grep全仓库查找相关代码路径，确定感知层/认知层/执行层的锚点", "auto": True, "critical": "必须读真实代码"},
        {"step": 6, "action": "生成ISC规则JSON：isc-rules/{rule_id}.json", "auto": True},
        {"step": 7, "action": "展开感知层：编写探针/hook代码，绑定到事件总线", "auto": True, "critical": "JSON只是1%，后面99%是展开"},
        {"step": 8, "action": "展开认知层：编写匹配/判断逻辑代码", "auto": True},
        {"step": 9, "action": "展开执行层：编写修正动作代码", "auto": True},
        {"step": 10, "action": "派独立QA Agent审查规则+三层代码", "auto": True},
        {"step": 11, "action": "端到端验真：模拟触发→捕获→匹配→执行全流程", "auto": True},
        {"step": 12, "action": "注册到AEO评测集，生成对应C2评测用例", "auto": True},
    ]
    
    badcase_templates = [
        "只扫描了当天日志没看历史",
        "提取问题后直接写规则，跳过根因分析",
        "规则只写了JSON没展开三层代码",
        "感知层没有事件绑定/探针",
        "认知层没有匹配逻辑代码",
        "执行层没有修正动作代码",
        "没有端到端验真",
        "没有注册到AEO评测集",
        "QA审查被跳过或自审",
    ]
    
    pass_criteria = [
        "日志扫描覆盖≥3天",
        "根因分析产出明确的问题分类（认知/流程/工具）",
        "ISC规则JSON文件已创建",
        "感知层代码已写入（探针/hook）",
        "认知层代码已写入（匹配逻辑）",
        "执行层代码已写入（修正动作）",
        "独立QA Agent审查通过",
        "端到端验真成功（触发→捕获→匹配→执行）",
        "AEO评测集已更新",
    ]
    
    required_caps = ["memory日志扫描", "根因分析", "ISC规则创建", "三层代码展开", "独立QA Agent", "端到端验真", "AEO评测集更新"]
    
    cases = []
    variants = gen_variants(55)
    
    for i, (tm, sl, ep, up) in enumerate(variants):
        pt = problem_types[i % len(problem_types)]
        problem, rule_name, rule_id = pt
        
        trigger_list = trigger_templates.get(tm.split("+")[0], trigger_templates["直接指令"])
        trigger_text = trigger_list[i % len(trigger_list)].format(problem=problem)
        
        chain = []
        for step in base_chain:
            s = {**step, "action": step["action"].format(
                problem=problem, rule_id=rule_id
            )}
            chain.append(s)
        
        if ep == "超时":
            chain.insert(10, {"step": "10.5", "action": "QA Agent超时→递归收敛：缩小审查范围后重派", "auto": True})
        elif ep in ("失败回滚", "部分失败"):
            chain.append({"step": 13, "action": "端到端验真失败→回滚规则→修正代码→重新验真", "auto": True})
        elif ep == "级联失败":
            chain.append({"step": 13, "action": "新规则与已有规则冲突→MECE校验→调整规则边界", "auto": True})
        
        if up == "零参与":
            chain = [s for s in chain if not s.get("user_decision")]
        elif up == "多次拍板":
            chain.insert(4, {"step": "4.5", "action": "用户确认规则类型和方向", "auto": False, "user_decision": True})
            chain.append({"step": len(chain)+1, "action": "用户最终确认规则上线", "auto": False, "user_decision": True})
        elif up == "1次确认":
            chain.append({"step": len(chain)+1, "action": "用户确认规则生效", "auto": False, "user_decision": True})
        
        cases.append({
            "id": f"C2-02-{i+1:03d}",
            "category": "CRAS对话洞察→长效固化",
            "complexity": "C2",
            "variant": make_variant_tag(tm, sl, ep, up),
            "trigger": {
                "mode": tm,
                "text": trigger_text,
                "context": f"系统在对话中反复出现「{problem}」问题，需要通过洞察+规则固化从根因上解决"
            },
            "expected_execution_chain": chain,
            "badcase_conditions": badcase_templates[:3] + [
                f"根因分析结果不正确（{problem}的根因应为特定类别）",
                f"异常路径={ep}时处理不当",
                f"用户参与模式={up}时流程不符合预期",
            ],
            "pass_criteria": pass_criteria,
            "required_capabilities": required_caps,
        })
    
    return cases


# ============================================================
# 场景 03：全仓库改名/重构
# ============================================================
def gen_03_global_rename():
    rename_pairs = [
        ("DTO", "TaskOrchestrator", "任务调度引擎改名"),
        ("CRAS", "InsightEngine", "洞察引擎改名"),
        ("AEO", "QualityGate", "质量门禁改名"),
        ("ISC", "RuleEngine", "规则引擎改名"),
        ("IntentScanner", "IntentAnalyzer", "意图分析器改名"),
        ("凌霄阁", "StrategicCourt", "裁决神殿改名"),
        ("EvoMap", "SkillRegistry", "技能注册表改名"),
        ("dispatch-engine", "task-scheduler", "调度器改名"),
        ("event-bus", "signal-hub", "事件总线改名"),
        ("elite-longterm-memory", "persistent-memory", "记忆模块改名"),
        ("tavily-search", "research-engine", "搜索引擎改名"),
        ("council-of-seven", "review-board", "评审委员会改名"),
        ("skill-router", "capability-dispatcher", "技能路由改名"),
        ("model-router", "inference-gateway", "模型路由改名"),
        ("heartbeat", "pulse-check", "心跳改名"),
        ("workspace", "workbench", "工作区改名"),
        ("subagent", "worker-agent", "子Agent改名"),
    ]
    
    trigger_templates = {
        "直接指令": [
            "把{old_name}改名为{new_name}，全仓库所有引用都要改",
            "重构：{old_name}→{new_name}，零残留",
            "全局改名：{old_name}统一替换为{new_name}，包括代码/配置/文档/测试",
            "{desc}：{old_name}→{new_name}",
        ],
        "隐含意图": [
            "{old_name}这个名字不好，太技术化了，用户看不懂",
            "外部文档里{old_name}的叫法要统一一下",
            "{old_name}跟业界标准叫法不一致，容易混淆",
            "我觉得{new_name}比{old_name}更准确",
        ],
        "多轮渐进": [
            "{old_name}这个名字你觉得好吗？\n[等回复后] 我想改成{new_name}，影响面大吗？\n[等回复后] 改吧，全仓库零残留",
            "最近在想模块命名的问题\n[等回复后] {old_name}改成{new_name}怎么样\n[等回复后] 确认改，出个方案",
            "梳理一下系统里的命名规范\n[等回复后] {old_name}需要改吗\n[等回复后] 改成{new_name}，全量替换",
        ],
    }
    
    base_chain = [
        {"step": 1, "action": "全仓库扫描{old_name}的所有引用（代码/配置/文档/测试/注释）", "auto": True},
        {"step": 2, "action": "用户确认新名称{new_name}（唯一需要用户参与的命名决策点）", "auto": False, "user_decision": True},
        {"step": 3, "action": "生成影响面分析报告（按文件类型分类：.js/.py/.json/.md/.yaml）", "auto": True},
        {"step": 4, "action": "架构师出重构方案（含改名顺序、依赖关系、回滚策略）", "auto": True},
        {"step": 5, "action": "派独立QA Agent审查方案（检查遗漏引用、循环依赖、破坏性变更）", "auto": True},
        {"step": 6, "action": "凌霄阁+用户最终拍板", "auto": False, "user_decision": True},
        {"step": 7, "action": "开发执行：按依赖顺序批量替换（先底层后上层）", "auto": True},
        {"step": 8, "action": "派独立QA Agent审查diff（检查每个文件的替换正确性）", "auto": True},
        {"step": 9, "action": "验真零残留：grep全仓库确认{old_name}零出现（排除git历史和备份）", "auto": True, "critical": "必须零残留"},
    ]
    
    badcase_templates = [
        "扫描遗漏了某类文件（如.yaml/.env/.sh）",
        "替换时破坏了字符串内部的子串（如把'CRAS'替换后影响了'SCRATCH'）",
        "没有按依赖顺序替换导致中间状态代码不可运行",
        "验真步骤只grep了部分目录",
        "没有排除git历史和备份文件的误报",
        "QA审查被跳过",
        "没有回滚策略",
        "文档更新遗漏",
        "测试用例中的引用没更新",
    ]
    
    pass_criteria = [
        "影响面分析覆盖所有文件类型",
        "替换方案包含依赖顺序",
        "独立QA审查通过（2次：方案审查+diff审查）",
        "用户仅在Step2和Step6参与",
        "grep验真{old_name}零出现",
        "所有测试通过",
        "文档已同步更新",
    ]
    
    required_caps = ["grep全仓库", "依赖分析", "批量替换", "独立QA Agent", "凌霄阁裁决", "零残留验真"]
    
    cases = []
    variants = gen_variants(55)
    
    for i, (tm, sl, ep, up) in enumerate(variants):
        rp = rename_pairs[i % len(rename_pairs)]
        old_name, new_name, desc = rp
        
        trigger_list = trigger_templates.get(tm.split("+")[0], trigger_templates["直接指令"])
        trigger_text = trigger_list[i % len(trigger_list)].format(
            old_name=old_name, new_name=new_name, desc=desc
        )
        
        chain = []
        for step in base_chain:
            s = {**step, "action": step["action"].format(old_name=old_name, new_name=new_name)}
            chain.append(s)
        
        if ep == "超时":
            chain.insert(7, {"step": "7.5", "action": "批量替换超时→按文件分批执行", "auto": True})
        elif ep in ("失败回滚", "级联失败"):
            chain.append({"step": 10, "action": "替换导致测试失败→git checkout回滚→定位问题文件→针对性修复→重新替换", "auto": True})
        elif ep == "部分失败":
            chain.append({"step": 10, "action": "部分文件替换失败（权限/锁定）→记录失败列表→手动修复→验真", "auto": True})
        elif ep == "幂等冲突":
            chain.append({"step": 10, "action": "并发编辑冲突→检测修改时间戳→合并或重试", "auto": True})
        
        if up == "零参与":
            chain = [s for s in chain if not s.get("user_decision")]
        elif up == "多次拍板":
            chain.insert(3, {"step": "3.5", "action": "用户确认影响面可接受", "auto": False, "user_decision": True})
        
        cases.append({
            "id": f"C2-03-{i+1:03d}",
            "category": "全仓库改名/重构",
            "complexity": "C2",
            "variant": make_variant_tag(tm, sl, ep, up),
            "trigger": {
                "mode": tm,
                "text": trigger_text,
                "context": f"{desc}：将{old_name}全局替换为{new_name}"
            },
            "expected_execution_chain": chain,
            "badcase_conditions": badcase_templates[:3] + [
                f"替换范围={sl}时未覆盖完整",
                f"异常路径={ep}时未正确处理",
                f"用户参与模式={up}时流程不符合预期",
            ],
            "pass_criteria": [p.format(old_name=old_name) for p in pass_criteria],
            "required_capabilities": required_caps,
        })
    
    return cases


# ============================================================
# 场景 04：交付质量自检
# ============================================================
def gen_04_delivery_selfcheck():
    task_types = [
        ("写一个新技能处理PDF转换", "技能开发", "skills/pdf-converter/"),
        ("修复IntentScanner的IC4识别准确率", "Bug修复", "infrastructure/intent-scanner/"),
        ("重构事件总线支持优先级队列", "架构重构", "infrastructure/event-bus/"),
        ("给AEO评测Runner加并发控制", "功能增强", "skills/aeo/bin/"),
        ("把调度引擎的超时策略从固定改为递归收敛", "策略优化", "infrastructure/dispatch/"),
        ("写一个cron任务每天凌晨备份配置", "运维任务", "scripts/cron/"),
        ("给飞书报告加一个进度看板", "功能开发", "skills/feishu-report-sender/"),
        ("优化向量检索的召回率", "性能优化", "infrastructure/vector/"),
        ("新增一个Agent角色专门做代码审查", "系统扩展", "openclaw.json"),
        ("给记忆模块加自动清理过期记忆", "功能增强", "skills/elite-longterm-memory/"),
        ("写一个健康检查脚本自动巡检所有Agent", "运维工具", "scripts/"),
        ("重构ISC规则匹配引擎支持正则+语义混合", "核心重构", "infrastructure/isc/"),
        ("给CRAS添加实时对话监控仪表盘", "功能开发", "skills/cras/"),
        ("优化多Agent调度减少key冲突", "调度优化", "infrastructure/dispatch/"),
        ("写一个自动化测试框架跑评测集", "测试基建", "tests/"),
        ("给凌霄阁裁决加投票记录持久化", "功能增强", "skills/council-of-seven/"),
        ("新建一个技能自动生成公众号文章", "技能开发", "skills/article-writer/"),
    ]
    
    trigger_templates = {
        "直接指令": [
            "帮我{task}",
            "{task}，要快",
            "做一下：{task}",
            "开始做{task}",
        ],
        "隐含意图": [
            "{component}最近有个问题需要处理一下",
            "有空的话看看{component}能不能优化",
            "{task_type}方面你有什么建议？可以做了",
            "这个{component}不太行，需要改改",
        ],
        "多轮渐进": [
            "{component}现在什么状态？\n[等回复后] 确实需要{task}\n[等回复后] 那就开始做吧",
            "我在想{task_type}的事\n[等回复后] 具体来说就是{task}\n[等回复后] 开始吧",
            "看一下{component}的代码\n[等回复后] 我想{task}\n[等回复后] 确认，做吧",
        ],
    }
    
    base_chain = [
        {"step": 1, "action": "理解任务需求，明确交付标准", "auto": True},
        {"step": 2, "action": "读取{code_path}相关代码，建立现状认知", "auto": True, "critical": "必须读真实代码"},
        {"step": 3, "action": "制定实现方案（含技术选型、代码结构、测试计划）", "auto": True},
        {"step": 4, "action": "编码实现", "auto": True},
        {"step": 5, "action": "【交付前自检-Step1】功能完整性验证：运行代码确认核心功能正常", "auto": True, "critical": "ISC-DELIVERY-SELF-QA-001"},
        {"step": 6, "action": "【交付前自检-Step2】边界条件测试：空输入/大数据/并发/异常输入", "auto": True},
        {"step": 7, "action": "【交付前自检-Step3】回归检查：确认修改不影响已有功能", "auto": True},
        {"step": 8, "action": "发现问题→根因分析（不直接改症状）", "auto": True, "critical": "必须先根因分析再修复"},
        {"step": 9, "action": "根据根因修复问题→重新自检", "auto": True},
        {"step": 10, "action": "派独立QA Agent做最终审查", "auto": True},
        {"step": 11, "action": "汇报交付物+自检结果+QA结果", "auto": True},
    ]
    
    badcase_templates = [
        "编码完成后直接汇报，跳过自检",
        "自检发现问题后直接改症状不做根因分析",
        "边界条件测试被跳过",
        "回归测试被跳过",
        "没有派独立QA Agent",
        "代码只看了SKILL.md没读真实源码",
        "汇报中没有包含自检结果",
        "测试用例覆盖率不足",
    ]
    
    pass_criteria = [
        "交付前自检3步全部完成",
        "自检发现的问题全部经过根因分析",
        "根因修复后重新自检通过",
        "独立QA Agent审查通过",
        "汇报包含完整的自检报告",
        "代码通过读取真实文件建立认知",
    ]
    
    required_caps = ["代码读写", "自动化测试", "根因分析", "独立QA Agent", "交付自检"]
    
    cases = []
    variants = gen_variants(55)
    
    for i, (tm, sl, ep, up) in enumerate(variants):
        tt = task_types[i % len(task_types)]
        task, task_type, code_path = tt
        component = code_path.rstrip("/").split("/")[-1]
        
        trigger_list = trigger_templates.get(tm.split("+")[0], trigger_templates["直接指令"])
        trigger_text = trigger_list[i % len(trigger_list)].format(
            task=task, task_type=task_type, component=component, code_path=code_path
        )
        
        chain = []
        for step in base_chain:
            s = {**step, "action": step["action"].format(code_path=code_path)}
            chain.append(s)
        
        if ep == "超时":
            chain.insert(4, {"step": "4.5", "action": "编码超时→拆分为子任务分批完成", "auto": True})
        elif ep in ("失败回滚", "级联失败"):
            chain.append({"step": 12, "action": "自检发现严重问题→回滚→重新设计方案→重新实现", "auto": True})
        elif ep == "部分失败":
            chain.append({"step": 12, "action": "部分测试失败→针对性修复→增量自检", "auto": True})
        
        if up == "零参与":
            chain = [s for s in chain if not s.get("user_decision")]
        elif up == "1次确认":
            chain.append({"step": len(chain)+1, "action": "用户确认交付物", "auto": False, "user_decision": True})
        elif up == "多次拍板":
            chain.insert(3, {"step": "3.5", "action": "用户确认实现方案", "auto": False, "user_decision": True})
            chain.append({"step": len(chain)+1, "action": "用户确认最终交付", "auto": False, "user_decision": True})
        
        cases.append({
            "id": f"C2-04-{i+1:03d}",
            "category": "交付质量自检",
            "complexity": "C2",
            "variant": make_variant_tag(tm, sl, ep, up),
            "trigger": {
                "mode": tm,
                "text": trigger_text,
                "context": f"用户要求{task_type}：{task}，系统必须在交付前完成自检闭环"
            },
            "expected_execution_chain": chain,
            "badcase_conditions": badcase_templates[:3] + [
                f"任务类型={task_type}时未做特定类型的自检",
                f"异常路径={ep}时未正确处理",
                f"用户参与模式={up}时流程不符合预期",
            ],
            "pass_criteria": pass_criteria,
            "required_capabilities": required_caps,
        })
    
    return cases


# ============================================================
# 场景 05：言出法随规则创建
# ============================================================
def gen_05_rule_fullchain():
    rule_types = [
        ("所有技能发布前必须通过安全扫描", "skill.publish", "security-scan-gate"),
        ("代码提交前必须有测试覆盖率≥80%", "code.commit", "test-coverage-gate"),
        ("架构变更必须经过凌霄阁审议", "architecture.change", "council-review-gate"),
        ("配置文件修改必须有备份", "config.modify", "config-backup-gate"),
        ("子Agent任务超过30分钟自动告警", "agent.task.timeout", "agent-timeout-alert"),
        ("评测集准确率低于75%自动触发根因分析", "aeo.accuracy.low", "accuracy-rca-trigger"),
        ("每日必须检查API计费余额", "cron.daily", "api-billing-check"),
        ("新增ISC规则必须有对应评测用例", "isc.rule.created", "rule-eval-sync"),
        ("模型切换必须记录切换原因", "model.switch", "model-switch-audit"),
        ("用户纠偏必须转化为长效规则", "user.correction", "correction-to-rule"),
        ("飞书文档发布前必须经过格式检查", "feishu.doc.publish", "doc-format-check"),
        ("定时任务失败必须自动重试3次", "cron.fail", "cron-retry-policy"),
        ("向量库更新必须验证嵌入质量", "vector.update", "embedding-quality-check"),
        ("Agent空跑超过2次自动诊断", "agent.idle", "idle-agent-diagnosis"),
        ("内存使用超过80%自动清理", "system.memory.high", "memory-cleanup"),
        ("日志文件超过100MB自动轮转", "system.log.large", "log-rotation"),
        ("外部API调用失败自动切换备用渠道", "api.call.fail", "api-failover"),
    ]
    
    trigger_templates = {
        "直接指令": [
            "建一个规则：{rule_desc}",
            "新增ISC规则：{rule_desc}",
            "我要一个规则保证{rule_desc}",
            "创建规则{rule_id}：{rule_desc}",
        ],
        "隐含意图": [
            "为什么{event}的时候没有自动{rule_desc}？",
            "上次出了问题就是因为没有{rule_desc}",
            "{rule_desc}这个事情应该自动化吧",
            "每次都要手动{rule_desc}，太低效了",
        ],
        "多轮渐进": [
            "最近{event}出了问题\n[等回复后] 根因是没有自动检查\n[等回复后] 建个规则：{rule_desc}",
            "系统里有没有关于{event}的防护？\n[等回复后] 没有？那建一个\n[等回复后] 规则内容：{rule_desc}",
            "想聊聊{event}的处理流程\n[等回复后] 我觉得需要自动化\n[等回复后] 具体就是{rule_desc}",
        ],
    }
    
    base_chain = [
        {"step": 1, "action": "解析用户意图，确定规则主题和触发条件", "auto": True},
        {"step": 2, "action": "grep全仓库查找{event}相关代码，确定事件源", "auto": True, "critical": "必须找到真实的事件源代码"},
        {"step": 3, "action": "生成ISC规则JSON：isc-rules/{rule_id}.json", "auto": True},
        {"step": 4, "action": "感知层展开：在事件源代码中添加emit({event})探针", "auto": True},
        {"step": 5, "action": "认知层展开：编写事件→规则的匹配/判断逻辑", "auto": True},
        {"step": 6, "action": "执行层展开：编写规则触发后的自动执行动作代码", "auto": True},
        {"step": 7, "action": "注册到意图系统：将规则的触发语注册为可识别意图", "auto": True},
        {"step": 8, "action": "生成C2评测用例并写入AEO评测集", "auto": True},
        {"step": 9, "action": "端到端验真：模拟{event}→捕获→匹配→执行全流程", "auto": True},
        {"step": 10, "action": "派独立QA Agent审查全链路代码", "auto": True},
    ]
    
    badcase_templates = [
        "只写了规则JSON没有展开三层代码",
        "感知层没有添加事件emit探针",
        "认知层匹配逻辑缺失或过于宽泛",
        "执行层动作代码缺失",
        "没有注册到意图系统",
        "没有生成评测用例",
        "端到端验真被跳过",
        "QA审查被跳过",
        "规则JSON格式不符合schema",
    ]
    
    pass_criteria = [
        "ISC规则JSON已创建且符合schema",
        "感知层探针代码已写入",
        "认知层匹配逻辑代码已写入",
        "执行层动作代码已写入",
        "意图注册完成",
        "AEO评测用例已生成",
        "端到端验真通过",
        "独立QA Agent审查通过",
    ]
    
    required_caps = ["grep全仓库", "ISC规则创建", "三层代码展开", "意图注册", "AEO评测用例生成", "端到端验真", "独立QA Agent"]
    
    cases = []
    variants = gen_variants(55)
    
    for i, (tm, sl, ep, up) in enumerate(variants):
        rt = rule_types[i % len(rule_types)]
        rule_desc, event, rule_id = rt
        
        trigger_list = trigger_templates.get(tm.split("+")[0], trigger_templates["直接指令"])
        trigger_text = trigger_list[i % len(trigger_list)].format(
            rule_desc=rule_desc, event=event, rule_id=rule_id
        )
        
        chain = []
        for step in base_chain:
            s = {**step, "action": step["action"].format(event=event, rule_id=rule_id)}
            chain.append(s)
        
        if ep == "超时":
            chain.append({"step": 11, "action": "验真超时→缩小验真范围→重试", "auto": True})
        elif ep in ("失败回滚", "部分失败", "级联失败"):
            chain.append({"step": 11, "action": "验真失败→回滚探针代码→根因分析→修复→重新验真", "auto": True})
        elif ep == "幂等冲突":
            chain.append({"step": 11, "action": "规则ID冲突→自动重命名→重新注册", "auto": True})
        elif ep == "权限不足":
            chain.insert(3, {"step": "3.5", "action": "核心代码文件只读→申请权限或使用临时分支", "auto": True})
        
        if up == "零参与":
            chain = [s for s in chain if not s.get("user_decision")]
        elif up == "1次确认":
            chain.insert(2, {"step": "2.5", "action": "用户确认规则方向", "auto": False, "user_decision": True})
        elif up == "多次拍板":
            chain.insert(2, {"step": "2.5", "action": "用户确认规则方向", "auto": False, "user_decision": True})
            chain.append({"step": len(chain)+1, "action": "用户确认规则上线", "auto": False, "user_decision": True})
        
        cases.append({
            "id": f"C2-05-{i+1:03d}",
            "category": "言出法随规则创建",
            "complexity": "C2",
            "variant": make_variant_tag(tm, sl, ep, up),
            "trigger": {
                "mode": tm,
                "text": trigger_text,
                "context": f"用户要求创建规则「{rule_desc}」，期望全链路自动展开（JSON→探针→匹配→执行→验真）"
            },
            "expected_execution_chain": chain,
            "badcase_conditions": badcase_templates[:3] + [
                f"事件源={event}但探针未正确绑定",
                f"异常路径={ep}时未正确处理",
                f"用户参与模式={up}时流程不符合预期",
            ],
            "pass_criteria": pass_criteria,
            "required_capabilities": required_caps,
        })
    
    return cases


# ============================================================
# 场景 06：未知意图发现
# ============================================================
def gen_06_unknown_intent():
    unknown_intents = [
        ("帮我做个竞品分析", "competitive.analysis", "竞品分析类"),
        ("这个API的性能报告呢", "performance.report.request", "性能报告类"),
        ("能不能帮我写个PPT大纲", "presentation.outline", "演示文稿类"),
        ("给我推荐几篇相关论文", "paper.recommendation", "学术推荐类"),
        ("帮我review一下这段代码", "code.review.request", "代码审查类"),
        ("系统的安全审计做了吗", "security.audit.request", "安全审计类"),
        ("帮我画一个系统架构图", "diagram.generation", "图表生成类"),
        ("这个功能什么时候能上线", "release.timeline.query", "发布排期类"),
        ("帮我估算一下这个需求的工作量", "effort.estimation", "工作量估算类"),
        ("给我列一下最近的技术债", "tech.debt.inventory", "技术债盘点类"),
        ("帮我写个迁移脚本", "migration.script", "数据迁移类"),
        ("能不能监控一下CPU使用率", "system.monitoring", "系统监控类"),
        ("帮我整理一下会议纪要", "meeting.summary", "会议记录类"),
        ("这个bug的影响范围有多大", "bug.impact.analysis", "缺陷影响分析类"),
        ("帮我做个A/B测试方案", "ab.test.design", "实验设计类"),
        ("系统的可用性报告呢", "availability.report", "可用性报告类"),
        ("帮我规划一下Q2的技术路线", "tech.roadmap.planning", "技术规划类"),
    ]
    
    trigger_templates = {
        "直接指令": [
            "{intent_text}",
            "{intent_text}，急",
            "{intent_text}，今天要",
            "来，{intent_text}",
        ],
        "隐含意图": [
            "我在想{intent_category}的事情",
            "有没有办法做{intent_category}",
            "{intent_category}这块你能处理吗",
            "关于{intent_category}你有什么想法",
        ],
        "多轮渐进": [
            "你能做哪些事？\n[等回复后] 那{intent_text}呢？\n[等回复后] 试试吧",
            "我有个需求\n[等回复后] {intent_text}\n[等回复后] 对，就是这个",
            "系统现在支持{intent_category}吗？\n[等回复后] 不支持的话能加上吗\n[等回复后] 那先{intent_text}",
        ],
    }
    
    base_chain = [
        {"step": 1, "action": "接收用户输入，IntentScanner尝试匹配已知意图", "auto": True},
        {"step": 2, "action": "匹配失败（confidence<0.5）→标记为unknown_intent", "auto": True},
        {"step": 3, "action": "15秒内：将未知意图纳入候选集（unknown-intent-candidates.json）", "auto": True, "critical": "15秒SLA"},
        {"step": 4, "action": "语义分析：使用LLM推理用户真实意图（{intent_id}）", "auto": True},
        {"step": 5, "action": "MECE校验：检查新意图是否与已有意图重叠", "auto": True, "critical": "防止意图熵增"},
        {"step": 6, "action": "自动生成意图定义（id/description/examples/confidence_threshold）", "auto": True},
        {"step": 7, "action": "注册到IntentScanner的意图库", "auto": True},
        {"step": 8, "action": "绑定执行链：确定新意图对应的技能/动作", "auto": True},
        {"step": 9, "action": "生成≥3条评测用例覆盖新意图", "auto": True},
        {"step": 10, "action": "端到端验真：重新发送原始输入，确认能正确识别", "auto": True},
        {"step": 11, "action": "执行原始请求：按新绑定的执行链完成用户任务", "auto": True},
    ]
    
    badcase_templates = [
        "未知意图未在15秒内纳入候选集",
        "直接说'不支持'而非尝试理解和纳入",
        "新意图与已有意图MECE冲突未检测",
        "意图注册后没有绑定执行链",
        "没有生成评测用例",
        "端到端验真被跳过",
        "原始请求最终未被执行",
        "意图定义缺少examples字段",
    ]
    
    pass_criteria = [
        "未知意图15秒内纳入候选集",
        "LLM语义分析正确识别意图",
        "MECE校验通过（无重叠）",
        "意图注册到IntentScanner",
        "执行链绑定完成",
        "评测用例≥3条",
        "端到端验真通过",
        "原始请求成功执行",
    ]
    
    required_caps = ["IntentScanner", "LLM语义推理", "MECE校验", "意图注册", "评测用例生成", "端到端验真"]
    
    cases = []
    variants = gen_variants(55)
    
    for i, (tm, sl, ep, up) in enumerate(variants):
        ui = unknown_intents[i % len(unknown_intents)]
        intent_text, intent_id, intent_category = ui
        
        trigger_list = trigger_templates.get(tm.split("+")[0], trigger_templates["直接指令"])
        trigger_text = trigger_list[i % len(trigger_list)].format(
            intent_text=intent_text, intent_id=intent_id, intent_category=intent_category
        )
        
        chain = []
        for step in base_chain:
            s = {**step, "action": step["action"].format(intent_id=intent_id)}
            chain.append(s)
        
        if ep == "超时":
            chain.insert(4, {"step": "4.5", "action": "LLM推理超时→降级为关键词匹配→异步LLM补充", "auto": True})
        elif ep in ("失败回滚",):
            chain.append({"step": 12, "action": "注册失败→回滚→检查意图库schema→修复→重新注册", "auto": True})
        elif ep == "部分失败":
            chain.append({"step": 12, "action": "部分评测用例失败→调整意图定义→重新验真", "auto": True})
        elif ep == "级联失败":
            chain.append({"step": 12, "action": "新意图与已有意图冲突→重新定义边界→MECE重校验", "auto": True})
        
        if up == "1次确认":
            chain.insert(6, {"step": "6.5", "action": "用户确认新意图定义是否合理", "auto": False, "user_decision": True})
        elif up == "多次拍板":
            chain.insert(5, {"step": "5.5", "action": "用户确认意图分类方向", "auto": False, "user_decision": True})
            chain.insert(8, {"step": "7.5", "action": "用户确认执行链绑定", "auto": False, "user_decision": True})
        
        cases.append({
            "id": f"C2-06-{i+1:03d}",
            "category": "未知意图发现",
            "complexity": "C2",
            "variant": make_variant_tag(tm, sl, ep, up),
            "trigger": {
                "mode": tm,
                "text": trigger_text,
                "context": f"系统从未见过的意图「{intent_category}」，期望15秒内自动纳入并完成全链路注册"
            },
            "expected_execution_chain": chain,
            "badcase_conditions": badcase_templates[:3] + [
                f"意图类别={intent_category}但识别结果错误",
                f"异常路径={ep}时未正确处理",
                f"用户参与模式={up}时流程不符合预期",
            ],
            "pass_criteria": pass_criteria,
            "required_capabilities": required_