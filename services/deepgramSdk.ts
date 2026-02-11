/**
 * Base module – only exists so TypeScript can resolve `./deepgramSdk`.
 *
 * At build time Metro picks deepgramSdk.web.ts or deepgramSdk.native.ts
 * depending on the target platform.  This file is never actually used by
 * Metro but satisfies the TS compiler's module resolution.
 */

export const createClient: any = null;
export const LiveTranscriptionEvents: any = null;
