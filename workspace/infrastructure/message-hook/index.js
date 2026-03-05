'use strict';

const INTENT_KEYWORDS = {
  command: ['请', '帮我', '执行', '运行', '创建', '删除', '修改', '查询', '搜索'],
  question: ['什么', '为什么', '怎么', '如何', '吗', '呢', '?', '？'],
  feedback: ['好的', '不好', '赞', '差', '喜欢', '讨厌', '问题', 'bug', '错误'],
};

const EMOTION_MARKERS = {
  positive: ['👍', '❤️', '🎉', '太好了', '不错', '完美', 'nice', 'great', 'good'],
  negative: ['😡', '😤', '💢', '差劲', '垃圾', '烂', 'bad', 'terrible', 'awful'],
  urgent: ['紧急', '马上', '立刻', 'asap', 'urgent', '赶紧', '火速'],
};

class MessageHook {
  constructor(bus) {
    if (!bus) throw new Error('bus is required');
    this.bus = bus;
    this.stats = { processed: 0, intentsDetected: 0, errors: 0 };
  }

  onMessage(message, context = {}) {
    try {
      this.stats.processed++;
      const text = typeof message === 'string' ? message : (message && message.text) || '';
      const metadata = this._extractMetadata(text);

      this.bus.emit('session.message.received', {
        text,
        metadata,
        context,
        timestamp: Date.now(),
      });

      if (metadata.intents.length > 0) {
        this.stats.intentsDetected++;
        this.bus.emit('user.intent.detected', {
          text,
          intents: metadata.intents,
          context,
          timestamp: Date.now(),
        });
      }

      return metadata;
    } catch (err) {
      this.stats.errors++;
      throw err;
    }
  }

  _extractMetadata(text) {
    const intents = [];
    const emotions = [];
    const keywords = [];

    for (const [intent, kws] of Object.entries(INTENT_KEYWORDS)) {
      for (const kw of kws) {
        if (text.includes(kw)) {
          if (!intents.includes(intent)) intents.push(intent);
          keywords.push(kw);
        }
      }
    }

    for (const [emotion, markers] of Object.entries(EMOTION_MARKERS)) {
      for (const m of markers) {
        if (text.includes(m)) {
          if (!emotions.includes(emotion)) emotions.push(emotion);
        }
      }
    }

    return { intents, emotions, keywords };
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = { MessageHook };
