import type { SqliteStore } from "../storage/sqlite";
import type { Embedder } from "../embedding";
import type { PluginContext, SearchResult, SkillSearchHit } from "../types";
export type SkillSearchScope = "mix" | "self" | "public";
export interface RecallOptions {
    query?: string;
    maxResults?: number;
    minScore?: number;
    role?: string;
    ownerFilter?: string[];
}
export declare class RecallEngine {
    private store;
    private embedder;
    private ctx;
    private recentQueries;
    constructor(store: SqliteStore, embedder: Embedder, ctx: PluginContext);
    search(opts: RecallOptions): Promise<SearchResult>;
    /**
     * PRD §6.1: Detect repeated identical/similar queries and produce a
     * warning note so the model knows to vary its approach.
     */
    private checkRepeat;
    private recordQuery;
    searchSkills(query: string, scope: SkillSearchScope, currentOwner: string): Promise<SkillSearchHit[]>;
    private judgeSkillRelevance;
}
//# sourceMappingURL=engine.d.ts.map