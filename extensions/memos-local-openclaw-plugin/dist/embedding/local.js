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
exports.embedLocal = embedLocal;
const types_1 = require("../types");
let extractorPromise = null;
function getExtractor(log) {
    if (extractorPromise)
        return extractorPromise;
    extractorPromise = (async () => {
        log.info("Loading local embedding model (first call may download ~23MB)...");
        const { pipeline } = await Promise.resolve().then(() => __importStar(require("@huggingface/transformers")));
        const ext = await pipeline("feature-extraction", types_1.DEFAULTS.localEmbeddingModel, {
            dtype: "q8",
            device: "cpu",
        });
        log.info("Local embedding model ready");
        return ext;
    })().catch((err) => {
        extractorPromise = null;
        throw err;
    });
    return extractorPromise;
}
async function embedLocal(texts, log) {
    const ext = await getExtractor(log);
    const results = [];
    for (const text of texts) {
        const output = await ext(text, { pooling: "mean", normalize: true });
        results.push(Array.from(output.data).slice(0, types_1.DEFAULTS.localEmbeddingDimensions));
    }
    return results;
}
//# sourceMappingURL=local.js.map