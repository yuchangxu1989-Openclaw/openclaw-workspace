'use strict';

const { MessageHook } = require('../../infrastructure/message-hook/index');

function makeBus() {
  const events = [];
  return { emit: (type, payload) => events.push({ type, payload }), events };
}

describe('MessageHook', () => {
  test('constructor requires bus', () => {
    expect(() => new MessageHook()).toThrow('bus is required');
  });

  test('constructor accepts bus', () => {
    const hook = new MessageHook(makeBus());
    expect(hook).toBeInstanceOf(MessageHook);
  });

  test('onMessage emits session.message.received', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('hello');
    expect(bus.events[0].type).toBe('session.message.received');
  });

  test('onMessage handles string message', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('hello world');
    expect(bus.events[0].payload.text).toBe('hello world');
  });

  test('onMessage handles object message with text', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage({ text: 'test msg' });
    expect(bus.events[0].payload.text).toBe('test msg');
  });

  test('detects command intent', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('请帮我创建一个文件');
    expect(bus.events.some(e => e.type === 'user.intent.detected')).toBe(true);
    const intent = bus.events.find(e => e.type === 'user.intent.detected');
    expect(intent.payload.intents).toContain('command');
  });

  test('detects question intent', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('这是什么东西?');
    const intent = bus.events.find(e => e.type === 'user.intent.detected');
    expect(intent.payload.intents).toContain('question');
  });

  test('detects feedback intent', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('这个功能有bug');
    expect(bus.events.some(e => e.type === 'user.intent.detected')).toBe(true);
  });

  test('no intent emitted for plain text', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('hello');
    expect(bus.events.length).toBe(1);
    expect(bus.events[0].type).toBe('session.message.received');
  });

  test('detects positive emotion', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    const meta = hook.onMessage('太好了 👍');
    expect(meta.emotions).toContain('positive');
  });

  test('detects negative emotion', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    const meta = hook.onMessage('这太差劲了 😡');
    expect(meta.emotions).toContain('negative');
  });

  test('detects urgent emotion', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    const meta = hook.onMessage('紧急！马上处理');
    expect(meta.emotions).toContain('urgent');
  });

  test('extracts keywords', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    const meta = hook.onMessage('请帮我搜索');
    expect(meta.keywords.length).toBeGreaterThan(0);
  });

  test('getStats tracks processed count', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('a');
    hook.onMessage('b');
    hook.onMessage('c');
    expect(hook.getStats().processed).toBe(3);
  });

  test('getStats tracks intentsDetected', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('请执行');
    hook.onMessage('hello');
    expect(hook.getStats().intentsDetected).toBe(1);
  });

  test('passes context through', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('hi', { userId: '123' });
    expect(bus.events[0].payload.context.userId).toBe('123');
  });

  test('handles null message gracefully', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    const meta = hook.onMessage(null);
    expect(meta.intents).toEqual([]);
  });

  test('payload includes timestamp', () => {
    const bus = makeBus();
    const hook = new MessageHook(bus);
    hook.onMessage('test');
    expect(typeof bus.events[0].payload.timestamp).toBe('number');
  });
});
