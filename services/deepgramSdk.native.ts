/**
 * Native stub – the Deepgram SDK is NOT available on iOS / Android
 * because it depends on Node.js built-ins (stream, http, crypto).
 *
 * Metro picks this file on native (because of the .native.ts extension),
 * so the SDK is never bundled for native targets.
 */

export const createClient = null;
export const LiveTranscriptionEvents = null;
