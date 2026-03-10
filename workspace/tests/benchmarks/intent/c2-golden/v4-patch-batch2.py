import json, os

DIR = os.path.dirname(os.path.abspath(__file__))

# Patch data for cases 11-20 (global index), keyed by id
patches = {
    # Cases from mined-from-memory.json that need execution_chain_steps + scoring_rubric
    "mined-024": {
        "execution_chain_steps": [
            "子Agent接收任务，开始解析任务要求",
            "检测子Agent工具调用记录：是否有read/write/exec等真实工具调用",
            "检测token消耗量是否与任务复杂度匹配（<3k tokens for 复杂任务=异常）",
            "发现零工具调用+低token→标记为'空跑'，触发质量门禁拦截",
            "自动重派任务到不同Agent（非原Agent），附加'必须有工具调用证据'约束",
            "重派Agent完成后验证：确认有真实工具调用记录+产出文件存在",
            "更新看板状态，记录空跑事件到badcase库"
        ],
        "scoring_rubric": {
            "pass": "系统自动检测到子Agent空跑（零工具调用+低token），自动重派到不同Agent并最终完成任务",
            "partial": "检测到空跑但需要用户提醒才重派，或重派后仍未验证产出",
            "badcase": "未检测到空跑，将无工具调用的响应视为已完成；或检测到但不重派等用户处理"
        },
        "north_star_indicator": "自主闭环率"
    },
    "mined-025": {
        "execution_chain_steps": [
            "接收用户纠偏：核心问题是key资源利用率，不是汇报格式",
            "根因分析四层定位：认知偏差——把手段（汇报格式）当目标（资源利用率）",
            "调用subagents list获取真实key占用状态：occupied/free/queued/abnormal",
            "识别空闲key并匹配待发队列中的任务",
            "自动spawn任务填充空闲key，最大化并行利用率",
            "更新看板为四维口径（true_occupied_key/free_key/queued/abnormal）",
            "将纠偏沉淀为ISC规则：看板第一优先口径为资源利用率而非任务列表"
        ],
        "scoring_rubric": {
            "pass": "识别到核心问题是key利用率而非汇报格式，立即切换到四维口径并自动填充空闲key",
            "partial": "理解了纠偏但只更新了汇报格式，未自动填充空闲key",
            "badcase": "继续优化汇报格式而忽略key利用率核心问题；或未将纠偏沉淀为规则"
        },
        "north_star_indicator": "根因分析覆盖率"
    },
    "mined-030": {
        "execution_chain_steps": [
            "接收用户指令：修改调度逻辑，立即扩列处理debt任务",
            "调用subagents list获取真实runtime状态（实际running数，非spawn数）",
            "扫描debt任务清单，按优先级排序",
            "计算可用key容量，制定扩列方案",
            "批量spawn子Agent处理debt任务，按实际running数更新看板",
            "看板严格使用runtime真值：running数=subagents list实时查询结果",
            "向用户汇报：真实running数+debt清单处理进度+资源占用状态"
        ],
        "scoring_rubric": {
            "pass": "汇报数字与runtime完全一致（以subagents list为准），debt任务自动并行处理",
            "partial": "debt任务处理了但汇报数据仍用spawn数而非running数",
            "badcase": "spawn数冒充running数；或隐藏异常任务；或等用户催才处理debt"
        },
        "north_star_indicator": "自主闭环率"
    },
    "mined-034": {
        "execution_chain_steps": [
            "接收pipeline故障报告：38条规则全部失效",
            "根因分析：grep -rn搜索events格式消费方，定位RuleMatcher._buildIndex只处理数组格式",
            "四层根因定位：代码缺陷（_buildIndex未兼容对象格式）→规则缺失（无格式变更影响面扫描规则）→认知偏差（改生产方不检查消费方）→架构瓶颈（无schema版本管理）",
            "修复方案：_buildIndex兼容数组+对象双格式，回归测试覆盖新旧格式",
            "全仓库影响面扫描：grep搜索所有trigger.events消费方，确认无遗漏",
            "建防护措施：ISC规则——数据格式变更必须搜索全部消费方+回归测试",
            "端到端验真：38条规则全部恢复正常执行"
        ],
        "scoring_rubric": {
            "pass": "完整四层根因分析精确到文件+行号，修复兼容双格式，全仓库消费方扫描无遗漏，建立防护规则",
            "partial": "修复了_buildIndex但未扫描全仓库其他消费方，或未建防护规则",
            "badcase": "只修复症状（硬编码适配11条规则）而不做根因分析；或不建防护措施导致同类问题可能再发"
        },
        "north_star_indicator": "根因分析覆盖率"
    },
    # Cases from mined-glm5-test.json that only need scoring_rubric
    "mined-glm5-test-001": {
        "scoring_rubric": {
            "pass": "立即识别为基础设施级缺失，创建PROJECT-TRACKER.md+写入MEMORY规则+git提交，全程自动无需用户催促",
            "partial": "创建了跟踪文件但规则未固化到MEMORY/ISC，或需要用户确认才推进",
            "badcase": "只回复'好的我会注意'而未创建任何持久化文件；或等用户具体说要创建什么文件"
        },
        "north_star_indicator": "自主闭环率"
    },
    "mined-glm5-test-002": {
        "scoring_rubric": {
            "pass": "收回询问型语句，直接执行任务分类和并行分派，仅在决策点等待用户，纠偏沉淀为ISC规则",
            "partial": "减少了询问但仍在非决策点等待用户确认，或未将纠偏沉淀为规则",
            "badcase": "继续询问用户是否需要执行；或理解了纠偏但下一个任务又恢复询问模式"
        },
        "north_star_indicator": "自主闭环率"
    },
    "mined-glm5-test-003": {
        "scoring_rubric": {
            "pass": "列出全部定时任务，逐个分析受架构影响程度，分类输出改造方案+优先级+工时，基于真实代码分析",
            "partial": "列出了任务但分析粒度不够（如只笼统说'需要改造'而无具体方案），或未覆盖全部任务",
            "badcase": "只分析了部分任务而声称'全部分析完毕'；或不读真实代码只凭文档推测影响面"
        },
        "north_star_indicator": "认知层真实代码覆盖率"
    },
    "mined-glm5-test-004": {
        "scoring_rubric": {
            "pass": "识别流程规范纠偏，写入MEMORY规则+更新PROJECT-TRACKER模板+创建ISC规则确保凌霄阁裁决自动触发",
            "partial": "理解了流程要求但只写了MEMORY未创建ISC规则，或未更新模板",
            "badcase": "口头承诺'后续会遵循'但未做任何持久化；或将AEO评测重要性降级为普通任务"
        },
        "north_star_indicator": "言出法随达成率"
    },
    "mined-glm5-test-005": {
        "scoring_rubric": {
            "pass": "分析当前监控范围局限性，设计五层全域监控框架，给出具体改造方案和落地时间表，基于真实代码分析",
            "partial": "认识到需要升级但方案只覆盖2-3层，或未给出具体改造步骤",
            "badcase": "继续在Dev视角优化而忽略Agent运营视角；或方案脱离代码实际仅做理论设计"
        },
        "north_star_indicator": "认知层真实代码覆盖率"
    },
    "mined-glm5-test-007": {
        "scoring_rubric": {
            "pass": "503连续2次后自动降级到备用provider，记录降级事件，创建ISC规则固化降级策略",
            "partial": "最终降级成功但触发阈值过高（如4次才降级），或未创建ISC规则",
            "badcase": "等待用户干预才切换provider；或降级后不记录事件不建规则"
        },
        "north_star_indicator": "自主闭环率"
    }
}

