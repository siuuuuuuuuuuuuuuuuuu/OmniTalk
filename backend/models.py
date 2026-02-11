from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, RootModel, TypeAdapter

# ============================================
# User & Accessibility Types
# ============================================


class UserAccessibilityMode(RootModel[Literal["deaf", "mute", "blind", "standard"]]):
    pass


class User(BaseModel):
    id: str
    name: str
    accessibilityMode: UserAccessibilityMode
    avatarUrl: Optional[str] = None
    color: Optional[str] = None


class AccessibilitySettings(BaseModel):
    fontSize: Literal["small", "medium", "large", "extra-large"]
    highContrast: bool
    captionsEnabled: bool
    ttsEnabled: bool
    ttsSpeed: float = Field(..., ge=0.5, le=2.0)
    ttsVoice: Optional[str] = None
    signLanguageEnabled: bool
    hapticFeedback: bool


# ============================================
# Audio & Media Types
# ============================================


class AudioChunk(BaseModel):
    data: bytes
    format: Literal["wav", "webm", "mp3"] = "webm"
    sampleRate: int = 16000
    timestamp: int
    sequence: int


class VideoFrame(BaseModel):
    data: bytes
    format: Literal["jpeg", "png", "webp"] = "jpeg"
    width: int
    height: int
    timestamp: int


# ============================================
# Transcript & Speech Types
# ============================================


class TranscriptSegment(BaseModel):
    id: str
    speakerId: str
    speakerName: str
    text: str
    timestamp: int
    isFinal: bool
    confidence: float
    source: Literal["speech", "sign", "text"]


class SpeakerInfo(BaseModel):
    id: str
    name: str
    color: str
    isCurrentlySpeaking: bool
    lastSpoke: Optional[int] = None


# ============================================
# Sign Language Types
# ============================================


class HandLandmark(BaseModel):
    x: float
    y: float
    z: float
    visibility: Optional[float] = None


class SignDetectionResult(BaseModel):
    gesture: str
    confidence: float
    landmarks: Optional[List[HandLandmark]] = None
    timestamp: int


class SignToTextResult(BaseModel):
    text: str
    signs: List[str]
    confidence: float
    timestamp: int


# ============================================
# WebSocket & Communication Types
# ============================================


WebSocketInboundMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "sign_frame",
    "sign_detection",
    "transcript",
    "tts",
    "speaker_change",
    "ping",
    "pong",
]

WebSocketOutboundMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "sign_frame",
    "sign_detection",
    "transcript",
    "tts",
    "speaker_change",
    "ping",
    "pong",
    "error",
]

WebSocketMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "sign_frame",
    "sign_detection",
    "transcript",
    "tts",
    "speaker_change",
    "ping",
    "pong",
    "error",
]

# Legacy superset used by older code paths.
LegacyWebSocketMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "video_frame",
    "sign_frame",
    "sign_detection",
    "transcript",
    "tts",
    "tts_request",
    "tts_response",
    "speaker_change",
    "system_message",
    "ping",
    "pong",
    "error",
]


class WebSocketMessage(BaseModel):
    type: LegacyWebSocketMessageType
    payload: Any
    timestamp: int
    userId: Optional[str] = None
    messageId: Optional[str] = None


class BaseWebSocketMessage(BaseModel):
    timestamp: int
    userId: Optional[str] = None


class TranscriptPayload(BaseModel):
    segment: TranscriptSegment
    roomId: str


class SignFramePayload(BaseModel):
    result: SignToTextResult
    userId: str
    roomId: str


class UserEventPayload(BaseModel):
    user: User
    roomId: str


class AudioChunkPayload(BaseModel):
    roomId: str
    chunk: str
    format: Optional[str] = None
    sampleRate: Optional[int] = None
    sequence: Optional[int] = None


class VideoFramePayload(BaseModel):
    frame: VideoFrame
    userId: str
    roomId: str


class TTSPayload(BaseModel):
    roomId: str
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = Field(default=None, ge=0.5, le=2.0)


