from __future__ import annotations

from typing import Annotated, Any, List, Literal, Optional, Union

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
    "transcript",
    "tts",
    "ping",
    "pong",
]

WebSocketOutboundMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "sign_frame",
    "transcript",
    "tts",
    "ping",
    "pong",
    "error",
]

WebSocketMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "sign_frame",
    "transcript",
    "tts",
    "ping",
    "pong",
    "error",
]

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

class TTSPayload(BaseModel):
    roomId: str
    text: str
    voice: Optional[str] = None
    speed: Optional[float] = Field(default=None, ge=0.5, le=2.0)

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

class InboundTranscriptMessage(BaseWebSocketMessage):
    type: Literal["transcript"]
    payload: TranscriptPayload

class InboundTTSMessage(BaseWebSocketMessage):
    type: Literal["tts"]
    payload: TTSPayload

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
        InboundTranscriptMessage,
        InboundTTSMessage,
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

class OutboundTranscriptMessage(BaseWebSocketMessage):
    type: Literal["transcript"]
    payload: TranscriptPayload

class OutboundTTSMessage(BaseWebSocketMessage):
    type: Literal["tts"]
    payload: TTSPayload

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
        OutboundTranscriptMessage,
        OutboundTTSMessage,
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

class SessionState(BaseModel):
    currentUser: Optional[User] = None
    currentRoom: Optional[Room] = None
    isConnected: bool
    isRecording: bool
    isCameraActive: bool
