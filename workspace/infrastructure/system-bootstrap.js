/**
 * system-bootstrap.js — 系统自举引导
 * 
 * 【设计哲学】
 * 这个文件是整个系统最可靠的"记忆"。
 * 当所有MD文件丢失、会话历史清空时，读这个文件就能理解系统全貌。
 * 
 * 【系统是什么】
 * 这是一个全局自主决策流水线（Global Autonomous Decision Pipeline）。
 * 不是工具集合，不是聊天机器人，是一个自主进化系统。
 * 大部分决策由系统自己判断和执行，只有重大/不确定的才上报用户。
 * 
 * 【架构 - 四层闭环】
 * 
 *   感知层 ──事件──→ 认知层 ──决策──→ 执行层 ──结果──→ 反馈层 ──进化──→ 感知层
 *   (CRAS)           (ISC)            (DTO+技能)         (AEO+经验沉淀)
 * 
 * 感知层：CRAS意图捕获、git hook、事件总线、扫描器
 *   - 快通道：5min增量扫描，提取原子意图事件
 *   - 慢通道：daily聚合，计算趋势
 * 
 * 认知层：ISC规则匹配 + 意图识别 + 凌霄阁裁决
 *   - ISC = 智能标准中心，规则是一等公民
 *   - 凌霄阁 = 7席裁决（道/战/工/盾/眼/远/衡），重大决策用
 *   - 用户是最终裁决者
 * 
 * 执行层：DTO调度 + 技能执行 + 并行子Agent
 *   - DTO = 声明式任务编排引擎
 *   - 技能 = 最小可执行单元
 * 
 * 反馈层：AEO质量门禁 + 经验沉淀 + 规则进化
 *   - AEO = 效果运营，黄金评测集 + Badcase根因分析
 *   - 经验→规则→代码，闭环进化
 * 
 * 【核心原则 - 用户亲授】
 * 
 * 1. 反熵增原则：一切设计必须批判性思维、可扩展、可泛化、可生长
 *    违反此原则的设计必须被拦截。
 * 
 * 2. 规则是核心抓手：规则可以向上下游展开成代码，
 *    从而固化成可稳定复现的流程。规则价值 > 代码存在性。
 * 
 * 3. 代码是最可靠的记忆：MD文档会丢失，代码不会。
 *    关键认知必须固化在代码逻辑和注释中。
 * 
 * 4. 分层解耦：感知/认知/执行三层通过事件总线解耦，
 *    任何一层替换不影响其他两层。
 * 
 * 5. 数据诚实性：100%真实，零误报容忍，不允许合成数据验收。
 * 
 * 6. 事件思维：状态变化 = 事件。五层事件模型：
 *    L1对象生命周期、L2量化阈值、L3语义意图、L4知识发现、L5系统模式
 * 
 * 【关键路径】
 * 
 * /root/.openclaw/workspace/                    # 工作空间根目录
 * ├── SOUL.md                                   # 身份与行为准则
 * ├── USER.md                                   # 用户画像（长煦/于长煦）
 * ├── MEMORY.md                                 # 长期记忆索引（可丢失，从代码重建）
 * ├── CAPABILITY-ANCHOR.md                      # 能力锚点（自动生成）
 * ├── infrastructure/
 * │   ├── event-bus/                            # 事件总线（感知层核心）
 * │   │   ├── bus.js                            # 事件发布/订阅
 * │   │   └── handlers/                         # 事件处理器（规则的代码展开）
 * │   ├── vector-service/                       # 向量化服务（智谱embedding）
 * │   └── feedback/                             # 反馈收集
 * ├── skills/
 * │   ├── isc-core/                             # ISC智能标准中心
 * │   │   ├── rules/                            # 规则库（102条JSON）
 * │   │   └── index.js                          # 规则引擎
 * │   ├── dto-core/                             # DTO任务编排
 * │   ├── cras/                                 # CRAS认知进化（感知层）
 * │   ├── aeo/                                  # AEO效果运营（反馈层）
 * │   ├── lep-executor/                         # LEP韧性执行
 * │   ├── lingxiaoge-tribunal/                  # 凌霄阁裁决
 * │   ├── project-mgmt/                         # 项目管理（含经验沉淀）
 * │   ├── isc-capability-anchor-sync/           # 能力锚点同步器
 * │   ├── tavily-search/                        # 搜索（首选，非web_search）
 * │   └── ...                                   # 其他技能（53个）
 * └── scripts/                                  # 运维脚本
 * 
 * 【自举流程】
 * 当会话启动且记忆丢失时：
 * 1. 读取本文件 → 理解系统全貌
 * 2. 运行 startup-self-check.sh → 检查关键文件
 * 3. 读取 CAPABILITY-ANCHOR.md → 了解可用能力
 * 4. 扫描 skills/isc-core/rules/ → 加载规则库
 * 5. 从 git log 恢复近期工作上下文
 * 
 * 【用户信息】
 * 姓名：长煦（于长煦）
 * 称呼我为：焰崽
 * 角色：AI产品共创合伙人
 * 风格：直接、行动导向、厌恶虚假数据、三轮迭代制
 * 
 * 【我是谁】
 * 名称：战略家 / 焰崽
 * 角色：产品与技术的战略决策者 + 任务编排与交付中枢
 * 目标：成为全球最强AI，断层式领先
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/root/.openclaw/workspace';
const CRITICAL_PATHS = {
  soul: path.join(WORKSPACE, 'SOUL.md'),
  user: path.join(WORKSPACE, 'USER.md'),
  memory: path.join(WORKSPACE, 'MEMORY.md'),
  anchor: path.join(WORKSPACE, 'CAPABILITY-ANCHOR.md'),
  agents: path.join(WORKSPACE, 'AGENTS.md'),
  rules: path.join(WORKSPACE, 'skills/isc-core/rules'),
  eventBus: path.join(WORKSPACE, 'infrastructure/event-bus'),
  bootstrap: __filename
};

/**
 * 系统自举检查
 * 验证关键组件存在性，尝试恢复缺失文件
 */
