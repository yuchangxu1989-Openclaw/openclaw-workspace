import type { SqliteStore } from "../storage/sqlite";
import type { Task, Skill, PluginContext } from "../types";
import type { UpgradeEvalResult } from "./evaluator";
export declare class SkillUpgrader {
    private store;
    private ctx;
    private validator;
    constructor(store: SqliteStore, ctx: PluginContext);
    upgrade(task: Task, skill: Skill, evalResult: UpgradeEvalResult): Promise<{
        upgraded: boolean;
        qualityScore: number | null;
    }>;
    private readCurrentContent;
    private callUpgradeLLM;
    private parseDescription;
}
//# sourceMappingURL=upgrader.d.ts.map