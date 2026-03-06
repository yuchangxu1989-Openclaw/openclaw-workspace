'use strict';

const { DispatchLayer } = require('./dispatch-layer');

function parseJsonArg(raw, fallback = {}) {
  if (!raw) return fallback;
  return JSON.parse(raw);
}

async function main() {
  const [command = 'tick', arg1, arg2] = process.argv.slice(2);
  const layer = new DispatchLayer();

  switch (command) {
    case 'enqueue': {
      const task = parseJsonArg(arg1);
      const result = layer.enqueue(task);
      console.log(JSON.stringify({ ok: true, command, result }, null, 2));
      return;
    }
    case 'dispatch': {
      const result = layer.dispatchNext();
      console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
      return;
    }
    case 'mark': {
      const taskId = arg1;
      const payload = parseJsonArg(arg2);
      const status = payload.status;
      if (!taskId || !status) throw new Error('mark requires taskId and {"status":"..."}');
      const patch = { ...payload };
      delete patch.status;
      const result = layer.markTask(taskId, status, patch);
      console.log(JSON.stringify({ ok: true, command, result }, null, 2));
      return;
    }
    case 'tick':
    default: {
      const result = layer.tick();
      console.log(JSON.stringify({ ok: true, command: 'tick', ...result }, null, 2));
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
