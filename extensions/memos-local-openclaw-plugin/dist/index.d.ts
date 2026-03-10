import type { MemosLocalConfig, ToolDefinition, Logger } from "./types";
export interface MemosLocalPlugin {
    id: string;
    tools: ToolDefinition[];
    onConversationTurn: (messages: Array<{
        role: string;
        content: string;
    }>, sessionKey?: string, owner?: string) => void;
    /** Wait for all pending ingest operations to complete. */
    flush: () => Promise<void>;
    shutdown: () => Promise<void>;
}
export interface PluginInitOptions {
    stateDir?: string;
    workspaceDir?: string;
    config?: Partial<MemosLocalConfig>;
    log?: Logger;
}
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
export declare function initPlugin(opts?: PluginInitOptions): MemosLocalPlugin;
export type { MemosLocalConfig, ToolDefinition, SearchResult, SearchHit, TimelineResult, GetResult } from "./types";
//# sourceMappingURL=index.d.ts.map