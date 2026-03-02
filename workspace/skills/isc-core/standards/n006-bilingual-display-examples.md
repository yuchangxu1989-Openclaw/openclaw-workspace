# 技能名称双语展示标准示例

## 标准定义

**规范ID**: N006  
**名称**: skill_name_bilingual_display  
**适用范围**: 所有涉及技能名称的汇报、报告、仪表盘输出  
**格式**: `英文名(中文名)`  
**状态**: 强制

---

## 正确示例 ✅

### 1. 技能列表汇报

```
当前已安装技能 (17个):

✓ isc-core(智能标准中心) v3.0.0
✓ seef(技能生态进化工厂) v3.0.3
✓ cras(认知进化伙伴) v1.0.0
✓ council-of-seven(七人议会决策机制) v2.1
✓ isc-document-quality(文档质量评估系统) v1.0.0
```

### 2. 执行报告输出

```
【SEEF(技能生态进化工厂) - 固定闭环模式执行报告】

目标技能: isc-core(智能标准中心)
执行步骤:
  1. evaluator(技能评估器) - 完成
  2. discoverer(技能发现器) - 完成
  3. optimizer(技能优化器) - 完成
```

### 3. 仪表盘展示

```
┌─────────────────────────────────────────────┐
│  CARS(四维意图洞察仪表盘) - 用户画像更新      │
├─────────────────────────────────────────────┤
│ 主要意图: command(指令型)                    │
│ 交互模式: recurring-theme(重复主题型)        │
│ 累计交互: 12 次                              │
└─────────────────────────────────────────────┘
```

### 4. 决策记录

```
【Council of Seven(七人议会) - 决策记录】

议题: 是否将 isc-core(智能标准中心) 发布到 EvoMap
决策: approved(通过)
支持率: 73.0%
```

---

## 错误示例 ❌

```
❌ 当前已安装技能:
   - isc-core
   - seef
   - cras

❌ 【SEEF - 执行报告】
   目标技能: isc-core

❌ 主要意图: command
```

---

## 自动化检查

```python
def check_bilingual_display(text):
    """检查是否遵循双语展示标准"""
    import re
    
    # 匹配技能名称模式
    skill_pattern = r'\b[a-z0-9-]+\b'
    skills = re.findall(skill_pattern, text)
    
    for skill in skills:
        # 检查是否包含中文名
        if not re.search(rf'{skill}\([\u4e00-\u9fa5]+\)', text):
            return False, f"技能 '{skill}' 缺少中文名展示"
    
    return True, "符合双语展示标准"

# 测试
test_text = "isc-core(智能标准中心) 已更新"
result, msg = check_bilingual_display(test_text)
print(f"检查结果: {result}, {msg}")
```

---

## 实施影响

| 模块 | 影响 | 状态 |
|:-----|:-----|:----:|
| CRAS 报告输出 | 需更新用户画像展示 | 🔄 待实施 |
| CARS 仪表盘 | 需更新意图标签展示 | 🔄 待实施 |
| SEEF 执行日志 | 需更新子技能名称 | 🔄 待实施 |
| ISC 验证报告 | 已符合标准 | ✅ 已实施 |
| Council of Seven | 需更新决策记录 | 🔄 待实施 |

---

**生效时间**: 2026-02-23  
**优先级**: 高 (用户体验维度)