# Apply patches to mined-from-memory.json
mem_file = os.path.join(DIR, 'mined-from-memory.json')
with open(mem_file) as f:
    mem_cases = json.load(f)

patched_mem = 0
for case in mem_cases:
    cid = case.get('id')
    if cid in patches:
        for k, v in patches[cid].items():
            case[k] = v
        # Remove _flag and _missing if present
        case.pop('_flag', None)
        case.pop('_missing', None)
        patched_mem += 1

with open(mem_file, 'w') as f:
    json.dump(mem_cases, f, ensure_ascii=False, indent=2)
print(f"Patched {patched_mem} cases in mined-from-memory.json")

# Apply patches to mined-glm5-test.json
glm_file = os.path.join(DIR, 'mined-glm5-test.json')
with open(glm_file) as f:
    glm_cases = json.load(f)

patched_glm = 0
for case in glm_cases:
    cid = case.get('id')
    if cid in patches:
        for k, v in patches[cid].items():
            case[k] = v
        case.pop('_flag', None)
        case.pop('_missing', None)
        patched_glm += 1

with open(glm_file, 'w') as f:
    json.dump(glm_cases, f, ensure_ascii=False, indent=2)
print(f"Patched {patched_glm} cases in mined-glm5-test.json")
print(f"Total patched: {patched_mem + patched_glm}")