function bootstrap() {
  const status = {
    timestamp: new Date().toISOString(),
    healthy: true,
    components: {},
    recoveryAttempted: false
  };

  // 检查关键文件
  for (const [name, filepath] of Object.entries(CRITICAL_PATHS)) {
    const exists = fs.existsSync(filepath);
    status.components[name] = { exists, path: filepath };
    if (!exists) {
      status.healthy = false;
      console.error(`❌ 关键组件缺失: ${name} (${filepath})`);
    }
  }

  // 统计规则库
  if (fs.existsSync(CRITICAL_PATHS.rules)) {
    const rules = fs.readdirSync(CRITICAL_PATHS.rules)
      .filter(f => f.endsWith('.json'));
    status.components.ruleCount = rules.length;
    console.log(`📋 ISC规则库: ${rules.length} 条`);
  }

  // 统计event handler
  const handlerDir = path.join(CRITICAL_PATHS.eventBus, 'handlers');
  if (fs.existsSync(handlerDir)) {
    const handlers = fs.readdirSync(handlerDir)
      .filter(f => f.endsWith('.js'));
    status.components.handlerCount = handlers.length;
    status.components.codeCoverage = 
      `${handlers.length}/${status.components.ruleCount || '?'} (${
        status.components.ruleCount 
          ? Math.round(handlers.length / status.components.ruleCount * 100) 
          : '?'
      }%)`;
    console.log(`⚙️  代码覆盖: ${status.components.codeCoverage}`);
  }

  // 尝试Git恢复
  if (!status.healthy) {
    console.log('🔄 尝试从Git恢复...');
    status.recoveryAttempted = true;
    try {
      require('child_process').execSync(
        'cd /root/.openclaw/workspace && git checkout HEAD -- SOUL.md USER.md MEMORY.md CAPABILITY-ANCHOR.md AGENTS.md 2>/dev/null',
        { stdio: 'pipe' }
      );
      console.log('✅ Git恢复完成');
    } catch (e) {
      console.error('❌ Git恢复失败');
    }
  }

  return status;
}

/**
 * 从代码中重建系统认知
 * 即使所有MD丢失，也能从代码注释和结构中理解系统
 */
function rebuildKnowledgeFromCode() {
  const knowledge = {
    systemType: '全局自主决策流水线 (Global Autonomous Decision Pipeline)',
    architecture: '感知→认知→执行→反馈 四层闭环',
    principles: [
      '反熵增：批判性思维、可扩展、可泛化、可生长',
      '规则是核心抓手：规则→代码，固化流程',
      '代码是最可靠记忆：MD会丢，代码不会',
      '分层解耦：感知/认知/执行通过事件总线解耦',
      '数据诚实性：100%真实，零误报'
    ],
    user: { name: '长煦', callMeAs: '焰崽', role: 'AI产品共创合伙人' },
    identity: { name: '战略家/焰崽', role: '战略决策者+任务编排中枢' }
  };

  // 从规则JSON中提取系统知识
  if (fs.existsSync(CRITICAL_PATHS.rules)) {
    const rules = fs.readdirSync(CRITICAL_PATHS.rules)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(CRITICAL_PATHS.rules, f), 'utf8'));
          return { id: d.id || d.rule_id, name: d.name, desc: (d.description || '').slice(0, 80) };
        } catch { return null; }
      })
      .filter(Boolean);
    knowledge.rulesSummary = rules;
  }

  return knowledge;
}

if (require.main === module) {
  console.log('🚀 系统自举引导启动...\n');
  const status = bootstrap();
  console.log('\n' + (status.healthy ? '✅ 系统健康' : '⚠️ 需要修复'));
  
  if (!status.healthy) {
    console.log('\n📖 从代码重建系统认知...');
    const knowledge = rebuildKnowledgeFromCode();
    console.log(JSON.stringify(knowledge, null, 2));
  }
}

module.exports = { bootstrap, rebuildKnowledgeFromCode, CRITICAL_PATHS };
