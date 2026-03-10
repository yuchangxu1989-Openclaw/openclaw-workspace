import { type MemosLocalConfig, type PluginContext, type Logger } from "./types";
export declare function resolveConfig(raw: Partial<MemosLocalConfig> | undefined, stateDir: string): MemosLocalConfig;
export declare function buildContext(stateDir: string, workspaceDir: string, rawConfig: Partial<MemosLocalConfig> | undefined, log?: Logger): PluginContext;
//# sourceMappingURL=config.d.ts.map