import type { SqliteStore } from "../storage/sqlite";
import type { PluginContext } from "../types";
export declare class SkillInstaller {
    private store;
    private ctx;
    private workspaceSkillsDir;
    constructor(store: SqliteStore, ctx: PluginContext);
    install(skillId: string): {
        installed: boolean;
        path: string;
        message: string;
    };
    uninstall(skillId: string): void;
    syncIfInstalled(skillName: string): void;
}
//# sourceMappingURL=installer.d.ts.map