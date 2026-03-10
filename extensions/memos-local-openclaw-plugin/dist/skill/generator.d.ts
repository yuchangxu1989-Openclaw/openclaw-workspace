import type { SqliteStore } from "../storage/sqlite";
import type { RecallEngine } from "../recall/engine";
import type { Embedder } from "../embedding";
import type { Chunk, Task, Skill, PluginContext } from "../types";
import type { CreateEvalResult } from "./evaluator";
export declare class SkillGenerator {
    private store;
    private engine;
    private ctx;
    private validator;
    private embedder;
    constructor(store: SqliteStore, engine: RecallEngine, ctx: PluginContext, embedder?: Embedder);
    generate(task: Task, chunks: Chunk[], evalResult: CreateEvalResult): Promise<Skill>;
    private detectLanguage;
    private step1GenerateSkillMd;
    private step2ExtractScripts;
    private step2bExtractReferences;
    private step3GenerateEvals;
    private verifyEvals;
    private parseJSONArray;
    private buildConversationText;
    private parseDescription;
}
//# sourceMappingURL=generator.d.ts.map