# 飞书智能纪要（妙记）自动转发调研报告

> 调研日期：2026-03-09

## 一、背景需求

用户希望飞书会议结束后，自动将"智能纪要助手"生成的会议纪要转发到指定群聊、文档或其他系统。

---

## 二、飞书妙记原生能力

### 2.1 妙记是什么
飞书妙记（Minutes）是飞书内置的会议录制 + AI 纪要功能。会议开启录制后，妙记会自动生成：
- 会议录音/录像
- 语音转文字（逐字稿）
- AI 智能纪要摘要（总结、待办、要点提取）

### 2.2 原生转发/分享能力
飞书妙记**原生不支持**"自动转发到群聊"的配置。目前原生支持的操作：

| 功能 | 说明 |
|------|------|
| 手动分享 | 在妙记页面点击"分享"，可发送给个人/群聊 |
| 权限设置 | 可设置"链接分享"范围（组织内/指定人） |
| 会议群自动通知 | 会议结束后，会议群内会收到妙记生成的通知卡片（但这是系统行为，非用户可配置的转发） |
| 导出 | 支持导出为文档（飞书文档格式） |

**结论：方案A（纯原生配置实现自动转发）不可行。** 飞书妙记没有"会议结束后自动转发到指定群"的原生设置项。

---

## 三、飞书开放平台相关 API

### 3.1 妙记（Minutes）API

飞书开放平台提供了 **Minutes V1** 系列 API：

| API | 端点 | 说明 |
|-----|------|------|
| 获取妙记列表 | `GET /open-apis/minutes/v1/minutes` | 获取用户可见的妙记列表 |
| 获取妙记详情 | `GET /open-apis/minutes/v1/minutes/{minute_token}` | 获取妙记基本信息（标题、时长、参与人等） |
| 获取妙记统计 | `GET /open-apis/minutes/v1/minutes/{minute_token}/statistics` | 获取观看统计 |
| 获取妙记转写内容 | `GET /open-apis/minutes/v1/minutes/{minute_token}/transcripts` | 获取逐字稿 |

**所需权限（scope）：**
- `minutes:minutes:readonly` — 读取妙记信息
- `minutes:transcript:readonly` — 读取转写内容

> ⚠️ **注意：** 妙记 API 目前**不提供 AI 摘要/智能纪要的结构化内容**。API 返回的是逐字稿（transcript），而非 AI 生成的纪要摘要。如需摘要内容，可能需要：
> 1. 获取转写文字后自行用 LLM 生成摘要
> 2. 或者获取妙记对应的飞书文档（如果用户手动导出过）

### 3.2 视频会议（VC）事件订阅

飞书开放平台支持以下视频会议相关事件：

| 事件 | 事件类型 | 说明 |
|------|----------|------|
| 会议开始 | `vc.meeting.meeting_started_v1` | 会议开始时触发 |
| **会议结束** | `vc.meeting.meeting_ended_v1` | **会议结束时触发** ⭐ |
| 参会人加入 | `vc.meeting.join_meeting_v1` | 参会人加入时触发 |
| 参会人离开 | `vc.meeting.leave_meeting_v1` | 参会人离开时触发 |
| 录制开始 | `vc.meeting.recording_started_v1` | 录制开始 |
| **录制完成** | `vc.meeting.recording_ready_v1` | **录制完成可用** ⭐ |
| 分享开始/结束 | `vc.meeting.share_started/ended_v1` | 屏幕分享事件 |

**关键事件：**
- `vc.meeting.meeting_ended_v1` — 会议结束，可作为触发起点
- `vc.meeting.recording_ready_v1` — 录制就绪，此时妙记也在处理中

> ⚠️ **目前没有 `minutes.ready` 之类的事件。** 妙记生成是异步的（会议结束后几分钟到几十分钟不等），飞书开放平台**没有提供"妙记生成完成"的专门事件**。这是实现自动转发的最大障碍。

### 3.3 消息发送 API

转发到群聊需要用到消息 API：

| API | 端点 | 说明 |
|-----|------|------|
| 发送消息 | `POST /open-apis/im/v1/messages` | 向群/人发送消息 |
| 发送富文本/卡片 | 同上，body 用 interactive 类型 | 支持消息卡片 |

**所需权限：**
- `im:message:send_as_bot` — 以机器人身份发送消息

---

## 四、可行方案

### 方案A：飞书原生配置 ❌ 不可行

