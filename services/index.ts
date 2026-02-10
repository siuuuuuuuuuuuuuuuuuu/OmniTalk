/**
 * Services Index
 * Re-export all services for easy imports
 */

export {
    SpeechToTextService,
    createSpeechToTextService,
    useSpeechToTextConfig
} from "./speechToText";
export type {
    SpeechToTextCallbacks, SpeechToTextConfig, TranscriptionResult
} from "./speechToText";

export {
    SignToTextService,
    createSignToTextService,
    getSupportedLanguages
} from "./signToText";
export type { SignToTextCallbacks, SignToTextConfig } from "./signToText";

export {
    RealtimeSocketService,
    createRealtimeSocketService
} from "./RealtimeSocket";
export type {
    RealtimeSocketCallbacks, RealtimeSocketConfig
} from "./RealtimeSocket";

