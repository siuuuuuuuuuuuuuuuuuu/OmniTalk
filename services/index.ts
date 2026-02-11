/**
 * Services Index
 * Re-export all services for easy imports
 */

export {
    createSpeechToTextService, SpeechToTextService, useSpeechToTextConfig
} from "./speechToText";
export type {
    SpeechToTextCallbacks, SpeechToTextConfig, TranscriptionResult
} from "./speechToText";

export {
    createSignToTextService, SignToTextService
} from "./signToText";
export type { SignToTextCallbacks, SignToTextConfig } from "./signToText";

export {
    createRealtimeSocketService, RealtimeSocketService
} from "./RealtimeSocket";
export type {
    RealtimeSocketCallbacks, RealtimeSocketConfig
} from "./RealtimeSocket";

