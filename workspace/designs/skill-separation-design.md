# 技能内部/外销分离机制设计文档

> Version: 1.0.0 | Created: 2026-03-05 | Status: Active

## TL;DR

每个技能通过 `distribution` 字段声明使用场景（internal/external/both），external 技能强制权限声明、密钥裁剪、沙箱隔离。发布前由检查器自动拦截不合规技能。

---

## 1. 问题定义

技能有两种截然不同的使用场景：

| 维度 | 内部使用 (Internal) | 外销发布 (External) |
|------|---------------------|---------------------|
| 访问权限 | 完整文件系统、密钥、内部API | 最小权限、沙箱隔离 |
| 密钥暴露 | 可引用 .secrets/ | 绝对禁止 |
| 运行环境 | 宿主机直接执行 | 沙箱容器 |
| 路径引用 | 可用绝对路径 | 仅相对路径 |
| 网络访问 | 不限 | 白名单或禁止 |

**没有分离机制的风险**：内部技能直接发布到 EvoMap，导致密钥泄露、内部路径暴露、权限越界。

---

## 2. 核心设计

### 2.1 Distribution 字段声明

每个技能的 SKILL.md 必须在元数据区域声明 `distribution` 字段：

```yaml
# SKILL.md 头部元数据
distribution: internal | external | both
```

- **internal** — 仅内部使用，不发布到 EvoMap
- **external** — 仅外销，不在内部系统直接调用
- **both** — 同时支持内部使用和外销发布

**默认值**：未声明时视为 `internal`（安全默认原则）。

### 2.2 权限声明（external/both 必须）

标记为 `external` 或 `both` 的技能必须声明 `permissions` 字段，引用 ISC 规则 031（四维度权限分级）：

```yaml
permissions:
  filesystem: 1    # 0-4，引用031规则的filesystem.levels
  network: 2       # 0-4，引用031规则的network.levels
  shell: 0         # 0-3，引用031规则的shell.levels
  credential: 0    # 0-2，引用031规则的credential.levels
```

**约束**：
- `credential` 必须为 0（外销技能禁止使用宿主凭证）
- `shell` 建议 ≤ 1（受限shell或无shell）
- `filesystem` 建议 ≤ 2（仅工作区读写）

### 2.3 External 技能打包裁剪

`both` 类型技能打包 external 版本时，自动执行裁剪：

#### 裁剪规则

| 裁剪项 | 检测模式 | 处理方式 |
|--------|---------|---------|
| .secrets/ 引用 | `\.secrets/`, `secrets/` 路径 | 移除整行或替换为占位符 |
| 内部绝对路径 | `/root/`, `/home/`, `~/.openclaw/` | 替换为相对路径或移除 |
| 环境变量密钥 | `process.env.{SENSITIVE_KEY}` | 移除并标记需外部注入 |
| credential 代码 | API key 硬编码、token 直引 | 移除并报错 |
| 内部 API 调用 | 内部服务 URL、localhost 引用 | 移除或替换 |

#### 敏感环境变量清单

```
API_KEY, SECRET_KEY, ACCESS_TOKEN, PRIVATE_KEY,
ZHIPU_API_KEY, OPENAI_API_KEY, FEISHU_APP_SECRET,
DB_PASSWORD, JWT_SECRET, AWS_SECRET_ACCESS_KEY
```

#### 裁剪流程

```
原始技能目录
  ↓ 复制到临时目录
  ↓ 扫描所有文件 (.js, .ts, .py, .sh, .md, .json, .yaml)
  ↓ 按裁剪规则处理
  ↓ 验证裁剪后技能仍可运行（基础完整性检查）
  ↓ 输出裁剪后的 external 包
```

### 2.4 运行时沙箱

External 技能运行时强制沙箱约束：

| 约束维度 | 实现方式 | 说明 |
|---------|---------|------|
| 文件系统 | chroot 或 namespace 隔离 | 仅可访问技能自身目录 + /tmp |
| 网络 | iptables/网络命名空间 | 仅白名单域名/端口 |
| Shell 执行 | seccomp/AppArmor 限制 | 禁止或受限 exec/spawn |
| 资源限制 | cgroups | CPU/内存/磁盘 IO 上限 |
| 时间限制 | 超时机制 | 单次执行最长 5 分钟 |

---

## 3. 检查流程

### 3.1 发布前检查（P0 门禁）

```
skill.publish_requested 事件
  ↓
  ├─ 检查 distribution 字段是否存在 → 不存在则阻断
  ├─ 如果 external/both:
  │   ├─ 检查 permissions 字段完整性 → 不完整则阻断
  │   ├─ 扫描代码无 .secrets 引用 → 有则阻断
  │   ├─ 扫描代码无内部绝对路径 → 有则阻断
  │   ├─ 扫描代码无敏感环境变量 → 有则阻断
  │   ├─ 检查沙箱兼容性 → 不兼容则阻断
  │   └─ 安全扫描通过（引用030规则）
  └─ 通过所有检查 → 允许发布
```

### 3.2 持续合规检查

- **Git 提交时**：pre-commit hook 检查 distribution 变更
- **定期扫描**：DTO 每日任务扫描已发布技能合规状态
- **EvoMap 同步前**：强制触发完整检查

---

## 4. 与现有 ISC 规则集成

| 规则 | 关系 |
|------|------|
| 030 安全门禁 | 外销技能发布前先走安全扫描 |
| 031 权限分级 | 外销技能的 permissions 字段引用此规则的四维度体系 |
| 032 EvoMap强制扫描 | 分离检查作为 032 的前置步骤 |
| 001 分发分离（新） | 本设计的 ISC 规则化实现 |

---

## 5. 状态机

```
技能创建 → [声明 distribution]
  ↓
  internal → 正常使用，不可发布到 EvoMap
  ↓
  external/both → [声明 permissions] → [通过检查器] → [通过030安全扫描] → 可发布
  ↓
  both 打包 → [裁剪内部引用] → 生成 external 包 → 发布
```

---

## 6. 迁移策略

1. **现有 EvoMap 清单内技能** → 标注 `distribution: both`
2. **其余所有技能** → 标注 `distribution: internal`
3. **逐步补全** `both` 技能的 permissions 声明
4. **检查器上线后**，所有发布请求必须通过检查