class TTSRequestPayload(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: float = 1.0
    language: str = "en"


class TTSResponsePayload(BaseModel):
    audioData: bytes
    requestId: Optional[str] = None
    duration: float


# ----------------------------
# Inbound (client -> server)
# ----------------------------


class InboundUserJoinedMessage(BaseWebSocketMessage):
    type: Literal["user_joined"]
    payload: UserEventPayload


class InboundUserLeftMessage(BaseWebSocketMessage):
    type: Literal["user_left"]
    payload: UserEventPayload


class InboundAudioChunkMessage(BaseWebSocketMessage):
    type: Literal["audio_chunk"]
    payload: AudioChunkPayload


class InboundSignFrameMessage(BaseWebSocketMessage):
    type: Literal["sign_frame"]
    payload: SignFramePayload


class InboundSignDetectionMessage(BaseWebSocketMessage):
    type: Literal["sign_detection"]
    payload: SignFramePayload


class InboundTranscriptMessage(BaseWebSocketMessage):
    type: Literal["transcript"]
    payload: TranscriptPayload


class InboundTTSMessage(BaseWebSocketMessage):
    type: Literal["tts"]
    payload: TTSPayload


class InboundSpeakerChangeMessage(BaseWebSocketMessage):
    type: Literal["speaker_change"]
    payload: str


class InboundPingMessage(BaseWebSocketMessage):
    type: Literal["ping"]
    payload: Optional[dict[str, Any]] = None


class InboundPongMessage(BaseWebSocketMessage):
    type: Literal["pong"]
    payload: Optional[dict[str, Any]] = None


WebSocketInboundMessage = Annotated[
    Union[
        InboundUserJoinedMessage,
        InboundUserLeftMessage,
        InboundAudioChunkMessage,
        InboundSignFrameMessage,
        InboundSignDetectionMessage,
        InboundTranscriptMessage,
        InboundTTSMessage,
        InboundSpeakerChangeMessage,
        InboundPingMessage,
        InboundPongMessage,
    ],
    Field(discriminator="type"),
]

# ----------------------------
# Outbound (server -> client)
# ----------------------------


class OutboundUserJoinedMessage(BaseWebSocketMessage):
    type: Literal["user_joined"]
    payload: UserEventPayload


class OutboundUserLeftMessage(BaseWebSocketMessage):
    type: Literal["user_left"]
    payload: UserEventPayload


class OutboundAudioChunkMessage(BaseWebSocketMessage):
    type: Literal["audio_chunk"]
    payload: AudioChunkPayload


class OutboundSignFrameMessage(BaseWebSocketMessage):
    type: Literal["sign_frame"]
    payload: SignFramePayload


class OutboundSignDetectionMessage(BaseWebSocketMessage):
    type: Literal["sign_detection"]
    payload: SignFramePayload


class OutboundTranscriptMessage(BaseWebSocketMessage):
    type: Literal["transcript"]
    payload: TranscriptPayload


class OutboundTTSMessage(BaseWebSocketMessage):
    type: Literal["tts"]
    payload: TTSPayload


class OutboundSpeakerChangeMessage(BaseWebSocketMessage):
    type: Literal["speaker_change"]
    payload: str


class OutboundPingMessage(BaseWebSocketMessage):
    type: Literal["ping"]
    payload: Optional[dict[str, Any]] = None


class OutboundPongMessage(BaseWebSocketMessage):
    type: Literal["pong"]
    payload: Optional[dict[str, Any]] = None


class OutboundErrorMessage(BaseWebSocketMessage):
    type: Literal["error"]
    payload: str


WebSocketOutboundMessage = Annotated[
    Union[
        OutboundUserJoinedMessage,
        OutboundUserLeftMessage,
        OutboundAudioChunkMessage,
        OutboundSignFrameMessage,
        OutboundSignDetectionMessage,
        OutboundTranscriptMessage,
        OutboundTTSMessage,
        OutboundSpeakerChangeMessage,
        OutboundPingMessage,
        OutboundPongMessage,
        OutboundErrorMessage,
    ],
    Field(discriminator="type"),
]

websocket_inbound_adapter = TypeAdapter(WebSocketInboundMessage)
websocket_outbound_adapter = TypeAdapter(WebSocketOutboundMessage)

# Backward-compat alias used by older imports.
SignDetectionPayload = SignFramePayload


# ============================================
# Room & Session Types
# ============================================


class Room(BaseModel):
    id: str
    name: str
    participants: List[User]
    createdAt: int
    isActive: bool
    settings: Dict[str, Any] = Field(default_factory=dict)
    maxParticipants: int = 10
    language: str = "en"
    requiresAuth: bool = False


class SessionState(BaseModel):
    currentUser: Optional[User] = None
    currentRoom: Optional[Room] = None
    isConnected: bool
    isRecording: bool
    isCameraActive: bool
    audioEnabled: bool = True
    videoEnabled: bool = False
    transcriptEnabled: bool = True
    signDetectionEnabled: bool = False


# ============================================
# API & Error Types
# ============================================


class APIResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    timestamp: int = Field(default_factory=lambda: int(datetime.now().timestamp() * 1000))


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None


# ============================================
# Sign Language Processing Types
# ============================================


class SignLanguage(str, Enum):
    ASL = "ASL"
    BSL = "BSL"
    ISL = "ISL"
    LSM = "LSM"
    JSL = "JSL"


class ProcessSignRequest(BaseModel):
    image_data: str = Field(..., description="Base64 encoded image data")
    language: SignLanguage = Field(SignLanguage.ASL, description="Sign language dialect")
    client_id: str = Field("web-client", description="Client identifier")
    timestamp: Optional[int] = Field(None, description="Client timestamp in milliseconds")
    room_id: Optional[str] = Field(None, description="Room identifier for WebSocket broadcast")


class ProcessedSignResult(BaseModel):
    gesture: str = Field(..., description="Detected gesture name")
    text: str = Field(..., description="Translated text")
    confidence: float = Field(..., ge=0, le=1, description="Detection confidence (0-1)")
    landmarks: List[List[HandLandmark]] = Field(default_factory=list, description="Hand landmarks")
    is_final: bool = Field(False, description="Whether this is a final detection")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
    handedness: List[str] = Field(default_factory=list, description="Left/right hand information")
    timestamp: int = Field(..., description="Processing timestamp")
