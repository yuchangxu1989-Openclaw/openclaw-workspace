import type { Chunk, Task, Skill, PluginContext } from "../types";
export interface CreateEvalResult {
    shouldGenerate: boolean;
    reason: string;
    suggestedName: string;
    suggestedTags: string[];
    confidence: number;
}
export interface UpgradeEvalResult {
    shouldUpgrade: boolean;
    upgradeType: "refine" | "extend" | "fix";
    dimensions: string[];
    reason: string;
    mergeStrategy: string;
    confidence: number;
}
export declare class SkillEvaluator {
    private ctx;
    constructor(ctx: PluginContext);
    passesRuleFilter(chunks: Chunk[], task: Task): {
        pass: boolean;
        skipReason: string;
    };
    evaluateCreate(task: Task): Promise<CreateEvalResult>;
    evaluateUpgrade(task: Task, skill: Skill, skillContent: string): Promise<UpgradeEvalResult>;
    private parseJSON;
}
//# sourceMappingURL=evaluator.d.ts.map