import type { PluginContext } from "../types";
export interface ValidationResult {
    valid: boolean;
    qualityScore: number | null;
    errors: string[];
    warnings: string[];
    suggestions: string[];
}
export declare class SkillValidator {
    private ctx;
    constructor(ctx: PluginContext);
    /**
     * Format validation (no LLM needed) + optional LLM quality assessment.
     * Returns combined result with score 0-10.
     */
    validate(dirPath: string, opts?: {
        skipLLM?: boolean;
        previousContent?: string;
    }): Promise<ValidationResult>;
    private validateFormat;
    /**
     * Check that an upgrade doesn't lose significant content from the previous version.
     */
    private regressionCheck;
    private assessQuality;
}
//# sourceMappingURL=validator.d.ts.map