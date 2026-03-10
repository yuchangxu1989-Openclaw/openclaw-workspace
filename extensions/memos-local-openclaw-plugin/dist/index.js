"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPlugin = initPlugin;
const uuid_1 = require("uuid");
const config_1 = require("./config");
const sqlite_1 = require("./storage/sqlite");
const embedding_1 = require("./embedding");
const worker_1 = require("./ingest/worker");
const engine_1 = require("./recall/engine");
const capture_1 = require("./capture");
const tools_1 = require("./tools");
/**
 * Initialize the memos-local plugin.
 *
 * Typical usage inside OpenClaw plugin lifecycle:
 *
 * ```ts
 * import { initPlugin } from "@memos/local-openclaw";
 *
 * export default function activate(ctx) {
 *   const plugin = initPlugin({
 *     stateDir: ctx.stateDir,
 *     workspaceDir: ctx.workspaceDir,
 *     config: ctx.pluginConfig,
 *     log: ctx.log,
 *   });
 *   ctx.registerTools(plugin.tools);
 *   ctx.onConversationTurn((msgs, session) => {
 *     plugin.onConversationTurn(msgs, session);
 *   });
 *   ctx.onDeactivate(() => plugin.shutdown());
 * }
 * ```
 */
function initPlugin(opts = {}) {
    const stateDir = opts.stateDir ?? defaultStateDir();
    const workspaceDir = opts.workspaceDir ?? process.cwd();
    const ctx = (0, config_1.buildContext)(stateDir, workspaceDir, opts.config, opts.log);
    ctx.log.info("Initializing memos-local plugin...");
    const store = new sqlite_1.SqliteStore(ctx.config.storage.dbPath, ctx.log);
    const embedder = new embedding_1.Embedder(ctx.config.embedding, ctx.log);
    const worker = new worker_1.IngestWorker(store, embedder, ctx);
    const engine = new engine_1.RecallEngine(store, embedder, ctx);
    const tools = [
        (0, tools_1.createMemorySearchTool)(engine),
        (0, tools_1.createMemoryTimelineTool)(store),
        (0, tools_1.createMemoryGetTool)(store),
    ];
    ctx.log.info(`Plugin ready. DB: ${ctx.config.storage.dbPath}, Embedding: ${embedder.provider}`);
    return {
        id: "memos-local",
        tools,
        onConversationTurn(messages, sessionKey, owner) {
            const session = sessionKey ?? "default";
            const turnId = (0, uuid_1.v4)();
            const tag = ctx.config.capture?.evidenceWrapperTag ?? "STORED_MEMORY";
            const captured = (0, capture_1.captureMessages)(messages, session, turnId, tag, ctx.log, owner);
            if (captured.length > 0) {
                worker.enqueue(captured);
            }
        },
        async flush() {
            await worker.flush();
        },
        async shutdown() {
            ctx.log.info("Shutting down memos-local plugin...");
            await worker.flush();
            store.close();
        },
    };
}
function defaultStateDir() {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
    return `${home}/.openclaw`;
}
//# sourceMappingURL=index.js.map