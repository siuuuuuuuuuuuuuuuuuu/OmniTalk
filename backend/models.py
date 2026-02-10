from typing import List, Literal, Optional, Union
from pydantic import BaseModel, Field
from pydantic import RootModel

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

WebSocketMessageType = Literal[
    "user_joined",
    "user_left",
    "audio_chunk",
    "sign_frame",
    "transcript",
    "tts"
]

class WebSocketMessage(BaseModel):
    type: WebSocketMessageType
    payload: Union[
        "TranscriptPayload",
        "SignDetectionPayload",
        "UserEventPayload",
        str, # For speaker_change and error
        None # For ping/pong
    ]
    timestamp: int
    userId: Optional[str] = None

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

class SessionState(BaseModel):
    currentUser: Optional[User] = None
    currentRoom: Optional[Room] = None
    isConnected: bool
    isRecording: bool
    isCameraActive: bool
