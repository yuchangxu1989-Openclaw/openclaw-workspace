# GLM-TTS 语音合成技能

## 触发条件
- 用户发语音消息时，短回复（<50字）自动用语音回复
- 用户明确要求语音回复时

## 调用方式
bash /root/.openclaw/workspace/scripts/feishu-voice-reply.sh "<文本>" "<receive_id>" [receive_id_type]

## 参数
- 文本：要合成的中文文本
- receive_id：飞书用户open_id
- receive_id_type：默认open_id

## 音色
- douji（用户指定，固定不变）

## 技术细节
- GLM-TTS API → wav → ffmpeg截掉开头2秒（去噪音）→ opus → 飞书上传 → 语音气泡发送
- API Key：从zhipu-keys.env读取
