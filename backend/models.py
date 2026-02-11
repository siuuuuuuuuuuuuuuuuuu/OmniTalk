from typing import List, Literal, Optional, Union, Dict, Any
from pydantic import BaseModel, Field
from pydantic import RootModel
from datetime import datetime
import uuid

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
# NEW: Audio & Media Types
# ============================================

class AudioChunk(BaseModel):
    """Represents a chunk of audio data"""
    data: bytes  # Base64 encoded audio data
    format: Literal["wav", "webm", "mp3"] = "webm"
    sampleRate: int = 16000
    timestamp: int
    sequence: int

class VideoFrame(BaseModel):
    """Represents a video frame for sign language detection"""
    data: bytes  # Base64 encoded image data
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

WebSocketMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "sign_frame",
    "transcript",
    "tts",
    "tts_request",        # New
    "tts_response",       # New
    "ping",              # New
    "pong",              # New
    "error",             # New
    "speaker_change",    # New
    "system_message",    # New
    "audio_chunk",        # New
    "video_frame"       # New
]

class WebSocketMessage(BaseModel):
    type: WebSocketMessageType
    payload: Union[
        "TranscriptPayload",
        "SignDetectionPayload",
        "UserEventPayload",
        "AudioChunkPayload",      # New
        "VideoFramePayload",       # New
        "TTSRequestPayload",       # New
        "TTSResponsePayload",      # New
        str, # For speaker_change and error
        Dict[str, Any],
        None # For ping/pong
    ]
    timestamp: int
    userId: Optional[str] = None

# NEW: Payload types
class AudioChunkPayload(BaseModel):
    chunk: AudioChunk
    userId: str
    roomId: str

class VideoFramePayload(BaseModel):
    frame: VideoFrame
    userId: str
    roomId: str

class TTSRequestPayload(BaseModel):
    text: str
    voice: Optional[str] = None
    speed: float = 1.0
    language: str = "en"

class TTSResponsePayload(BaseModel):
    audioData: bytes  # Base64 encoded
    requestId: Optional[str] = None
    duration: float

class TranscriptPayload(BaseModel):
    segment: TranscriptSegment
    roomId: str

class SignDetectionPayload(BaseModel):
    result: SignToTextResult
    userId: str
    roomId: str

class UserEventPayload(BaseModel):
    user: User
    roomId: str

# Update forward refs for WebSocketMessage
WebSocketMessage.update_forward_refs()

# ============================================
# Room & Session Types
# ============================================

class Room(BaseModel):
    id: str
    name: str
    participants: List[User]
    createdAt: int
    isActive: bool
    # New fields
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
    # New fields
    audioEnabled: bool = True
    videoEnabled: bool = False
    transcriptEnabled: bool = True
    signDetectionEnabled: bool = False

# ============================================
# NEW: Error & Response Types
# ============================================

class APIResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    timestamp: int = Field(default_factory=lambda: int(datetime.now().timestamp()))

class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None

# ============================================
# Sign Language Processing Types
# ============================================

from enum import Enum

class SignLanguage(str, Enum):
    ASL = "ASL"
    BSL = "BSL"
    ISL = "ISL"
    LSM = "LSM"  # Mexican Sign Language
    JSL = "JSL"  # Japanese Sign Language

class ProcessSignRequest(BaseModel):
    """Request model for sign language processing"""
    image_data: str = Field(..., description="Base64 encoded image data")
    language: SignLanguage = Field(SignLanguage.ASL, description="Sign language dialect")
    client_id: str = Field("web-client", description="Client identifier")
    timestamp: Optional[int] = Field(None, description="Client timestamp in milliseconds")
    room_id: Optional[str] = Field(None, description="Room identifier for WebSocket broadcast")

# If you want to keep the schemas.py version of SignDetectionResult,
# rename it to avoid conflict with existing one:
class ProcessedSignResult(BaseModel):
    """Result from sign language processor"""
    gesture: str = Field(..., description="Detected gesture name")
    text: str = Field(..., description="Translated text")
    confidence: float = Field(..., ge=0, le=1, description="Detection confidence (0-1)")
    landmarks: List[List[HandLandmark]] = Field(default_factory=list, description="Hand landmarks")
    is_final: bool = Field(False, description="Whether this is a final detection")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
    handedness: List[str] = Field(default_factory=list, description="Left/right hand information")
    timestamp: int = Field(..., description="Processing timestamp")

