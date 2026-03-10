"use strict";
/**
 * Telemetry module — anonymous usage analytics via PostHog.
 *
 * Privacy-first design:
 * - Enabled by default with anonymous data only; opt-out via TELEMETRY_ENABLED=false
 * - Uses a random anonymous ID persisted locally (no PII)
 * - Never sends memory content, queries, or any user data
 * - Only sends aggregate counts, tool names, latencies, and version info
 */
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
exports.Telemetry = void 0;
const posthog_node_1 = require("posthog-node");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const uuid_1 = require("uuid");
const DEFAULT_POSTHOG_API_KEY = "phc_7lae6UC5jyImDefX6uub7zCxWyswCGNoBifCKqjvDrI";
const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";
class Telemetry {
    client = null;
    distinctId;
    enabled;
    pluginVersion;
    log;
    dailyPingSent = false;
    dailyPingDate = "";
    constructor(config, stateDir, pluginVersion, log) {
        this.log = log;
        this.pluginVersion = pluginVersion;
        this.enabled = config.enabled !== false;
        this.distinctId = this.loadOrCreateAnonymousId(stateDir);
        if (!this.enabled) {
            this.log.debug("Telemetry disabled (opt-out via TELEMETRY_ENABLED=false)");
            return;
        }
        const apiKey = config.posthogApiKey || DEFAULT_POSTHOG_API_KEY;
        try {
            this.client = new posthog_node_1.PostHog(apiKey, {
                host: config.posthogHost || DEFAULT_POSTHOG_HOST,
                flushAt: 10,
                flushInterval: 30_000,
            });
            this.log.debug("Telemetry initialized (PostHog)");
        }
        catch (err) {
            this.log.warn(`Telemetry init failed: ${err}`);
            this.enabled = false;
        }
    }
    loadOrCreateAnonymousId(stateDir) {
        const newDir = path.join(stateDir, "memos-local");
        const oldDir = path.join(stateDir, "memos-lite");
        const idFile = path.join(newDir, ".anonymous-id");
        const oldIdFile = path.join(oldDir, ".anonymous-id");
        try {
            const existing = fs.readFileSync(idFile, "utf-8").trim();
            if (existing.length > 10)
                return existing;
        }
        catch { }
        try {
            const existing = fs.readFileSync(oldIdFile, "utf-8").trim();
            if (existing.length > 10)
                return existing;
        }
        catch { }
        const newId = (0, uuid_1.v4)();
        try {
            fs.mkdirSync(path.dirname(idFile), { recursive: true });
            fs.writeFileSync(idFile, newId, "utf-8");
        }
        catch { }
        return newId;
    }
    capture(event, properties) {
        if (!this.enabled || !this.client)
            return;
        try {
            this.client.capture({
                distinctId: this.distinctId,
                event,
                properties: {
                    plugin_version: this.pluginVersion,
                    os: os.platform(),
                    os_version: os.release(),
                    node_version: process.version,
                    arch: os.arch(),
                    ...properties,
                },
            });
        }
        catch {
            // best-effort, never throw
        }
    }
    // ─── Public event methods ───
    trackPluginStarted(embeddingProvider, summarizerProvider) {
        this.capture("plugin_started", {
            embedding_provider: embeddingProvider,
            summarizer_provider: summarizerProvider,
        });
        this.maybeSendDailyPing();
    }
    trackToolCalled(toolName, latencyMs, success) {
        this.capture(toolName, {
            latency_ms: Math.round(latencyMs),
            success,
        });
    }
    trackMemoryIngested(chunkCount) {
        this.capture("memory_ingested", {
            chunk_count: chunkCount,
        });
    }
    trackSkillInstalled(skillName) {
        this.capture("skill_installed", {
            skill_name: skillName,
        });
    }
    trackSkillEvolved(skillName, upgradeType) {
        this.capture("skill_evolved", {
            skill_name: skillName,
            upgrade_type: upgradeType,
        });
    }
    trackViewerOpened() {
        this.capture("viewer_opened");
    }
    trackAutoRecall(hitCount, latencyMs) {
        this.capture("memory_search", {
            auto: true,
            hit_count: hitCount,
            latency_ms: Math.round(latencyMs),
        });
    }
    maybeSendDailyPing() {
        const today = new Date().toISOString().slice(0, 10);
        if (this.dailyPingSent && this.dailyPingDate === today)
            return;
        this.dailyPingSent = true;
        this.dailyPingDate = today;
        this.capture("daily_active");
    }
    async shutdown() {
        if (this.client) {
            try {
                await this.client.shutdown();
            }
            catch { }
        }
    }
}
exports.Telemetry = Telemetry;
//# sourceMappingURL=telemetry.js.map