飞书妙记没有"自动转发"设置项。会议群内的妙记通知卡片是系统自动发的，无法自定义目标群。

---

### 方案B：机器人订阅事件 → 轮询妙记 → 转发 ✅ 推荐

**架构：**
```
会议结束事件 → 机器人收到 webhook → 延迟等待 → 轮询妙记API → 获取内容 → 发送到目标群
```

**详细步骤：**

1. **创建飞书应用（机器人）**
   - 在[飞书开放平台](https://open.feishu.cn/)创建企业自建应用
   - 添加"机器人"能力

2. **申请权限**
   - `vc:meeting` — 视频会议信息
   - `vc:meeting:readonly` — 读取会议信息
   - `minutes:minutes:readonly` — 读取妙记
   - `minutes:transcript:readonly` — 读取转写内容
   - `im:message:send_as_bot` — 发送消息
   - `contact:user.id:readonly` — 读取用户信息（可选）

3. **订阅事件**
   - 在应用后台「事件订阅」中添加：
     - `vc.meeting.meeting_ended_v1`（会议结束）
     - `vc.meeting.recording_ready_v1`（录制就绪，可选）
   - 配置 webhook 回调地址

4. **实现转发逻辑**
   ```
   收到 meeting_ended 事件:
     1. 提取 meeting_id
     2. 等待 5-15 分钟（妙记生成需要时间）
     3. 调用 GET /open-apis/minutes/v1/minutes 查询最新妙记
     4. 匹配 meeting_id 找到对应妙记
     5. 获取妙记详情和转写内容
     6. 构造消息卡片（包含妙记链接、摘要等）
     7. 调用消息API发送到目标群
   ```

5. **将机器人添加到目标群**

**优点：**
- 事件驱动，相对实时
- 可精确匹配会议和妙记

**缺点：**
- 妙记生成时间不确定，需要轮询/重试机制
- 没有"妙记就绪"事件，需要自行判断何时妙记可用
- API 只能获取转写文字，无法直接获取 AI 摘要

**轮询策略建议：**
```
收到 meeting_ended 后:
  wait 5 min → 查询妙记 → 没有？
  wait 5 min → 查询妙记 → 没有？
  wait 10 min → 查询妙记 → 没有？
  wait 15 min → 查询妙记 → 找到 → 转发
  最长等待 60 min 后放弃
```

---

### 方案C：定时扫描妙记列表 → 转发 ✅ 简单备选

**架构：**
```
定时任务（每 10 分钟） → 调用妙记列表 API → 检测新妙记 → 转发
```

**详细步骤：**

1. **创建飞书应用**（同方案B步骤1-2）

2. **实现定时扫描**
   ```
   每 10 分钟执行:
     1. 调用 GET /open-apis/minutes/v1/minutes
     2. 对比上次扫描结果，找出新增妙记
     3. 对新妙记：获取详情 + 转写内容
     4. 构造消息发送到目标群
     5. 记录已处理的 minute_token，避免重复
   ```

3. **持久化状态**
   - 记录已处理的 minute_token 列表
   - 或记录上次扫描时间戳

**优点：**
- 实现简单，不需要事件订阅和 webhook 服务器
- 不遗漏任何妙记

**缺点：**
- 有延迟（最长等于扫描间隔）
- 需要持久化已处理记录
- 无法区分哪个会议对应哪个群（需要额外映射逻辑）

---

### 方案D：结合飞书多维表格/飞书自动化（Flow） 🔄 探索性

飞书提供了"飞书自动化"（Automation / Flow）功能，可能支持：
- 触发条件：会议结束
- 动作：发送消息到群

**现状：** 飞书自动化目前主要支持多维表格、审批等场景的触发器，对视频会议/妙记的支持有限。建议在飞书管理后台检查是否有相关自动化模板。

---

## 五、推荐方案及实操

### 推荐：方案B（事件订阅 + 轮询妙记）

**最小可行实现（MVP）：**

```python
# 伪代码示意

from flask import Flask, request
import time, requests, threading

app = Flask(__name__)
FEISHU_APP_ID = "cli_xxx"
FEISHU_APP_SECRET = "xxx"
TARGET_CHAT_ID = "oc_xxx"  # 目标群 chat_id

def get_tenant_token():
    resp = requests.post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", json={
        "app_id": FEISHU_APP_ID,
        "app_secret": FEISHU_APP_SECRET
    })
    return resp.json()["tenant_access_token"]

def poll_and_forward(meeting_id, meeting_topic):
    """会议结束后轮询妙记并转发"""
    token = get_tenant_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    for delay in [300, 300, 600, 900]:  # 5m, 5m, 10m, 15m
        time.sleep(delay)
        resp = requests.get(
            "https://open.feishu.cn/open-apis/minutes/v1/minutes",
            headers=headers,
            params={"page_size": 20}
        )
        minutes_list = resp.json().get("data", {}).get("items", [])
        
        for m in minutes_list:
            if meeting_id in m.get("meeting_id", ""):
                # 找到对应妙记，转发
                minute_url = m.get("url", f"https://meetings.feishu.cn/minutes/{m['minute_token']}")
                send_message(token, TARGET_CHAT_ID, meeting_topic, minute_url)
                return
    
    # 超时未找到
    print(f"Warning: 未找到会议 {meeting_id} 的妙记")

def send_message(token, chat_id, topic, url):
    headers = {"Authorization": f"Bearer {token}"}
    card = {
        "msg_type": "interactive",
        "receive_id": chat_id,
        "content": json.dumps({
            "elements": [{
                "tag": "div",
                "text": {"tag": "lark_md", "content": f"📝 **会议纪要已生成**\n\n会议：{topic}\n\n[点击查看妙记]({url})"}
            }],
            "header": {"title": {"tag": "plain_text", "content": "会议纪要通知"}}
        })
    }
    requests.post(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
        headers=headers, json=card
    )

@app.route("/webhook/event", methods=["POST"])
def handle_event():
    data = request.json
    
    # 验证 challenge（首次订阅验证）
    if "challenge" in data:
        return {"challenge": data["challenge"]}
    
    event = data.get("event", {})
    event_type = data.get("header", {}).get("event_type", "")
    
    if event_type == "vc.meeting.meeting_ended_v1":
        meeting = event.get("meeting", {})
        meeting_id = meeting.get("id", "")
        topic = meeting.get("topic", "未知会议")
        
        # 异步轮询妙记
        threading.Thread(target=poll_and_forward, args=(meeting_id, topic)).start()
    
    return {"code": 0}
```

### 权限清单

| 权限 Scope | 用途 | 必需 |
|------------|------|------|
| `vc:meeting:readonly` | 获取会议信息 | ✅ |
| `minutes:minutes:readonly` | 获取妙记列表和详情 | ✅ |
| `minutes:transcript:readonly` | 获取转写内容（如需发送摘要） | 可选 |
| `im:message:send_as_bot` | 发送消息到群 | ✅ |
| `im:chat:readonly` | 获取群信息 | 可选 |

### 限制与注意事项

1. **妙记生成延迟**：会议结束后 5-30 分钟才会生成妙记，取决于会议时长和系统负载
2. **AI 摘要不可通过 API 获取**：API 只提供转写文字，AI 纪要摘要目前没有 API。如需摘要，可自行对转写内容做 LLM 摘要
3. **没有妙记就绪事件**：这是最大的工程痛点，必须用轮询解决
4. **权限审批**：`minutes` 相关权限可能需要管理员审批
5. **应用可见范围**：应用需要对相关用户可见，才能读取其妙记
6. **妙记列表 API 限制**：只能获取当前 token 对应用户可见的妙记，需注意权限范围
7. **会议必须开启录制**：未录制的会议不会生成妙记

---

## 六、总结

| 方案 | 可行性 | 复杂度 | 实时性 | 推荐度 |
|------|--------|--------|--------|--------|
| A: 原生配置 | ❌ 不可行 | - | - | - |
| B: 事件+轮询 | ✅ | 中 | 较好（5-30min） | ⭐⭐⭐ |
| C: 定时扫描 | ✅ | 低 | 一般（10-40min） | ⭐⭐ |
| D: 飞书自动化 | 🔄 待验证 | 低 | 未知 | ⭐ |

**核心建议：采用方案B**，用飞书机器人订阅 `meeting_ended` 事件，结合妙记 API 轮询，实现准自动转发。如果团队希望更简单的方案，方案C（定时扫描）也可接受。

**后续可优化方向：**
- 关注飞书开放平台是否新增 `minutes.ready` 事件（会大幅简化方案）
- 结合 LLM 对转写内容生成更优质的摘要再转发
- 支持配置化：哪个会议的纪要转发到哪个群（通过多维表格管理映射关系）
