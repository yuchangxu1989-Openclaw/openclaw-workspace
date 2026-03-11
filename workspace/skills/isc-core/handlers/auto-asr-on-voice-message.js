'use strict';
/**
 * ISC Handler: rule.auto-asr-on-voice-message-001
 * 收到语音/音频消息时自动触发GLM-ASR转录，将语音内容转为文本处理，消除能力遗忘
 * Severity: medium | Trigger: {"events":["message.received.audio","message.received.voice"],"conditions":{"file_types":["ogg","mp3","wav","m4a","oga"],"has_audio_attachment":true}}
 */

function check(context) {
  const result = { ruleId: 'rule.auto-asr-on-voice-message-001', passed: true, findings: [] };
  
  try {
    // Validate context exists
    if (!context || typeof context !== 'object') {
      result.passed = false;
      result.findings.push({ level: 'error', message: 'Invalid context provided' });
      return result;
    }

    const event = context.event || {};
    const payload = context.payload || event.payload || {};
    
    // Rule-specific check placeholder - returns pass by default
    // Real enforcement logic should be added based on rule semantics
    result.checked = true;
    result.timestamp = new Date().toISOString();
    result.severity = 'medium';
    
  } catch (err) {
    result.passed = false;
    result.findings.push({ level: 'error', message: err.message });
  }
  
  return result;
}

module.exports = { check };
