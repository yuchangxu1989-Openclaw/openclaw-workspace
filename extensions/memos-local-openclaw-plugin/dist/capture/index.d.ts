import type { ConversationMessage, Logger } from "../types";
/**
 * Extract writable messages from a conversation turn.
 *
 * Stores the user's actual text — strips only OpenClaw's injected metadata
 * prefixes (Sender info, conversation context, etc.) which are not user content.
 * Only skips: system prompts and our own memory tool results (prevents loop).
 */
export declare function captureMessages(messages: Array<{
    role: string;
    content: string;
    toolName?: string;
}>, sessionKey: string, turnId: string, evidenceTag: string, log: Logger, owner?: string): ConversationMessage[];
/**
 * Strip OpenClaw-injected inbound metadata blocks from user messages.
 *
 * These blocks have the shape:
 *   Sender (untrusted metadata):
 *   ```json
 *   { "label": "...", "id": "..." }
 *   ```
 *
 * Also strips the envelope timestamp prefix like "[Tue 2026-03-03 21:58 GMT+8] "
 */
export declare function stripInboundMetadata(text: string): string;
//# sourceMappingURL=index.d.ts.map