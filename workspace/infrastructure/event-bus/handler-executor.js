const fs = require('fs');
const path = require('path');
const bus = require('./bus-adapter');

const HANDLERS_DIRS = [
  path.resolve(__dirname, 'handlers'),
  path.resolve(__dirname, '../../skills/isc-core/handlers'),
];

function loadHandler(handlerName) {
  const WORKSPACE = path.resolve(__dirname, '../..');

  // If handlerName looks like a path (contains / or \), resolve it directly
  if (handlerName.includes('/') || handlerName.includes('\\')) {
    const absPath = path.isAbsolute(handlerName)
      ? handlerName
      : path.resolve(WORKSPACE, handlerName);
    const candidate = absPath.endsWith('.js') ? absPath : `${absPath}.js`;
    if (fs.existsSync(candidate)) {
      try {
        delete require.cache[require.resolve(candidate)];
        const mod = require(candidate);
        if (typeof mod === 'function') return mod;
        if (mod && typeof mod.handle === 'function') return (event, rule, context) => mod.handle(event, rule, context);
        if (mod && typeof mod.execute === 'function') return (event, rule, context) => mod.execute(event, rule, context);
      } catch (err) {
        console.error(`[HandlerExecutor] Failed to load path handler ${handlerName}: ${err.message}`);
      }
    }
    // Fall through to short-name search using basename
    const baseName = path.basename(handlerName, '.js');
    return loadHandlerByShortName(baseName);
  }

  return loadHandlerByShortName(handlerName);
}

function loadHandlerByShortName(handlerName) {
  for (const dir of HANDLERS_DIRS) {
    const handlerPath = path.join(dir, `${handlerName}.js`);
    if (!fs.existsSync(handlerPath)) continue;

    try {
      delete require.cache[require.resolve(handlerPath)];
      const mod = require(handlerPath);

      if (typeof mod === 'function') return mod;

      if (mod && typeof mod.handle === 'function') {
        return (event, rule, context) => mod.handle(event, rule, context);
      }

      if (mod && typeof mod.execute === 'function') {
        return (event, rule, context) => mod.execute(event, rule, context);
      }

      console.warn(`[HandlerExecutor] ${handlerName}: no callable function found`);
      return null;
    } catch (err) {
      console.error(`[HandlerExecutor] Failed to load ${handlerName}: ${err.message}`);
      return null;
    }
  }

  return null;
}

function createNotifier() {
  const ALERTS_FILE = path.resolve(__dirname, '../../infrastructure/logs/alerts.jsonl');
  const NOTIFY_DIR = path.resolve(__dirname, '../../infrastructure/notifications');

  return function notify(channel, message, options = {}) {
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      channel: channel || 'feishu',
      message,
      severity: options.severity || 'info',
      source: options.source || 'handler',
      timestamp: new Date().toISOString(),
      delivered: false,
    };

    fs.mkdirSync(NOTIFY_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(NOTIFY_DIR, `${notification.id}.json`),
      JSON.stringify(notification, null, 2)
    );

    fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true });
    fs.appendFileSync(ALERTS_FILE, `${JSON.stringify(notification)}\n`);

    return notification;
  };
}

function createLogger(ruleId) {
  const prefix = ruleId ? `[Handler:${ruleId}]` : '[Handler]';
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

function buildContext(event, rule, options = {}) {
  return {
    bus: {
      emit: (type, payload, source) => bus.emit(type, payload, source || 'handler'),
    },
    notify: createNotifier(),
    workspace: '/root/.openclaw/workspace',
    dryRun: options.dryRun || false,
    logger: createLogger(rule && rule.id),
    rule,
    event,
  };
}

async function execute(handlerName, event, rule, options = {}) {
  const start = Date.now();
  const timeout = options.timeout || 30000;

  const handler = loadHandler(handlerName);
  if (!handler) {
    return { success: false, result: null, duration: 0, error: `handler not found: ${handlerName}` };
  }

  const context = buildContext(event, rule, options);

  try {
    const result = await Promise.race([
      Promise.resolve(handler(event, rule, context)),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`handler timeout after ${timeout}ms`)), timeout)),
    ]);

    return { success: true, result, duration: Date.now() - start };
  } catch (err) {
    return { success: false, result: null, duration: Date.now() - start, error: err.message };
  }
}

module.exports = {
  HANDLERS_DIRS,
  loadHandler,
  buildContext,
  execute,
};
