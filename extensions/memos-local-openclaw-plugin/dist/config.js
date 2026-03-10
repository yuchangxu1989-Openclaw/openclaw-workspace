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
exports.resolveConfig = resolveConfig;
exports.buildContext = buildContext;
const path = __importStar(require("path"));
const types_1 = require("./types");
const ENV_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
function resolveEnvVars(value) {
    return value.replace(ENV_RE, (_, name) => process.env[name] ?? "");
}
function deepResolveEnv(obj) {
    if (typeof obj === "string")
        return resolveEnvVars(obj);
    if (Array.isArray(obj))
        return obj.map(deepResolveEnv);
    if (obj && typeof obj === "object") {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = deepResolveEnv(v);
        }
        return out;
    }
    return obj;
}
function resolveConfig(raw, stateDir) {
    const cfg = deepResolveEnv(raw ?? {});
    const telemetryEnvVar = process.env.TELEMETRY_ENABLED;
    const telemetryEnabled = cfg.telemetry?.enabled ??
        (telemetryEnvVar === "false" || telemetryEnvVar === "0" ? false : true);
    return {
        ...cfg,
        storage: {
            dbPath: cfg.storage?.dbPath ?? path.join(stateDir, "memos-local", "memos.db"),
        },
        recall: {
            maxResultsDefault: cfg.recall?.maxResultsDefault ?? types_1.DEFAULTS.maxResultsDefault,
            maxResultsMax: cfg.recall?.maxResultsMax ?? types_1.DEFAULTS.maxResultsMax,
            minScoreDefault: cfg.recall?.minScoreDefault ?? types_1.DEFAULTS.minScoreDefault,
            minScoreFloor: cfg.recall?.minScoreFloor ?? types_1.DEFAULTS.minScoreFloor,
            rrfK: cfg.recall?.rrfK ?? types_1.DEFAULTS.rrfK,
            mmrLambda: cfg.recall?.mmrLambda ?? types_1.DEFAULTS.mmrLambda,
            recencyHalfLifeDays: cfg.recall?.recencyHalfLifeDays ?? types_1.DEFAULTS.recencyHalfLifeDays,
            vectorSearchMaxChunks: cfg.recall?.vectorSearchMaxChunks ?? types_1.DEFAULTS.vectorSearchMaxChunks,
        },
        dedup: {
            similarityThreshold: cfg.dedup?.similarityThreshold ?? types_1.DEFAULTS.dedupSimilarityThreshold,
        },
        capture: {
            evidenceWrapperTag: cfg.capture?.evidenceWrapperTag ?? types_1.DEFAULTS.evidenceWrapperTag,
        },
        telemetry: {
            enabled: telemetryEnabled,
            posthogApiKey: cfg.telemetry?.posthogApiKey ?? process.env.POSTHOG_API_KEY ?? "",
            posthogHost: cfg.telemetry?.posthogHost ?? process.env.POSTHOG_HOST ?? "",
        },
    };
}
function buildContext(stateDir, workspaceDir, rawConfig, log) {
    const defaultLog = {
        debug: (...args) => console.debug("[memos-local]", ...args),
        info: (...args) => console.info("[memos-local]", ...args),
        warn: (...args) => console.warn("[memos-local]", ...args),
        error: (...args) => console.error("[memos-local]", ...args),
    };
    return {
        stateDir,
        workspaceDir,
        config: resolveConfig(rawConfig, stateDir),
        log: log ?? defaultLog,
    };
}
//# sourceMappingURL=config.js.map