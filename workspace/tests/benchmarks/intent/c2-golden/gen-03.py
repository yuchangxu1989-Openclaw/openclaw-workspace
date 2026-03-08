#!/usr/bin/env python3
import json

cases = [
    {
        "id": "global-rename-001",
        "trigger": "把技能名 weather 全局改为 climate，所有引用都要同步更新",
        "chain": [
            "1. 解析改名目标：技能目录名 skills/weather → skills/climate",
            "2. 全仓库 grep 扫描所有引用 weather 的位置（代码/配置/文档/测试）",
            "3. 分类引用：目录路径、import/require、字符串常量、事件名、文档",
            "4. 重命名技能目录 skills/weather → skills/climate",
            "5. 批量替换代码中 import/require 路径",
            "6. 更新配置文件中的技能注册名",
            "7. 更新事件前缀 weather:* → climate:*",
            "8. 更新文档和注释中的技能名引用",
            "9. 运行全量测试验证无断链、无残留、无回归"
        ],
        "bad": ["未扫描测试目录导致测试用例中残留旧名", "仅替换目录名未更新内部 require 路径", "遗漏事件前缀导致事件监听断链", "误替换了不相关的 weather 单词"],
        "pass": ["全仓库 grep weather 仅剩语义无关条目", "所有测试通过", "事件订阅和发布链路验证通畅", "技能可正常加载和调用"],
        "caps": ["全局搜索", "目录重命名", "批量替换", "事件链路分析", "测试执行"]
    },
    {
        "id": "global-rename-002",
        "trigger": "将模块名 message-router 改为 msg-dispatcher，影响约20个文件",
        "chain": [
            "1. 识别模块边界：message-router 目录、导出接口、依赖该模块的所有消费方",
            "2. 全仓库扫描 message-router 的所有引用",
            "3. 生成影响清单并按文件类型分组（源码/配置/文档/测试）",
            "4. 重命名模块目录及 package.json 中的 name 字段",
            "5. 更新所有 import/require 语句中的模块路径",
            "6. 更新 monorepo workspace 配置（如 pnpm-workspace.yaml）",
            "7. 更新 CI/CD 配置中的构建路径和依赖声明",
            "8. 更新所有文档中对该模块的引用",
            "9. 执行 lint + 构建 + 测试三件套验证改名完整性"
        ],
        "bad": ["未更新 monorepo workspace 配置导致依赖解析失败", "package.json 的 name 字段未同步更新", "CI/CD 中硬编码路径未修改导致构建失败", "lock 文件未重新生成"],
        "pass": ["pnpm install 无报错", "全量构建通过", "全量测试通过", "grep message-router 仅剩 CHANGELOG"],
        "caps": ["monorepo管理", "依赖分析", "批量替换", "CI/CD配置更新", "构建验证"]
    },
    {
        "id": "global-rename-003",
        "trigger": "把事件前缀 user: 全部改为 account:，涉及事件订阅和发布的全链路",
        "chain": [
            "1. 扫描所有事件发布点中以 user: 开头的事件名",
            "2. 扫描所有事件订阅点中以 user: 开头的事件名",
            "3. 建立事件发布-订阅映射表",
            "4. 检查动态拼接事件名的场景",
            "5. 批量替换静态事件名 user:* → account:*",
            "6. 更新动态拼接处的前缀变量或常量",
            "7. 更新 TypeScript 类型定义和枚举",
            "8. 更新事件文档和 API 文档中的事件名引用",
            "9. 运行事件集成测试验证所有发布-订阅链路正常"
        ],
        "bad": ["遗漏动态拼接的事件名导致运行时事件断链", "仅改了发布端未改订阅端", "TypeScript 类型定义未更新导致编译错误", "误替换了非事件名的 user: 字符串"],
        "pass": ["事件发布-订阅对账完整", "集成测试中所有事件流转正常", "TypeScript 编译无错误", "grep 'user:' 在事件上下文中无残留"],
        "caps": ["事件链路分析", "正则匹配", "动态代码分析", "类型系统更新", "集成测试"]
    },
    {
        "id": "global-rename-004",
        "trigger": "把全局变量名 MAX_RETRY_COUNT 改为 MAX_ATTEMPTS，散布在约200个文件中",
        "chain": [
            "1. 全仓库 grep MAX_RETRY_COUNT 定位所有出现位置",
            "2. 区分变量定义位置和引用位置",
            "3. 检查环境变量和配置文件中的使用",
            "4. 检查 Docker/K8s 配置中的引用",
            "5. 批量替换源码中的变量名",
            "6. 更新环境变量名（.env/.env.example/docker-compose.yml）",
            "7. 更新文档中对该变量的说明",
            "8. 更新测试用例中对该变量的断言和 mock",
            "9. 运行全量测试 + 环境变量校验脚本确认无遗漏"
        ],
        "bad": ["未更新 .env.example 导致新环境部署时变量缺失", "Docker/K8s 配置中残留旧变量名", "测试 mock 中残留旧名导致假绿", "部分文件被 .gitignore 忽略未扫描到"],
        "pass": ["grep MAX_RETRY_COUNT 全仓库零命中", "所有环境配置文件已同步更新", "全量测试通过", "应用启动时配置项可正常读取"],
        "caps": ["全局搜索", "环境变量管理", "容器配置更新", "批量替换", "启动验证"]
    },
    {
        "id": "global-rename-005",
        "trigger": "将 API 路径 /api/v2/users 全局改为 /api/v2/members，保持向后兼容",
        "chain": [
            "1. 扫描所有路由定义中 /api/v2/users 的注册点",
            "2. 扫描前端/客户端代码中对该路径的请求调用",
            "3. 扫描测试用例中对该路径的 mock 和断言",
            "4. 添加新路由 /api/v2/members 指向相同 handler",
            "5. 在旧路由上添加 deprecation 标记和重定向",
            "6. 更新前端/客户端代码使用新路径",
            "7. 更新 OpenAPI/Swagger 文档中的路径定义",
            "8. 更新测试用例，保留旧路径兼容性测试",
            "9. 运行 API 集成测试验证新旧路径均可正常工作"
        ],
        "bad": ["直接删除旧路由导致已发布客户端断裂", "OpenAPI 文档未更新", "未添加 deprecation 警告", "重定向逻辑丢失 POST/PUT 请求 body"],
        "pass": ["新路径全部 HTTP 方法正常", "旧路径返回 301 或带 deprecation header", "OpenAPI 文档已更新", "API 集成测试全部通过"],
        "caps": ["路由分析", "向后兼容设计", "API文档更新", "重定向配置", "集成测试"]
    },
    {
        "id": "global-rename-006",
        "trigger": "将技能名 tts-engine 改为 voice-synthesis，涉及技能注册、事件绑定和配置引用",
        "chain": [
            "1. 定位技能目录 skills/tts-engine 及 manifest.json",
            "2. 全仓库扫描 tts-engine 的所有引用位置",
            "3. 重命名目录 skills/tts-engine → skills/voice-synthesis",
            "4. 更新 manifest.json 中的 name 和 id 字段",
            "5. 更新技能注册表/加载器中的技能标识",
            "6. 更新事件名 tts-engine:* → voice-synthesis:*",
            "7. 更新配置文件中的技能引用",
            "8. 更新 SKILL.md 和其他文档中的技能名",
            "9. 运行技能加载测试和事件链路测试"
        ],
        "bad": ["manifest.json 中 id 未更新导致技能加载失败", "事件前缀未同步导致语音合成功能失效", "配置文件中残留旧名", "其他技能依赖的 require 路径未更新"],
        "pass": ["技能正常加载并通过健康检查", "事件链路全部通畅", "grep tts-engine 仅剩 CHANGELOG", "所有依赖该技能的功能正常"],
        "caps": ["技能系统理解", "目录重命名", "事件链路更新", "配置更新", "功能测试"]
    },
    {
        "id": "global-rename-007",
        "trigger": "将模块名 db-connector 改为 data-access-layer，这是一次架构语义升级",
        "chain": [
            "1. 分析 db-connector 的职责边界和对外 API",
            "2. 全仓库扫描所有 import/require('db-connector') 的位置",
            "3. 检查该模块是否在 npm registry 发布过",
            "4. 重命名目录并更新 package.json 中的 name",
            "5. 更新所有消费方的 import 路径",
            "6. 更新导出的类名/函数名以匹配新语义（DbConnector → DataAccessLayer）",
            "7. 更新所有消费方使用新的类名/函数名",
            "8. 更新 README 和架构文档",
            "9. 执行全量构建 + 测试 + 类型检查验证"
        ],
        "bad": ["仅改了目录名未更新导出类名，语义不一致", "npm publish 时包名冲突", "消费方 destructure 的旧类名未更新", "架构文档中模块关系图未同步"],
        "pass": ["目录名、包名、类名、函数名语义一致", "TypeScript 编译零错误", "全量测试通过", "架构文档准确"],
        "caps": ["语义分析", "包管理", "类型重构", "架构文档更新", "全量验证"]
    },
    {
        "id": "global-rename-008",
        "trigger": "把事件前缀 task: 改为 job:，影响3个微服务间的事件通信",
        "chain": [
            "1. 扫描所有微服务中 task: 前缀的事件定义",
            "2. 建立跨服务事件拓扑图",
            "3. 评估是否需要灰度发布",
            "4. 在消息队列层定义新的 topic/queue（job:*）",
            "5. 更新各服务的事件发布代码",
            "6. 更新各服务的事件订阅代码",
            "7. 添加临时的事件转发层 task:* → job:*",
            "8. 更新所有服务的集成测试和契约测试",
            "9. 部署并验证跨服务事件流转正常后移除转发层"
        ],
        "bad": ["未灰度直接切换导致消息丢失", "跨仓库未同步更新", "消息队列中残留旧 topic 消息", "转发层未移除成为永久技术债"],
        "pass": ["所有服务使用 job: 前缀", "跨服务集成测试通过", "消息队列无 task: 残留", "转发层已清理"],
        "caps": ["跨服务分析", "事件拓扑", "灰度策略", "消息队列管理", "契约测试"]
    },
    {
        "id": "global-rename-009",
        "trigger": "将变量名 isEnabled 全局改为 isActive，涉及组件 props、store state 和 API 响应",
        "chain": [
            "1. 全仓库扫描 isEnabled 的所有出现位置并分类",
            "2. 识别 API 响应中的 isEnabled 字段",
            "3. 识别前端组件 props 中的 isEnabled",
            "4. 识别 store/state 中的 isEnabled",
            "5. 更新后端 API 响应字段名并保留旧字段兼容",
            "6. 更新前端组件 props 定义和传递",
            "7. 更新 store 中的 state 字段和 selector",
            "8. 更新所有测试中的断言和 mock 数据",
            "9. 端到端测试验证 API → store → 组件数据流正常"
        ],
        "bad": ["API 响应直接移除旧字段导致旧版客户端崩溃", "store selector 未更新导致组件拿到 undefined", "父组件传参未改导致 prop 丢失", "mock 数据残留旧名导致假绿"],
        "pass": ["API 同时返回 isEnabled 和 isActive", "前端统一使用 isActive", "端到端测试通过", "TypeScript 编译零错误"],
        "caps": ["全栈分析", "向后兼容", "状态管理更新", "组件重构", "端到端测试"]
    },
    {
        "id": "global-rename-010",
        "trigger": "将 API 路径前缀 /api/v1/notifications 改为 /api/v2/alerts，同时升级版本号",
        "chain": [
            "1. 梳理 /api/v1/notifications 下所有子路由和 handler",
            "2. 扫描前端和 SDK 中所有调用该路径的代码",
            "3. 设计 v2 的路由结构",
            "4. 创建 /api/v2/alerts 路由并复用或重写 handler",
            "5. 在 v1 路由上标记 deprecated",
            "6. 更新前端/SDK 调用路径和请求/响应类型",
            "7. 更新 OpenAPI 文档和 SDK 文档",
            "8. 更新测试用例：新增 v2 测试、保留 v1 兼容测试",
            "9. 运行全量 API 测试 + 前端集成测试"
        ],
        "bad": ["v1 路由直接删除导致服务中断", "v2 字段映射遗漏导致数据丢失", "前端部分页面仍调用 v1", "SDK 版本未升级"],
        "pass": ["v2 路由全功能可用", "v1 返回 deprecated 警告但仍可用", "OpenAPI 完整覆盖 v2", "前端和 SDK 全部迁移"],
        "caps": ["API版本管理", "路由设计", "向后兼容", "文档生成", "集成测试"]
    },
    {
        "id": "global-rename-011",
        "trigger": "将技能名 browser-control 改为 web-automation，仅涉及2个配置文件和1个源码文件",
        "chain": [
            "1. 定位技能目录 skills/browser-control",
            "2. 确认影响范围：SKILL.md、manifest.json、loader.ts",
            "3. 重命名目录",
            "4. 更新 manifest.json 中的 name/id",
            "5. 更新 loader.ts 中的 require 路径",
            "6. 更新 SKILL.md 中的标题和描述",
            "7. 检查隐藏引用（如 available_skills 列表）",
            "8. 更新 available_skills 配置中的条目",
            "9. 运行技能加载测试验证"
        ],
        "bad": ["遗漏 available_skills 列表导致技能不可发现", "影响范围评估过窄", "SKILL.md 内部引用了旧目录名的相对路径", "技能缓存未清理"],
        "pass": ["技能以新名称正常加载", "技能发现机制能找到 web-automation", "grep browser-control 仅剩 git 历史", "功能测试通过"],
        "caps": ["技能系统理解", "影响范围评估", "配置更新", "缓存清理", "功能验证"]
    },
    {
        "id": "global-rename-012",
        "trigger": "将模块名 auth-middleware 改为 identity-guard，涉及约20个路由文件的中间件引用",
        "chain": [
            "1. 定位 auth-middleware 模块目录和导出接口",
            "2. 全仓库扫描所有 import from 'auth-middleware' 的位置",
            "3. 分析导出的中间件函数名是否也需要语义更新",
            "4. 重命名目录 auth-middleware → identity-guard",
            "5. 更新 package.json name 字段",
            "6. 批量更新20个路由文件的 import 路径",
            "7. 更新中间件函数名（authCheck → identityVerify）",
            "8. 更新路由文件中的中间件调用",
            "9. 运行路由级别的单元测试和集成测试"
        ],
        "bad": ["仅改目录名但函数名未更新导致语义不一致", "动态 import 未被 grep 捕获", "中间件注册顺序变更导致鉴权失败", "测试 mock 硬编码旧模块名"],
        "pass": ["所有路由文件引用更新完毕", "中间件函数名语义一致", "鉴权功能正常", "全量测试通过"],
        "caps": ["中间件分析", "批量重构", "函数重命名", "路由测试", "语义一致性检查"]
    },
    {
        "id": "global-rename-013",
        "trigger": "把事件名 session:expired 改为 session:timeout，涉及前后端共10处引用",
        "chain": [
            "1. 全仓库搜索 session:expired 的所有出现位置",
            "2. 区分后端发布点和前端订阅点",
            "3. 检查 WebSocket 消息中是否使用该事件名",
            "4. 更新后端事件发布代码",
            "5. 更新前端事件监听代码",
            "6. 更新 WebSocket 消息类型定义",
            "7. 更新事件常量定义文件",
            "8. 更新相关的错误提示文案",
            "9. 运行会话超时场景的端到端测试"
        ],
        "bad": ["WebSocket 消息中事件名未更新", "错误提示文案未同步更新", "常量文件更新但枚举值未更新", "前端监听新事件但旧后端仍发旧事件"],
        "pass": ["前后端事件名完全一致", "会话超时端到端测试通过", "WebSocket 消息类型已更新", "错误提示使用新措辞"],
        "caps": ["前后端联调", "WebSocket分析", "事件常量管理", "文案更新", "端到端测试"]
    },
    {
        "id": "global-rename-014",
        "trigger": "将全局配置变量 DATABASE_URL 改为 PRIMARY_DB_URL，涉及多环境配置文件",
        "chain": [
            "1. 扫描所有环境配置文件",
            "2. 扫描 Docker 配置",
            "3. 扫描 K8s 配置：ConfigMap/Secret/deployment.yaml",
            "4. 扫描 CI/CD 配置中的环境变量引用",
            "5. 更新源码中 process.env.DATABASE_URL 的所有引用",
            "6. 更新所有环境配置文件中的变量名",
            "7. 更新容器和编排配置中的变量名",
            "8. 更新 CI/CD pipeline 中的变量注入",
            "9. 在各环境验证数据库连接正常"
        ],
        "bad": ["生产环境 K8s Secret 未更新导致数据库连接失败", "CI/CD 中环境变量未更新", ".env.example 未更新", "ORM 配置中硬编码旧变量名"],
        "pass": ["所有环境数据库连接正常", "grep DATABASE_URL 零命中", ".env.example 已更新", "CI/CD 执行正常"],
        "caps": ["多环境管理", "容器配置", "K8s管理", "CI/CD配置", "连接验证"]
    },
    {
        "id": "global-rename-015",
        "trigger": "将 API 路由前缀从 /internal/ 改为 /private/，涉及网关层和各微服务",
        "chain": [
            "1. 扫描 API 网关配置中所有 /internal/ 路由规则",
            "2. 扫描各微服务中注册的 /internal/ 路由",
            "3. 检查网关 ACL 是否基于路径前缀过滤",
            "4. 更新网关路由配置中的前缀",
            "5. 更新各微服务的路由注册",
            "6. 更新网关 ACL/防火墙规则以匹配新前缀",
            "7. 更新服务间调用代码中的路径",
            "8. 更新 API 文档和内部调用约定文档",
            "9. 部署后运行内部 API 集成测试"
        ],
        "bad": ["网关 ACL 未更新导致内部 API 被公开访问", "部分微服务未同步更新", "服务间调用硬编码旧前缀", "健康检查路径未更新导致监控告警"],
        "pass": ["/private/ 路由仅内部可访问", "外部无法访问", "服务间调用正常", "监控和健康检查正常"],
        "caps": ["网关配置", "ACL管理", "微服务协调", "安全审计", "健康检查验证"]
    },
    {
        "id": "global-rename-016",
        "trigger": "将技能名 camera-snap 改为 photo-capture，该技能被3个其他技能依赖",
        "chain": [
            "1. 定位 skills/camera-snap 目录及 manifest.json",
            "2. 分析依赖图：哪3个技能依赖 camera-snap",
            "3. 检查依赖方式：直接 require、事件依赖还是配置引用",
            "4. 重命名目录",
            "5. 更新 manifest.json 中的技能标识",
            "6. 更新3个依赖技能中的引用路径和依赖声明",
            "7. 更新事件名 camera-snap:* → photo-capture:*",
            "8. 更新技能间的依赖拓扑配置",
            "9. 运行依赖链路的集成测试"
        ],
        "bad": ["依赖技能的 dependencies 未更新", "技能加载顺序依赖旧名排序", "事件名更新不完整", "技能描述中引用旧名"],
        "pass": ["4个技能全部正常加载", "技能间事件通信正常", "依赖拓扑图正确", "所有测试通过"],
        "caps": ["依赖分析", "技能拓扑", "事件更新", "级联重命名", "集成测试"]
    },
    {
        "id": "global-rename-017",
        "trigger": "将核心模块 event-bus 重构为 message-broker，伴随架构语义从广播模式变为队列模式",
        "chain": [
            "1. 分析 event-bus 的当前 API（emit/on/off/once）",
            "2. 设计 message-broker 的新 API（publish/subscribe/ack）",
            "3. 全仓库扫描 event-bus 的所有调用点",
            "4. 创建 message-broker 模块实现新 API",
            "5. 创建适配层将旧 API 映射到新 API",
            "6. 逐步迁移各消费方使用新 API",
            "7. 更新所有类型定义和接口声明",
            "8. 更新架构文档说明语义变更",
            "9. 运行全量测试 + 消息可靠性测试"
        ],
        "bad": ["适配层有 bug 导致消息丢失", "新 ack 机制未被正确实现导致消息重复", "广播语义调用方未意识到变为队列语义", "部分调用方仍使用旧 API"],
        "pass": ["所有消费方迁移到新 API", "消息可靠性测试通过", "适配层已移除或废弃", "架构文档准确"],
        "caps": ["架构重构", "API设计", "适配器模式", "消息可靠性测试", "渐进式迁移"]
    },
    {
        "id": "global-rename-018",
        "trigger": "把所有以 handle 开头的事件处理函数改为以 on 开头，如 handleClick → onClick",
        "chain": [
            "1. 全仓库搜索 handle[A-Z] 模式的函数定义",
            "2. 分类：React 组件方法、工具函数、事件回调、Express handler",
            "3. 排除不应改名的（如 Express route handler）",
            "4. 生成改名映射表",
            "5. 批量更新函数定义处的函数名",
            "6. 批量更新所有调用处的函数名",
            "7. 更新 JSX 中的事件绑定",
            "8. 更新测试中的函数引用和 spy/mock",
            "9. 运行 lint + 测试验证无命名冲突"
        ],
        "bad": ["误改了 Express handler 导致路由断裂", "新函数名与已有 prop 冲突", "JSX 中 onClick={onClick} 自引用循环", "测试 spy 未更新导致假绿"],
        "pass": ["React 组件统一使用 on 前缀", "无命名冲突", "lint 零警告", "全量测试通过"],
        "caps": ["AST分析", "批量重命名", "命名冲突检测", "React组件理解", "测试验证"]
    },
    {
        "id": "global-rename-019",
        "trigger": "将事件前缀 plugin: 改为 extension:，涉及插件系统的加载、通信和卸载全流程",
        "chain": [
            "1. 扫描插件系统核心代码中所有 plugin: 前缀的事件定义",
            "2. 建立事件清单：plugin:loaded/error/unloaded 等",
            "3. 扫描所有插件中对这些事件的监听和发布",
            "4. 更新核心代码中的事件前缀",
            "5. 更新所有内置插件中的事件引用",
            "6. 更新第三方插件开发文档和模板",
            "7. 添加兼容映射（plugin:* → extension:*）",
            "8. 更新插件生命周期测试",
            "9. 运行插件加载→执行→卸载全流程测试"
        ],
        "bad": ["第三方插件仍发 plugin: 事件导致核心不响应", "兼容映射遗漏某些事件", "卸载事件断链导致资源泄漏", "插件模板未更新"],
        "pass": ["内置插件全部使用 extension:", "兼容层可转发旧前缀", "全生命周期测试通过", "文档和模板已更新"],
        "caps": ["插件系统理解", "事件映射", "生命周期测试", "兼容层设计", "文档更新"]
    },
    {
        "id": "global-rename-020",
        "trigger": "将变量名 TIMEOUT_MS 改为 REQUEST_TIMEOUT_MS，涉及约200处引用但需区分不同作用域的同名变量",
        "chain": [
            "1. 全仓库 grep TIMEOUT_MS 定位所有出现位置",
            "2. 区分同名但不同作用域的 TIMEOUT_MS",
            "3. 确定只改全局/共享的，不改局部变量",
            "4. 标记需要更新的引用",
            "5. 更新常量定义文件中的变量名",
            "6. 批量更新源码引用",
            "7. 更新环境变量名",
            "8. 更新文档中的配置项说明",
            "9. 运行全量测试 + 手动验证超时行为"
        ],
        "bad": ["误改了局部作用域的同名变量", "字符串形式的配置 key 未覆盖", "部署平台上的环境变量未同步", "200处替换有遗漏导致 undefined"],
        "pass": ["全局常量统一为 REQUEST_TIMEOUT_MS", "局部同名变量未被误改", "全量测试通过", "超时行为正确"],
        "caps": ["作用域分析", "精确匹配", "批量替换", "环境变量同步", "行为验证"]
    },
    {
        "id": "global-rename-021",
        "trigger": "将 API 资源名 /api/orders/{id}/items 改为 /api/orders/{id}/line-items，涉及前后端和移动端",
        "chain": [
            "1. 扫描后端路由定义中该路径的注册",
            "2. 扫描 Web 前端代码中的 API 调用",
            "3. 扫描移动端代码中的 API 调用",
            "4. 更新后端路由定义并保留旧路由做重定向",
            "5. 更新 Web 前端 API 调用路径",
            "6. 通知移动端团队或提供新版 SDK",
            "7. 更新 OpenAPI 文档和 SDK 生成配置",
            "8. 更新所有端的测试用例",
            "9. 部署后运行跨端集成测试"
        ],
        "bad": ["移动端已发版无法强制更新", "SDK 自动生成代码未重新生成", "旧路由重定向丢失查询参数", "移动端缓存旧路径响应"],
        "pass": ["新路径全端可用", "旧路径重定向正常", "OpenAPI 已更新", "跨端集成测试通过"],
        "caps": ["多端协调", "路由重定向", "SDK生成", "API版本管理", "跨端测试"]
    },
    {
        "id": "global-rename-022",
        "trigger": "将技能名 healthcheck 改为 system-diagnostics，功能范围扩展后的改名",
        "chain": [
            "1. 审查 healthcheck 技能当前功能范围",
            "2. 全仓库扫描 healthcheck 的所有引用",
            "3. 重命名目录 skills/healthcheck → skills/system-diagnostics",
            "4. 更新 SKILL.md 描述以反映扩展后的功能",
            "5. 更新 manifest.json 中的 name/id/description",
            "6. 更新 available_skills 列表中的条目",
            "7. 更新定时任务/cron 中引用该技能的配置",
            "8. 更新用户文档和帮助信息",
            "9. 运行技能功能测试和集成测试"
        ],
        "bad": ["cron 任务中残留旧技能名导致定时检查失效", "available_skills 的 description 未更新", "技能路径解析依赖旧目录名", "帮助命令展示旧名"],
        "pass": ["技能以新名称正常运行", "定时任务正常触发", "帮助信息一致", "全部测试通过"],
        "caps": ["技能重命名", "cron配置", "用户文档更新", "技能发现更新", "集成测试"]
    },
    {
        "id": "global-rename-023",
        "trigger": "将模块名 utils 改为 shared-helpers，这是被几乎所有模块依赖的基础模块",
        "chain": [
            "1. 分析 utils 模块的导出清单和被依赖方数量",
            "2. 全仓库扫描 from 'utils' / require('utils') 的所有位置",
            "3. 评估 TypeScript path alias 是否指向 utils",
            "4. 重命名目录并更新 package.json",
            "5. 更新 TypeScript tsconfig paths 别名",
            "6. 批量更新所有 import 路径",
            "7. 更新 jest/vitest 的 moduleNameMapper",
            "8. 更新文档中对 utils 模块的引用",
            "9. 运行 TypeScript 编译 + 全量测试"
        ],
        "bad": ["tsconfig paths 未更新导致 IDE 报错", "jest moduleNameMapper 未更新导致测试失败", "相对路径引用未被全局替换覆盖", "子包 tsconfig 未更新"],
        "pass": ["TypeScript 编译零错误", "全量测试通过", "IDE 无路径警告", "所有子包 tsconfig 正确"],
        "caps": ["TypeScript配置", "路径别名管理", "测试配置", "依赖分析", "IDE兼容验证"]
    },
    {
        "id": "global-rename-024",
        "trigger": "将事件前缀 ws: 改为 realtime:，涉及 WebSocket 服务端和客户端 SDK",
        "chain": [
            "1. 扫描 WebSocket 服务端中所有 ws: 前缀消息类型",
            "2. 扫描客户端 SDK 中对应的消息类型定义",
            "3. 建立消息类型上下游对应关系",
            "4. 更新服务端消息类型和处理逻辑",
            "5. 更新客户端 SDK 消息类型和解析逻辑",
            "6. 添加消息类型兼容层",
            "7. 更新 WebSocket 协议文档",
            "8. 更新 SDK 版本号和 CHANGELOG",
            "9. 运行 WebSocket 连接和消息收发测试"
        ],
        "bad": ["旧版 SDK 用户无法升级导致消息类型不匹配", "兼容层引入额外延迟", "CHANGELOG 未记录破坏性变更", "心跳消息类型未更新导致断连"],
        "pass": ["新 SDK 使用 realtime: 正常通信", "旧 SDK 通过兼容层仍可用", "心跳和重连正常", "协议文档已更新"],
        "caps": ["WebSocket协议", "SDK管理", "消息兼容", "版本管理", "连接测试"]
    },
    {
        "id": "global-rename-025",
        "trigger": "将配置变量 LOG_LEVEL 改为 APP_LOG_LEVEL 以避免与第三方库同名变量冲突",
        "chain": [
            "1. 确认冲突场景：哪个第三方库也使用 LOG_LEVEL",
            "2. 全仓库扫描 LOG_LEVEL 的所有出现位置",
            "3. 区分应用自有的和第三方库的 LOG_LEVEL",
            "4. 更新应用代码中的变量引用",
            "5. 更新所有环境配置文件",
            "6. 更新日志初始化代码",
            "7. 更新部署文档和运维手册",
            "8. 确保第三方库的 LOG_LEVEL 不受影响",
            "9. 在各环境验证日志级别设置正确"
        ],
        "bad": ["误改了第三方库的 LOG_LEVEL", "日志初始化优先级变更", "运维人员不知道变量名变更", "Docker entrypoint 硬编码旧变量名"],
        "pass": ["APP_LOG_LEVEL 可正确控制日志级别", "第三方库不受影响", "运维文档已更新", "各环境日志行为正确"],
        "caps": ["变量冲突分析", "精确替换", "环境配置", "日志系统", "运维文档"]
    },
    {
        "id": "global-rename-026",
        "trigger": "将 API 前缀 /api/v3/projects 改为 /api/v3/workspaces，同时将数据库表名也同步更改",
        "chain": [
            "1. 扫描路由定义中的所有注册",
            "2. 扫描 ORM/Model 中 projects 表的所有引用",
            "3. 生成数据库迁移脚本 ALTER TABLE projects RENAME TO workspaces",
            "4. 更新 ORM Model 的 tableName 和类名",
            "5. 更新 API 路由定义",
            "6. 更新前端 API 调用路径",
            "7. 更新 API 文档和数据库 ER 图",
            "8. 在旧路由添加重定向兼容",
            "9. 执行数据库迁移 + API 测试 + 前端测试"
        ],
        "bad": ["数据库迁移失败导致数据丢失", "ORM 缓存中仍使用旧表名", "迁移无回滚方案", "外键关联表未同步更新"],
        "pass": ["数据库迁移成功且数据完整", "API 和数据库统一使用 workspaces", "ORM 查询正常", "全量测试通过"],
        "caps": ["数据库迁移", "ORM更新", "路由重构", "数据完整性验证", "回滚方案"]
    },
    {
        "id": "global-rename-027",
        "trigger": "将技能名 tmux 改为 terminal-session，同时更新其命令前缀和快捷键绑定",
        "chain": [
            "1. 定位 skills/tmux 目录和相关配置",
            "2. 全仓库扫描 tmux 技能名的所有引用",
            "3. 重命名目录",
            "4. 更新 manifest.json 和 SKILL.md",
            "5. 更新命令前缀（/tmux → /terminal）",
            "6. 更新快捷键绑定配置中的技能引用",
            "7. 更新命令帮助文档和 autocomplete 配置",
            "8. 更新技能注册和发现配置",
            "9. 运行技能命令测试和快捷键测试"
        ],
        "bad": ["未添加旧命令别名导致用户体验断裂", "快捷键绑定文件格式特殊未匹配到", "autocomplete 缓存未刷新", "技能内部 tmux 二进制名被误改"],
        "pass": ["新命令 /terminal 正常工作", "旧命令有别名或提示", "快捷键正常", "技能加载正常"],
        "caps": ["命令系统更新", "快捷键配置", "别名管理", "autocomplete更新", "用户体验"]
    },
    {
        "id": "global-rename-028",
        "trigger": "将模块名 logger 拆分重命名为 log-core 和 log-transports，这是一次拆分重构",
        "chain": [
            "1. 分析 logger 模块的功能：核心 API 和传输层",
            "2. 全仓库扫描 import from 'logger' 的所有位置",
            "3. 按引用的具体功能分类",
            "4. 创建 log-core 和 log-transports 两个新模块",
            "5. 迁移代码到两个新模块",
            "6. 更新引用核心 API 的文件",
            "7. 更新引用传输配置的文件",
            "8. 处理旧 logger 模块（删除或保留为 facade）",
            "9. 运行全量测试验证日志功能正常"
        ],
        "bad": ["拆分边界不清导致循环依赖", "某些文件需要两个模块但只引用了一个", "传输层初始化顺序变更导致启动时日志丢失", "旧 import 仍可解析但功能不全"],
        "pass": ["两个新模块无循环依赖", "所有日志功能正常", "全量测试通过", "旧 import 编译报错或 facade 正确重导出"],
        "caps": ["模块拆分", "依赖分析", "循环依赖检测", "渐进式迁移", "日志系统验证"]
    },
    {
        "id": "global-rename-029",
        "trigger": "将所有 callback 风格的异步函数名从 xxxCb 改为 xxxAsync 并更新签名为 Promise",
        "chain": [
            "1. 全仓库搜索以 Cb 结尾的函数定义",
            "2. 分类确认哪些需要改",
            "3. 生成改名映射表",
            "4. 将函数实现改为 async/await 或返回 Promise",
            "5. 更新函数名",
            "6. 更新所有调用点：callback → await",
            "7. 更新类型定义中的函数签名",
            "8. 更新错误处理：err-first callback → try/catch",
            "9. 运行全量测试验证异步行为正确"
        ],
        "bad": ["错误传播路径变更导致异常未捕获", "调用方未 await 导致 race condition", "某些 callback 是多次调用的不适合 Promise", "错误处理遗漏某些分支"],
        "pass": ["所有 xxxAsync 返回 Promise", "无未处理的 Promise rejection", "全量测试通过", "lint 无 async 警告"],
        "caps": ["异步模式转换", "函数签名更新", "错误处理重构", "Promise分析", "并发测试"]
    },
    {
        "id": "global-rename-030",
        "trigger": "将数据库字段名 created_at 改为 created_time，涉及 ORM 模型、API 响应和前端展示共约200处",
        "chain": [
            "1. 生成数据库迁移脚本 ALTER TABLE ... RENAME COLUMN created_at TO created_time",
            "2. 扫描所有 ORM 模型中 created_at 的映射",
            "3. 扫描 API 响应中 created_at 的序列化字段",
            "4. 扫描前端代码中 .created_at 的引用",
            "5. 执行数据库迁移",
            "6. 更新 ORM 模型中的字段映射",
            "7. 更新 API 序列化器（保留 created_at 做兼容）",
            "8. 更新前端代码中的字段引用",
            "9. 运行数据库查询测试 + API 测试 + 前端测试"
        ],
        "bad": ["数据库迁移锁表时间过长导致服务不可用", "ORM 缓存字段名未刷新导致查询失败", "API 响应直接移除旧字段导致旧客户端报错", "前端排序/过滤逻辑中硬编码旧字段名"],
        "pass": ["数据库字段已更名", "ORM 查询正常", "API 兼容返回两个字段名", "前端展示正常"],
        "caps": ["数据库迁移", "ORM映射更新", "API序列化", "前端重构", "全栈测试"]
    },
    {
        "id": "global-rename-031",
        "trigger": "将技能名 skill-creator 改为 skill-builder，更新技能创建向导的全部引用",
        "chain": [
            "1. 定位 skills/skill-creator 目录和所有相关脚本",
            "2. 全仓库扫描 skill-creator 的所有引用",
            "3. 重命名目录",
            "4. 更新 manifest.json 和 SKILL.md",
            "5. 更新技能创建向导的模板文件中的引用",
            "6. 更新命令行工具中引用该技能的代码",
            "7. 更新用户引导文档和教程",
            "8. 更新 AGENTS.md 中对该技能的引用",
            "9. 运行技能创建向导的端到端测试"
        ],
        "bad": ["模板文件中残留旧名导致生成的技能引用错误路径", "命令行工具的 help 输出未更新", "教程截图/示例代码未更新", "AGENTS.md 中的技能描述未同步"],
        "pass": ["技能创建向导正常工作", "生成的技能模板引用路径正确", "帮助文档一致", "全部测试通过"],
        "caps": ["技能系统更新", "模板管理", "文档更新", "CLI更新", "端到端测试"]
    },
    {
        "id": "global-rename-032",
        "trigger": "将模块名 http-client 改为 api-client，同时统一暴露的 HTTP 方法命名风格",
        "chain": [
            "1. 分析 http-client 导出的 API（get/post/put/delete）",
            "2. 全仓库扫描所有 import from 'http-client' 的位置",
            "3. 设计新的方法命名（httpGet→apiGet 或保持不变）",
            "4. 重命名目录和 package.json",
            "5. 更新导出的方法名",
            "6. 批量更新所有消费方的 import 和调用",
            "7. 更新拦截器/中间件注册中的引用",
            "8. 更新类型定义",
            "9. 运行 HTTP 请求相关的集成测试"
        ],
        "bad": ["拦截器注册代码使用旧模块引用导致请求无认证", "方法名变更导致动态调用处报错", "TypeScript 重载签名未更新", "请求重试逻辑中引用旧模块"],
        "pass": ["所有 HTTP 请求正常", "拦截器工作正常", "TypeScript 编译通过", "集成测试通过"],
        "caps": ["HTTP客户端重构", "方法重命名", "拦截器更新", "类型定义更新", "请求测试"]
    },
    {
        "id": "global-rename-033",
        "trigger": "把事件前缀 sys: 改为 system:，影响系统级事件如启动、关闭、错误处理",
        "chain": [
            "1. 扫描所有 sys: 前缀事件（sys:boot, sys:shutdown, sys:error 等）",
            "2. 分析这些事件在启动和关闭流程中的时序依赖",
            "3. 检查是否有外部监控系统订阅了这些事件",
            "4. 更新事件常量定义",
            "5. 更新事件发布代码",
            "6. 更新事件监听代码",
            "7. 更新外部监控系统的事件过滤配置",
            "8. 更新系统事件文档",
            "9. 运行系统启动和优雅关闭测试"
        ],
        "bad": ["启动事件未更新导致系统初始化卡住", "关闭事件断链导致资源未释放", "外部监控未同步导致报警失效", "错误处理事件断链导致异常被吞"],
        "pass": ["系统正常启动和关闭", "错误事件正常传播", "外部监控正常接收", "全流程测试通过"],
        "caps": ["系统事件管理", "启动流程分析", "监控集成", "优雅关闭", "时序测试"]
    },
    {
        "id": "global-rename-034",
        "trigger": "将全局配置 API_BASE_URL 改为 GATEWAY_URL，同时更新所有引用该配置的服务发现逻辑",
        "chain": [
            "1. 扫描 API_BASE_URL 的所有定义和引用",
            "2. 分析服务发现逻辑中对该配置的依赖",
            "3. 检查是否有多个服务共享该配置",
            "4. 更新配置定义和默认值",
            "5. 更新源码中的引用",
            "6. 更新服务发现/注册中心的配置",
            "7. 更新所有环境的部署配置",
            "8. 更新 SDK 和客户端库中的配置项",
            "9. 运行服务发现和 API 调用的集成测试"
        ],
        "bad": ["服务发现逻辑中变量名变更导致服务注册失败", "SDK 用户不知道配置项改名", "部分服务读取旧配置名导致默认值覆盖", "环境变量传递链断裂"],
        "pass": ["所有服务正确使用 GATEWAY_URL", "服务发现正常", "SDK 文档已更新", "全量测试通过"],
        "caps": ["服务发现", "配置管理", "SDK更新", "环境变量", "集成测试"]
    },
    {
        "id": "global-rename-035",
        "trigger": "将 API 路径 /api/files/upload 改为 /api/attachments/upload，同时重命名关联的 Service 和 Controller",
        "chain": [
            "1. 扫描路由定义和 Controller 类",
            "2. 扫描 Service 层中 FileService/FileController 的引用",
            "3. 重命名 FileController → AttachmentController",
            "4. 重命名 FileService → AttachmentService",
            "5. 更新路由注册",
            "6. 更新依赖注入配置",
            "7. 更新前端调用路径和类型定义",
            "8. 更新文件上传相关的测试",
            "9. 运行文件上传的端到端测试"
        ],
        "bad": ["依赖注入配置未更新导致 Controller 实例化失败", "Service 重命名但 Repository 层引用未更新", "文件上传中间件（如 multer）的配置引用旧 Controller", "前端 FormData 的 field name 未同步"],
        "pass": ["文件上传功能正常", "依赖注入正确", "前端上传正常", "测试通过"],
        "caps": ["Controller重构", "Service重命名", "依赖注入", "文件上传测试", "端到端验证"]
    },
    {
        "id": "global-rename-036",
        "trigger": "将技能名 feishu-doc 改为 lark-document，对齐国际化命名规范",
        "chain": [
            "1. 定位 skills/feishu-doc 目录",
            "2. 全仓库扫描 feishu-doc 的所有引用",
            "3. 重命名目录",
            "4. 更新 manifest.json 中的标识和描述（中英文）",
            "5. 更新事件前缀 feishu-doc:* → lark-document:*",
            "6. 更新 available_skills 中的条目",
            "7. 更新国际化资源文件（i18n）中的技能名翻译",
            "8. 更新用户文档的中英文版本",
            "9. 运行技能加载和国际化显示测试"
        ],
        "bad": ["中文文档中仍显示旧名 feishu-doc", "i18n 资源文件遗漏某些语言", "事件前缀未更新导致飞书文档操作失效", "国际化切换后技能名显示异常"],
        "pass": ["技能以新名称加载", "中英文文档一致", "i18n 显示正确", "功能测试通过"],
        "caps": ["国际化处理", "技能重命名", "i18n资源更新", "多语言文档", "功能验证"]
    },
    {
        "id": "global-rename-037",
        "trigger": "将模块名 cache-manager 改为 store-provider，同时将内部的 Redis/Memory 实现改为插件化架构",
        "chain": [
            "1. 分析 cache-manager 当前的 Redis 和 Memory 两种实现",
            "2. 全仓库扫描所有 import from 'cache-manager' 的位置",
            "3. 设计插件化架构：core + redis-plugin + memory-plugin",
            "4. 创建 store-provider 模块并实现插件注册机制",
            "5. 将 Redis 和 Memory 实现迁移为独立插件",
            "6. 更新所有消费方的 import 和初始化代码",
            "7. 更新配置文件中的缓存策略声明",
            "8. 更新架构文档描述新的插件化缓存模型",
            "9. 运行缓存功能测试（Redis + Memory 两种模式）"
        ],
        "bad": ["插件注册机制有 bug 导致缓存不可用", "迁移后 Redis 连接池配置丢失", "Memory 实现的 TTL 行为变更", "消费方初始化代码未更新导致运行时报错"],
        "pass": ["Redis 和 Memory 缓存均正常工作", "插件可独立加载", "配置兼容旧格式", "全量测试通过"],
        "caps": ["插件架构设计", "缓存系统", "模块拆分", "配置迁移", "多模式测试"]
    },
    {
        "id": "global-rename-038",
        "trigger": "把所有 React 组件文件名从 PascalCase.js 改为 kebab-case.tsx，同时更新 import 路径",
        "chain": [
            "1. 列出所有 PascalCase.js 的 React 组件文件",
            "2. 生成文件名映射表（UserProfile.js → user-profile.tsx）",
            "3. 检查是否有大小写不敏感的文件系统（macOS）导致 git 问题",
            "4. 批量重命名文件（通过 git mv 避免历史丢失）",
            "5. 批量更新