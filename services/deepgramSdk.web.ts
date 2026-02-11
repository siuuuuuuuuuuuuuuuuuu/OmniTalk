/**
 * Web-only Deepgram SDK re-export.
 *
 * Metro picks this file on web (because of the .web.ts extension),
 * so the SDK and its Node.js deps are only bundled for the web target.
 */

export { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

