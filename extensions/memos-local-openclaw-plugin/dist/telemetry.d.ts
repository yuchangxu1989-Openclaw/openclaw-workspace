/**
 * Telemetry module — anonymous usage analytics via PostHog.
 *
 * Privacy-first design:
 * - Enabled by default with anonymous data only; opt-out via TELEMETRY_ENABLED=false
 * - Uses a random anonymous ID persisted locally (no PII)
 * - Never sends memory content, queries, or any user data
 * - Only sends aggregate counts, tool names, latencies, and version info
 */
import type { Logger } from "./types";
export interface TelemetryConfig {
    enabled?: boolean;
    posthogApiKey?: string;
    posthogHost?: string;
}
export declare class Telemetry {
    private client;
    private distinctId;
    private enabled;
    private pluginVersion;
    private log;
    private dailyPingSent;
    private dailyPingDate;
    constructor(config: TelemetryConfig, stateDir: string, pluginVersion: string, log: Logger);
    private loadOrCreateAnonymousId;
    private capture;
    trackPluginStarted(embeddingProvider: string, summarizerProvider: string): void;
    trackToolCalled(toolName: string, latencyMs: number, success: boolean): void;
    trackMemoryIngested(chunkCount: number): void;
    trackSkillInstalled(skillName: string): void;
    trackSkillEvolved(skillName: string, upgradeType: string): void;
    trackViewerOpened(): void;
    trackAutoRecall(hitCount: number, latencyMs: number): void;
    private maybeSendDailyPing;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=telemetry.d.ts.map