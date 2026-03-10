"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillEvolver = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vector_1 = require("../storage/vector");
const types_1 = require("../types");
const evaluator_1 = require("./evaluator");
const generator_1 = require("./generator");
const upgrader_1 = require("./upgrader");
const installer_1 = require("./installer");
const llm_call_1 = require("../shared/llm-call");
class SkillEvolver {
    store;
    engine;
    ctx;
    embedder;
    evaluator;
    generator;
    upgrader;
    installer;
    processing = false;
    queue = [];
    constructor(store, engine, ctx, embedder) {
        this.store = store;
        this.engine = engine;
        this.ctx = ctx;
        this.embedder = embedder;
        this.evaluator = new evaluator_1.SkillEvaluator(ctx);
        this.generator = new generator_1.SkillGenerator(store, engine, ctx, embedder);
        this.upgrader = new upgrader_1.SkillUpgrader(store, ctx);
        this.installer = new installer_1.SkillInstaller(store, ctx);
    }
    async recoverOrphanedTasks() {
        const orphaned = this.store.getTasksBySkillStatus(["queued", "generating"]);
        if (orphaned.length === 0)
            return 0;
        this.ctx.log.info(`SkillEvolver: recovering ${orphaned.length} orphaned tasks (queued/generating from previous run)`);
        for (const task of orphaned) {
            try {
                await this.processOne(task);
            }
            catch (err) {
                this.ctx.log.error(`SkillEvolver: recovery failed for task ${task.id}: ${err}`);
            }
        }
        return orphaned.length;
    }
    async onTaskCompleted(task) {
        const enabled = this.ctx.config.skillEvolution?.enabled ?? types_1.DEFAULTS.skillEvolutionEnabled;
        const autoEval = this.ctx.config.skillEvolution?.autoEvaluate ?? types_1.DEFAULTS.skillAutoEvaluate;
        if (!enabled || !autoEval)
            return;
        if (this.processing) {
            this.ctx.log.debug(`SkillEvolver: busy, queuing task ${task.id} (queue=${this.queue.length})`);
            this.store.setTaskSkillMeta(task.id, { skillStatus: "queued", skillReason: `排队中，前方还有 ${this.queue.length + 1} 个任务` });
            this.queue.push(task);
            return;
        }
        await this.drain(task);
    }
    async drain(task) {
        this.processing = true;
        try {
            await this.processOne(task);
            while (this.queue.length > 0) {
                const next = this.queue.shift();
                await this.processOne(next);
            }
        }
        finally {
            this.processing = false;
        }
    }
    async processOne(task) {
        try {
            await this.process(task);
        }
        catch (err) {
            this.ctx.log.error(`SkillEvolver error for task ${task.id}: ${err}`);
            this.store.setTaskSkillMeta(task.id, { skillStatus: "skipped", skillReason: `Error: ${err}` });
        }
    }
    async process(task) {
        const chunks = this.store.getChunksByTask(task.id);
        const { pass, skipReason } = this.evaluator.passesRuleFilter(chunks, task);
        if (!pass) {
            this.ctx.log.debug(`SkillEvolver: task ${task.id} skipped by rule filter: ${skipReason} (chunks=${chunks.length})`);
            this.store.setTaskSkillMeta(task.id, { skillStatus: "skipped", skillReason: skipReason });
            return;
        }
        const relatedSkill = await this.findRelatedSkill(task);
        if (relatedSkill) {
            await this.handleExistingSkill(task, chunks, relatedSkill);
        }
        else {
            await this.handleNewSkill(task, chunks);
        }
    }
    /** Max candidates to send to LLM for relevance judgment. */
    static RELATED_SKILL_CANDIDATE_TOP = 10;
    /**
     * Search for an existing skill that is HIGHLY related to the given task.
     *
     * 1. Collect top 50 skill candidates by FTS + vector similarity (relaxed thresholds).
     * 2. Call LLM with task title/summary and each skill's name/description; strict rule:
     *    only output ONE skill index if the task clearly belongs to that skill's domain;
     *    otherwise output 0 (do not force a match).
     */
    async findRelatedSkill(task) {
        const query = task.summary.slice(0, 600);
        const owner = task.owner ?? "agent:main";
        // Relaxed thresholds to gather a larger candidate pool; LLM will do strict filtering
        const VEC_FLOOR = 0.35;
        const TOP_N = SkillEvolver.RELATED_SKILL_CANDIDATE_TOP;
        const candidateMap = new Map();
        // 1. FTS on skill name + description (take more candidates)
        try {
            const ftsHits = this.store.skillFtsSearch(query, TOP_N, "mix", owner);
            for (const hit of ftsHits) {
                const skill = this.store.getSkill(hit.skillId);
                if (skill && (skill.status === "active" || skill.status === "draft")) {
                    candidateMap.set(skill.id, { skill, vecScore: 0, ftsScore: hit.score, combined: 0 });
                }
            }
        }
        catch (err) {
            this.ctx.log.warn(`SkillEvolver: skill FTS search failed: ${err}`);
        }
        // 2. Vector similarity: include all skills above a low floor to rank them
        if (this.embedder) {
            try {
                const queryVec = await this.embedder.embedQuery(query);
                const allSkillEmb = this.store.getSkillEmbeddings("mix", owner);
                for (const row of allSkillEmb) {
                    const sim = (0, vector_1.cosineSimilarity)(queryVec, row.vector);
                    if (sim >= VEC_FLOOR) {
                        const existing = candidateMap.get(row.skillId);
                        if (existing) {
                            existing.vecScore = sim;
                        }
                        else {
                            const skill = this.store.getSkill(row.skillId);
                            if (skill && (skill.status === "active" || skill.status === "draft")) {
                                candidateMap.set(skill.id, { skill, vecScore: sim, ftsScore: 0, combined: 0 });
                            }
                        }
                    }
                }
            }
            catch (err) {
                this.ctx.log.warn(`SkillEvolver: skill vector search failed: ${err}`);
            }
        }
        if (candidateMap.size === 0)
            return null;
        for (const c of candidateMap.values()) {
            c.combined = c.vecScore * 0.7 + c.ftsScore * 0.3;
        }
        const sorted = [...candidateMap.values()]
            .sort((a, b) => b.combined - a.combined)
            .slice(0, TOP_N);
        if (sorted.length === 0)
            return null;
        // 3. LLM strict relevance judgment: only one skill if HIGHLY related, else none
        const selectedSkill = await this.judgeSkillRelatedToTask(task, sorted);
        if (selectedSkill) {
            this.ctx.log.debug(`SkillEvolver: LLM selected related skill "${selectedSkill.name}" for task "${task.title}"`);
        }
        else {
            this.ctx.log.debug(`SkillEvolver: LLM found no highly related skill for task "${task.title}" (${sorted.length} candidates)`);
        }
        return selectedSkill;
    }
    /**
     * Ask LLM to pick at most ONE skill that is HIGHLY relevant to the task.
     * Strict rule: only return a skill if the task clearly belongs to that skill's domain; otherwise return null.
     */
    async judgeSkillRelatedToTask(task, candidates) {
        const chain = (0, llm_call_1.buildSkillConfigChain)(this.ctx);
        if (chain.length === 0) {
            this.ctx.log.warn("SkillEvolver: no LLM config available, skipping skill relevance judgment");
            return null;
        }
        const taskTitle = task.title || "(no title)";
        const taskSummary = task.summary.slice(0, 800);
        const skillList = candidates
            .map((c, i) => `${i + 1}. [${c.skill.name}]\n   ${(c.skill.description || "").slice(0, 300)}`)
            .join("\n\n");
        const prompt = `You are a strict judge: decide whether a completed TASK should be merged into an EXISTING SKILL. The task and the skill must be in the SAME domain/topic — e.g. same type of problem, same tool, same workflow. Loose or tangential relevance is NOT enough.

TASK TITLE: ${taskTitle}

TASK SUMMARY:
${taskSummary}

CANDIDATE SKILLS (index, name, description):
${skillList}

RULES:
- Output exactly ONE skill index (1 to ${candidates.length}) ONLY if the task's experience clearly belongs to that skill's domain. Same topic, same kind of work.
- If no skill is clearly relevant (different domain, or only loosely related), output 0. When in doubt, output 0.
- Do not force a match. "Movie recommendation" task must not match "Weather query" or "Legal discussion" skill even if both exist in the list.

LANGUAGE RULE: "reason" MUST use the SAME language as the task title/summary. Chinese input → Chinese reason.

Reply with JSON only, no other text:
{"selectedIndex": 0, "reason": "brief explanation (same language as input)"}
Use selectedIndex 0 when none is highly relevant.`;
        try {
            const raw = await (0, llm_call_1.callLLMWithFallback)(chain, prompt, this.ctx.log, "SkillEvolver.judgeRelated", { temperature: 0, maxTokens: 256 });
            const parsed = this.parseJudgeSkillResult(raw, candidates.length);
            if (parsed.selectedIndex >= 1 && parsed.selectedIndex <= candidates.length) {
                return candidates[parsed.selectedIndex - 1].skill;
            }
            return null;
        }
        catch (err) {
            this.ctx.log.warn(`SkillEvolver: LLM skill relevance judgment failed: ${err}`);
            return null;
        }
    }
    parseJudgeSkillResult(raw, maxIndex) {
        const fallback = { selectedIndex: 0, reason: "parse failed" };
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match)
            return fallback;
        try {
            const obj = JSON.parse(match[0]);
            const idx = typeof obj.selectedIndex === "number" ? obj.selectedIndex : 0;
            const reason = typeof obj.reason === "string" ? obj.reason : "";
            if (idx < 0 || idx > maxIndex)
                return { selectedIndex: 0, reason: reason || "out of range" };
            return { selectedIndex: idx, reason };
        }
        catch {
            return fallback;
        }
    }
    async handleExistingSkill(task, chunks, skill) {
        // Verify skill still exists in DB (may have been manually deleted)
        const freshSkill = this.store.getSkill(skill.id);
        if (!freshSkill) {
            this.ctx.log.warn(`SkillEvolver: skill "${skill.name}" (${skill.id}) no longer exists, treating as new`);
            await this.handleNewSkill(task, chunks);
            return;
        }
        const skillContent = this.readSkillContent(freshSkill);
        if (!skillContent) {
            this.ctx.log.warn(`SkillEvolver: cannot read skill "${freshSkill.name}" content, treating as new`);
            await this.handleNewSkill(task, chunks);
            return;
        }
        const minConfidence = this.ctx.config.skillEvolution?.minConfidence ?? types_1.DEFAULTS.skillMinConfidence;
        const evalResult = await this.evaluator.evaluateUpgrade(task, freshSkill, skillContent);
        if (evalResult.shouldUpgrade && evalResult.confidence >= minConfidence) {
            this.ctx.log.info(`SkillEvolver: upgrading skill "${freshSkill.name}" — ${evalResult.reason}`);
            const { upgraded } = await this.upgrader.upgrade(task, freshSkill, evalResult);
            this.markChunksWithSkill(chunks, freshSkill.id);
            if (upgraded) {
                this.store.linkTaskSkill(task.id, freshSkill.id, "evolved_from", freshSkill.version + 1);
                this.installer.syncIfInstalled(freshSkill.name);
            }
            else {
                this.store.linkTaskSkill(task.id, freshSkill.id, "applied_to", freshSkill.version);
            }
        }
        else if (evalResult.confidence < 0.3) {
            this.ctx.log.info(`SkillEvolver: skill "${freshSkill.name}" has low relevance (confidence=${evalResult.confidence}), ` +
                `falling back to new skill evaluation for task "${task.title}"`);
            await this.handleNewSkill(task, chunks);
        }
        else {
            this.ctx.log.debug(`SkillEvolver: skill "${freshSkill.name}" not worth upgrading (confidence=${evalResult.confidence})`);
            this.markChunksWithSkill(chunks, freshSkill.id);
            this.store.linkTaskSkill(task.id, freshSkill.id, "applied_to", freshSkill.version);
        }
    }
    async handleNewSkill(task, chunks) {
        const minConfidence = this.ctx.config.skillEvolution?.minConfidence ?? types_1.DEFAULTS.skillMinConfidence;
        const evalResult = await this.evaluator.evaluateCreate(task);
        if (evalResult.shouldGenerate && evalResult.confidence >= minConfidence) {
            this.ctx.log.info(`SkillEvolver: generating new skill "${evalResult.suggestedName}" — ${evalResult.reason}`);
            this.store.setTaskSkillMeta(task.id, { skillStatus: "generating", skillReason: evalResult.reason });
            const skill = await this.generator.generate(task, chunks, evalResult);
            this.markChunksWithSkill(chunks, skill.id);
            this.store.linkTaskSkill(task.id, skill.id, "generated_from", 1);
            this.store.setTaskSkillMeta(task.id, { skillStatus: "generated", skillReason: evalResult.reason });
            const autoInstall = this.ctx.config.skillEvolution?.autoInstall ?? types_1.DEFAULTS.skillAutoInstall;
            if (autoInstall && skill.status === "active") {
                this.installer.install(skill.id);
            }
        }
        else {
            const reason = evalResult.reason || `confidence不足 (${evalResult.confidence} < ${minConfidence})`;
            this.ctx.log.debug(`SkillEvolver: task "${task.title}" not worth generating skill — ${reason}`);
            this.store.setTaskSkillMeta(task.id, { skillStatus: "not_generated", skillReason: reason });
        }
    }
    markChunksWithSkill(chunks, skillId) {
        for (const chunk of chunks) {
            this.store.setChunkSkillId(chunk.id, skillId);
        }
        this.ctx.log.debug(`SkillEvolver: marked ${chunks.length} chunks with skill_id=${skillId}`);
    }
    readSkillContent(skill) {
        const filePath = path.join(skill.dirPath, "SKILL.md");
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, "utf-8");
            }
        }
        catch { /* fall through */ }
        const sv = this.store.getLatestSkillVersion(skill.id);
        return sv?.content ?? null;
    }
}
exports.SkillEvolver = SkillEvolver;
//# sourceMappingURL=evolver.js.map