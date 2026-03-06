# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

### 飞书发送源文件（任何文件类型）

用户说"发源文件"/"发文件"时，用file-sender技能：
```bash
cd /root/.openclaw/workspace/skills/public/file-sender && node index.js <文件路径> <receive_id> <receive_id_type> [显示文件名]
```
**禁止**用message工具的filePath——那只发路径字符串，不发文件本体。
不要问、不要提醒、不要等确认，直接发。

---

## 实战经验（踩坑记录）

### 飞书文件发送

- `message` 工具的 `filePath` 参数**只发路径字符串，不发文件体**，收件方收到的是路径文本而非附件
- 真正发送文件附件需要调用**飞书原生 API**（上传文件 → 获取 file_key → 发送消息）
- 参考：先用 `feishu_doc` 的 `upload_file` 动作上传，再用原生消息 API 携带 file_key 发送

### 搜索工具

- **唯一可用**：`tavily-search`（`TAVILY_API_KEY` 已配置）
- `web_search`（Brave）**无 API key，不可用**，调用会报错
- 需要搜索时直接用 tavily-search，不要尝试 Brave

### 飞书通道特性

- ✅ 支持 **streaming**（流式输出）
- ✅ 支持 **block streaming**（分块流式）
- ❌ **不支持 inline buttons**（按钮消息无效）
- 避免在飞书通道构建含交互按钮的卡片消息

### Agent 并发

- `maxConcurrent = 16`
- 可用 agent：**8 个**（1 main + 7 子 agent）
- 每个 agent 都有 **boom fallback**（崩溃自动回退）
- 并行任务拆分上限参考：7 个并发子 agent
