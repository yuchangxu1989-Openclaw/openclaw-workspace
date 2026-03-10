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
exports.Summarizer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const openai_1 = require("./openai");
const anthropic_1 = require("./anthropic");
const gemini_1 = require("./gemini");
const bedrock_1 = require("./bedrock");
/**
 * Build a SummarizerConfig from OpenClaw's native model configuration (openclaw.json).
 * This serves as the final fallback when both strongCfg and plugin summarizer fail or are absent.
 */
function loadOpenClawFallbackConfig(log) {
    try {
        const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
        const cfgPath = path.join(home, ".openclaw", "openclaw.json");
        if (!fs.existsSync(cfgPath))
            return undefined;
        const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
        const agentModel = raw?.agents?.defaults?.model?.primary;
        if (!agentModel)
            return undefined;
        const [providerKey, modelId] = agentModel.includes("/")
            ? agentModel.split("/", 2)
            : [undefined, agentModel];
        const providerCfg = providerKey
            ? raw?.models?.providers?.[providerKey]
            : Object.values(raw?.models?.providers ?? {})[0];
        if (!providerCfg)
            return undefined;
        const baseUrl = providerCfg.baseUrl;
        const apiKey = providerCfg.apiKey;
        if (!baseUrl || !apiKey)
            return undefined;
        const endpoint = baseUrl.endsWith("/chat/completions")
            ? baseUrl
            : baseUrl.replace(/\/+$/, "") + "/chat/completions";
        log.debug(`OpenClaw fallback model: ${modelId} via ${baseUrl}`);
        return {
            provider: "openai_compatible",
            endpoint,
            apiKey,
            model: modelId,
        };
    }
    catch (err) {
        log.debug(`Failed to load OpenClaw fallback config: ${err}`);
        return undefined;
    }
}
class Summarizer {
    cfg;
    log;
    strongCfg;
    fallbackCfg;
    constructor(cfg, log, strongCfg) {
        this.cfg = cfg;
        this.log = log;
        this.strongCfg = strongCfg;
        this.fallbackCfg = loadOpenClawFallbackConfig(log);
    }
    /**
     * Ordered config chain: strongCfg → cfg → fallbackCfg (OpenClaw native model).
     * Returns configs that are defined, in priority order.
     */
    getConfigChain() {
        const chain = [];
        if (this.strongCfg)
            chain.push(this.strongCfg);
        if (this.cfg)
            chain.push(this.cfg);
        if (this.fallbackCfg)
            chain.push(this.fallbackCfg);
        return chain;
    }
    /**
     * Try calling fn with each config in the chain until one succeeds.
     * Returns undefined if all fail.
     */
    async tryChain(label, fn) {
        const chain = this.getConfigChain();
        for (let i = 0; i < chain.length; i++) {
            try {
                return await fn(chain[i]);
            }
            catch (err) {
                const level = i < chain.length - 1 ? "warn" : "error";
                const modelInfo = `${chain[i].provider}/${chain[i].model ?? "?"}`;
                this.log[level](`${label} failed (${modelInfo}), ${i < chain.length - 1 ? "trying next" : "no more fallbacks"}: ${err}`);
            }
        }
        return undefined;
    }
    async summarize(text) {
        if (!this.cfg && !this.fallbackCfg) {
            return ruleFallback(text);
        }
        const result = await this.tryChain("summarize", (cfg) => callSummarize(cfg, text, this.log));
        return result ?? ruleFallback(text);
    }
    async summarizeTask(text) {
        if (!this.cfg && !this.fallbackCfg) {
            return taskFallback(text);
        }
        const result = await this.tryChain("summarizeTask", (cfg) => callSummarizeTask(cfg, text, this.log));
        return result ?? taskFallback(text);
    }
    async judgeNewTopic(currentContext, newMessage) {
        if (!this.cfg && !this.fallbackCfg)
            return null;
        const result = await this.tryChain("judgeNewTopic", (cfg) => callTopicJudge(cfg, currentContext, newMessage, this.log));
        return result ?? null;
    }
    async filterRelevant(query, candidates) {
        if (!this.cfg && !this.fallbackCfg)
            return null;
        if (candidates.length === 0)
            return { relevant: [], sufficient: true };
        const result = await this.tryChain("filterRelevant", (cfg) => callFilterRelevant(cfg, query, candidates, this.log));
        return result ?? null;
    }
    async judgeDedup(newSummary, candidates) {
        if (!this.cfg && !this.fallbackCfg)
            return null;
        if (candidates.length === 0)
            return null;
        const result = await this.tryChain("judgeDedup", (cfg) => callJudgeDedup(cfg, newSummary, candidates, this.log));
        return result ?? { action: "NEW", reason: "all_models_failed" };
    }
    getStrongConfig() {
        return this.strongCfg;
    }
}
exports.Summarizer = Summarizer;
// ─── Dispatch helpers ───
function callSummarize(cfg, text, log) {
    switch (cfg.provider) {
        case "openai":
        case "openai_compatible":
        case "azure_openai":
            return (0, openai_1.summarizeOpenAI)(text, cfg, log);
        case "anthropic":
            return (0, anthropic_1.summarizeAnthropic)(text, cfg, log);
        case "gemini":
            return (0, gemini_1.summarizeGemini)(text, cfg, log);
        case "bedrock":
            return (0, bedrock_1.summarizeBedrock)(text, cfg, log);
        default:
            throw new Error(`Unknown summarizer provider: ${cfg.provider}`);
    }
}
function callSummarizeTask(cfg, text, log) {
    switch (cfg.provider) {
        case "openai":
        case "openai_compatible":
        case "azure_openai":
            return (0, openai_1.summarizeTaskOpenAI)(text, cfg, log);
        case "anthropic":
            return (0, anthropic_1.summarizeTaskAnthropic)(text, cfg, log);
        case "gemini":
            return (0, gemini_1.summarizeTaskGemini)(text, cfg, log);
        case "bedrock":
            return (0, bedrock_1.summarizeTaskBedrock)(text, cfg, log);
        default:
            throw new Error(`Unknown summarizer provider: ${cfg.provider}`);
    }
}
function callTopicJudge(cfg, currentContext, newMessage, log) {
    switch (cfg.provider) {
        case "openai":
        case "openai_compatible":
        case "azure_openai":
            return (0, openai_1.judgeNewTopicOpenAI)(currentContext, newMessage, cfg, log);
        case "anthropic":
            return (0, anthropic_1.judgeNewTopicAnthropic)(currentContext, newMessage, cfg, log);
        case "gemini":
            return (0, gemini_1.judgeNewTopicGemini)(currentContext, newMessage, cfg, log);
        case "bedrock":
            return (0, bedrock_1.judgeNewTopicBedrock)(currentContext, newMessage, cfg, log);
        default:
            throw new Error(`Unknown summarizer provider: ${cfg.provider}`);
    }
}
function callFilterRelevant(cfg, query, candidates, log) {
    switch (cfg.provider) {
        case "openai":
        case "openai_compatible":
        case "azure_openai":
            return (0, openai_1.filterRelevantOpenAI)(query, candidates, cfg, log);
        case "anthropic":
            return (0, anthropic_1.filterRelevantAnthropic)(query, candidates, cfg, log);
        case "gemini":
            return (0, gemini_1.filterRelevantGemini)(query, candidates, cfg, log);
        case "bedrock":
            return (0, bedrock_1.filterRelevantBedrock)(query, candidates, cfg, log);
        default:
            throw new Error(`Unknown summarizer provider: ${cfg.provider}`);
    }
}
function callJudgeDedup(cfg, newSummary, candidates, log) {
    switch (cfg.provider) {
        case "openai":
        case "openai_compatible":
        case "azure_openai":
            return (0, openai_1.judgeDedupOpenAI)(newSummary, candidates, cfg, log);
        case "anthropic":
            return (0, anthropic_1.judgeDedupAnthropic)(newSummary, candidates, cfg, log);
        case "gemini":
            return (0, gemini_1.judgeDedupGemini)(newSummary, candidates, cfg, log);
        case "bedrock":
            return (0, bedrock_1.judgeDedupBedrock)(newSummary, candidates, cfg, log);
        default:
            throw new Error(`Unknown summarizer provider: ${cfg.provider}`);
    }
}
// ─── Fallbacks ───
function taskFallback(text) {
    const lines = text.split("\n").filter((l) => l.trim().length > 10);
    return lines.slice(0, 30).join("\n").slice(0, 2000);
}
function ruleFallback(text) {
    const lines = text.split("\n").filter((l) => l.trim().length > 10);
    const first = (lines[0] ?? text).trim();
    const entityRe = [/`[^`]+`/g, /\b(?:error|Error|ERROR)\s*[:：]\s*.{5,60}/g];
    const entities = [];
    for (const re of entityRe) {
        for (const m of text.matchAll(re)) {
            if (entities.length < 3)
                entities.push(m[0].slice(0, 50));
        }
    }
    let summary = first.length > 120 ? first.slice(0, 117) + "..." : first;
    if (entities.length > 0) {
        summary += ` (${entities.join(", ")})`;
    }
    return summary.slice(0, 200);
}
//# sourceMappingURL=index.js.map