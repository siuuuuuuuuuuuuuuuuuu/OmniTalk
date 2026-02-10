/**
 * Shared Types for OmniTalk
 * Central type definitions used across the application
 */

// ============================================
// User & Accessibility Types
// ============================================

export type UserAccessibilityMode = "deaf" | "mute" | "blind" | "standard";

export interface User {
  id: string;
  name: string;
  accessibilityMode: UserAccessibilityMode;
  avatarUrl?: string;
  color?: string; // For speaker identification
}

export interface AccessibilitySettings {
  fontSize: "small" | "medium" | "large" | "extra-large";
  highContrast: boolean;
  captionsEnabled: boolean;
  ttsEnabled: boolean;
  ttsSpeed: number; // 0.5 - 2.0
  ttsVoice?: string;
  signLanguageEnabled: boolean;
  hapticFeedback: boolean;
}

// ============================================
// Transcript & Speech Types
// ============================================

export interface TranscriptSegment {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  confidence: number;
  source: "speech" | "sign" | "text";
}

export interface SpeakerInfo {
  id: string;
  name: string;
  color: string;
  isCurrentlySpeaking: boolean;
  lastSpoke?: number;
}

// ============================================
// Sign Language Types
// ============================================

export interface SignDetectionResult {
  gesture: string;
  confidence: number;
  landmarks?: HandLandmark[];
  timestamp: number;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface SignToTextResult {
  text: string;
  signs: string[];
  confidence: number;
  timestamp: number;
}

// ============================================
// WebSocket & Communication Types
// ============================================

export type WebSocketMessageType =
  | "transcript"
  | "sign_detection"
  | "user_joined"
  | "user_left"
  | "speaker_change"
  | "error"
  | "ping"
  | "pong";

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
  timestamp: number;
  userId?: string;
}

export interface TranscriptPayload {
  segment: TranscriptSegment;
  roomId: string;
}

export interface SignDetectionPayload {
  result: SignToTextResult;
  userId: string;
  roomId: string;
}

export interface UserEventPayload {
  user: User;
  roomId: string;
}

// ============================================
// Room & Session Types
// ============================================

export interface Room {
  id: string;
  name: string;
  participants: User[];
  createdAt: number;
  isActive: boolean;
}

export interface SessionState {
  currentUser: User | null;
  currentRoom: Room | null;
  isConnected: boolean;
  isRecording: boolean;
  isCameraActive: boolean;
}

// ============================================
// Component Props Types
// ============================================

export interface LiveTranscriptProps {
  segments: TranscriptSegment[];
  speakers: Map<string, SpeakerInfo>;
  autoScroll?: boolean;
  maxSegments?: number;
}

export interface SpeakerLabelProps {
  speaker: SpeakerInfo;
  size?: "small" | "medium" | "large";
  showAvatar?: boolean;
}

export interface AccessibilityControlsProps {
  settings: AccessibilitySettings;
  onSettingsChange: (settings: Partial<AccessibilitySettings>) => void;
}

export interface TextToSpeechProps {
  text: string;
  autoSpeak?: boolean;
  settings?: Pick<AccessibilitySettings, "ttsSpeed" | "ttsVoice">;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}

export interface CameraCaptureProps {
  onFrame?: (imageData: ImageData | string) => void;
  onSignDetected?: (result: SignDetectionResult) => void;
  onError?: (error: Error) => void;
  isActive?: boolean;
}
