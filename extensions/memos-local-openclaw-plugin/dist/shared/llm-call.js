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
exports.loadOpenClawFallbackConfig = loadOpenClawFallbackConfig;
exports.buildSkillConfigChain = buildSkillConfigChain;
exports.callLLMOnce = callLLMOnce;
exports.callLLMWithFallback = callLLMWithFallback;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Build a SummarizerConfig from OpenClaw's native model configuration (openclaw.json).
 * Final fallback when both strongCfg and plugin summarizer fail or are absent.
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
/**
 * Build the ordered fallback chain for skill-related LLM calls:
 *   skillEvolution.summarizer → plugin summarizer → OpenClaw native model
 */
function buildSkillConfigChain(ctx) {
    const chain = [];
    const skillCfg = ctx.config.skillEvolution?.summarizer;
    const pluginCfg = ctx.config.summarizer;
    const fallbackCfg = loadOpenClawFallbackConfig(ctx.log);
    if (skillCfg)
        chain.push(skillCfg);
    if (pluginCfg && pluginCfg !== skillCfg)
        chain.push(pluginCfg);
    if (fallbackCfg)
        chain.push(fallbackCfg);
    return chain;
}
function normalizeEndpoint(url) {
    const stripped = url.replace(/\/+$/, "");
    if (stripped.endsWith("/chat/completions"))
        return stripped;
    if (stripped.endsWith("/completions"))
        return stripped;
    return `${stripped}/chat/completions`;
}
/**
 * Make a single LLM call with the given config. Throws on failure.
 */
async function callLLMOnce(cfg, prompt, opts = {}) {
    const endpoint = normalizeEndpoint(cfg.endpoint ?? "https://api.openai.com/v1/chat/completions");
    const model = cfg.model ?? "gpt-4o-mini";
    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers,
    };
    const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            temperature: opts.temperature ?? 0.1,
            max_tokens: opts.maxTokens ?? 1024,
            messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`LLM call failed (${resp.status}): ${body}`);
    }
    const json = (await resp.json());
    return json.choices[0]?.message?.content?.trim() ?? "";
}
/**
 * Call LLM with fallback chain: tries each config in order until one succeeds.
 * Returns the result string, or throws if ALL configs fail.
 */
async function callLLMWithFallback(chain, prompt, log, label, opts = {}) {
    if (chain.length === 0) {
        throw new Error(`${label}: no LLM config available`);
    }
    for (let i = 0; i < chain.length; i++) {
        try {
            return await callLLMOnce(chain[i], prompt, opts);
        }
        catch (err) {
            const modelInfo = `${chain[i].provider ?? "?"}/${chain[i].model ?? "?"}`;
            if (i < chain.length - 1) {
                log.warn(`${label} failed (${modelInfo}), trying next fallback: ${err}`);
            }
            else {
                log.error(`${label} failed (${modelInfo}), no more fallbacks: ${err}`);
                throw err;
            }
        }
    }
    throw new Error(`${label}: all models failed`);
}
//# sourceMappingURL=llm-call.js.map