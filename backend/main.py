import time
from typing import Dict

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.websockets import WebSocketState

from models import (
    AudioChunkPayload,
    BaseWebSocketMessage,
    InboundAudioChunkMessage,
    InboundSignFrameMessage,
    InboundTranscriptMessage,
    InboundTTSMessage,
    OutboundAudioChunkMessage,
    OutboundErrorMessage,
    OutboundPongMessage,
    OutboundSignFrameMessage,
    OutboundTranscriptMessage,
    OutboundTTSMessage,
    OutboundUserJoinedMessage,
    OutboundUserLeftMessage,
    SignFramePayload,
    TTSPayload,
    TranscriptPayload,
    User,
    UserEventPayload,
    websocket_inbound_adapter,
)

app = FastAPI()

# Allow all origins for now for development purposes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[WebSocket, str]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        self.active_connections[room_id][websocket] = user_id
        print(f"WebSocket connected to room={room_id} user={user_id}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].pop(websocket, None)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        print(f"WebSocket disconnected from room: {room_id}")

    async def send_personal_message(self, message: BaseWebSocketMessage, websocket: WebSocket):
        await websocket.send_text(message.model_dump_json())

    async def broadcast(
        self,
        message: BaseWebSocketMessage,
        room_id: str,
        exclude: WebSocket | None = None,
    ):
        if room_id not in self.active_connections:
            return

        serialized = message.model_dump_json()
        dead = []
        for ws in list(self.active_connections[room_id].keys()):
            if exclude is not None and ws is exclude:
                continue
            try:
                if ws.application_state == WebSocketState.CONNECTED:
                    await ws.send_text(serialized)
                else:
                    dead.append(ws)
            except Exception:
                dead.append(ws)

        # remove dead sockets so future broadcasts don't crash
        for ws in dead:
            try:
                self.active_connections[room_id].remove(ws)
            except ValueError:
                pass

        if room_id in self.active_connections and not self.active_connections[room_id]:
            del self.active_connections[room_id]

manager = ConnectionManager()

def now_ms() -> int:
    return int(time.time() * 1000)

def build_user_event_payload(room_id: str, user_id: str) -> UserEventPayload:
    return UserEventPayload(
        user=User(id=user_id, name=f"User-{user_id}", accessibilityMode="standard"),
        roomId=room_id,
    )

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    user_id: str = Query(default="anonymous", alias="userId"),
):
    await manager.connect(websocket, room_id, user_id)
    
    await manager.broadcast(
        OutboundUserJoinedMessage(
            type="user_joined",
            payload=build_user_event_payload(room_id, user_id),
            timestamp=now_ms(),
            userId=user_id,
        ),
        room_id,
        exclude=websocket,
    )

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = websocket_inbound_adapter.validate_json(data)
                
                message_user_id = message.userId or user_id

                if message.type == "ping":
                    await manager.send_personal_message(
                        OutboundPongMessage(
                            type="pong",
                            payload=None,
                            timestamp=now_ms(),
                            userId=message_user_id,
                        ),
                        websocket,
                    )
                    continue
                if message.type == "pong":
                    continue

                if message.type == "user_joined":
                    outbound_message = OutboundUserJoinedMessage(
                        type="user_joined",
                        payload=build_user_event_payload(room_id, message_user_id),
                        timestamp=message.timestamp,
                        userId=message_user_id,
                    )
                elif message.type == "user_left":
                    outbound_message = OutboundUserLeftMessage(
                        type="user_left",
                        payload=build_user_event_payload(room_id, message_user_id),
                        timestamp=message.timestamp,
                        userId=message_user_id,
                    )
                elif message.type == "transcript":
                    inbound = message
                    if not isinstance(inbound, InboundTranscriptMessage):
                        raise TypeError("Expected transcript message variant")
                    payload = TranscriptPayload(
                        segment=inbound.payload.segment,
                        roomId=room_id,
                    )
                    outbound_message = OutboundTranscriptMessage(
                        type="transcript",
                        payload=payload,
                        timestamp=inbound.timestamp,
                        userId=message_user_id,
                    )
                elif message.type == "sign_frame":
                    inbound = message
                    if not isinstance(inbound, InboundSignFrameMessage):
                        raise TypeError("Expected sign_frame message variant")
                    payload = SignFramePayload(
                        result=inbound.payload.result,
                        userId=message_user_id,
                        roomId=room_id,
                    )
                    outbound_message = OutboundSignFrameMessage(
                        type="sign_frame",
                        payload=payload,
                        timestamp=inbound.timestamp,
                        userId=message_user_id,
                    )
                elif message.type == "audio_chunk":
                    inbound = message
                    if not isinstance(inbound, InboundAudioChunkMessage):
                        raise TypeError("Expected audio_chunk message variant")
                    payload = AudioChunkPayload(
                        roomId=room_id,
                        chunk=inbound.payload.chunk,
                        format=inbound.payload.format,
                        sampleRate=inbound.payload.sampleRate,
                        sequence=inbound.payload.sequence,
                    )
                    outbound_message = OutboundAudioChunkMessage(
                        type="audio_chunk",
                        payload=payload,
                        timestamp=inbound.timestamp,
                        userId=message_user_id,
                    )
                elif message.type == "tts":
                    inbound = message
                    if not isinstance(inbound, InboundTTSMessage):
                        raise TypeError("Expected tts message variant")
                    payload = TTSPayload(
                        roomId=room_id,
                        text=inbound.payload.text,
                        voice=inbound.payload.voice,
                        speed=inbound.payload.speed,
                    )
                    outbound_message = OutboundTTSMessage(
                        type="tts",
                        payload=payload,
                        timestamp=inbound.timestamp,
                        userId=message_user_id,
                    )
                else:
                    raise ValueError(f"Unsupported message type: {message.type}")

                print(f"Received message type: {message.type} from user: {message_user_id} in room: {room_id}")
                await manager.broadcast(outbound_message, room_id)

            except ValidationError as e:
                print(f"WebSocket message validation error: {e}")
                await manager.send_personal_message(
                    OutboundErrorMessage(
                        type="error",
                        payload=f"Invalid message format: {e}",
                        timestamp=now_ms(),
                        userId=user_id,
                    ),
                    websocket,
                )
            except Exception as e:
                print(f"WebSocket message processing error: {e}")
                await manager.send_personal_message(
                    OutboundErrorMessage(
                        type="error",
                        payload=f"Server error: {e}",
                        timestamp=now_ms(),
                        userId=user_id,
                    ),
                    websocket,
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        await manager.broadcast(
            OutboundUserLeftMessage(
                type="user_left",
                payload=build_user_event_payload(room_id, user_id),
                timestamp=now_ms(),
                userId=user_id,
            ),
            room_id,
        )

# Example HTTP endpoint (for testing or health check)
@app.get("/")
async def get_root():
    return {"message": "OmniTalk FastAPI Backend"}
