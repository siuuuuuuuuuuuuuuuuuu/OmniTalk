import asyncio
import base64
import json
import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.websockets import WebSocketState

from models import (
    APIResponse,
    AudioChunkPayload,
    BaseWebSocketMessage,
    ErrorResponse,
    InboundAudioChunkMessage,
    InboundSignDetectionMessage,
    InboundSignFrameMessage,
    InboundSpeakerChangeMessage,
    InboundTranscriptMessage,
    InboundTTSMessage,
    OutboundAudioChunkMessage,
    OutboundErrorMessage,
    OutboundPongMessage,
    OutboundSignDetectionMessage,
    OutboundSignFrameMessage,
    OutboundSpeakerChangeMessage,
    OutboundTranscriptMessage,
    OutboundTTSMessage,
    OutboundUserJoinedMessage,
    OutboundUserLeftMessage,
    ProcessSignRequest,
    ProcessedSignResult,
    SignFramePayload,
    SignLanguage,
    TTSPayload,
    TTSResponsePayload,
    TranscriptPayload,
    User,
    UserEventPayload,
    WebSocketMessage,
    websocket_inbound_adapter,
)

try:
    from processor import SignLanguageProcessor  # type: ignore
except Exception:
    SignLanguageProcessor = None  # type: ignore[assignment]

try:
    from clientManager import SignLanguageClientManager  # type: ignore
except Exception:
    SignLanguageClientManager = None  # type: ignore[assignment]

app = FastAPI(title="OmniTalk API", version="1.0.0")
processor = SignLanguageProcessor() if SignLanguageProcessor else None
sign_client_manager = SignLanguageClientManager() if SignLanguageClientManager else None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8080",
        "exp://localhost:19000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[WebSocket, str]] = {}
        self.user_info: Dict[str, Dict[str, Dict[str, Any]]] = {}

    async def connect(
        self,
        websocket: WebSocket,
        room_id: str,
        user_id: str,
        user_info: Optional[Dict[str, Any]] = None,
    ) -> None:
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
            self.user_info[room_id] = {}
        self.active_connections[room_id][websocket] = user_id
        self.user_info[room_id][user_id] = user_info or {"id": user_id, "name": f"User-{user_id}"}
        logger.info("WebSocket connected room=%s user=%s", room_id, user_id)

    def disconnect(self, websocket: WebSocket, room_id: str, user_id: Optional[str] = None) -> None:
        if room_id not in self.active_connections:
            return

        mapped_user = self.active_connections[room_id].pop(websocket, None)
        effective_user = user_id or mapped_user
        if effective_user and room_id in self.user_info:
            self.user_info[room_id].pop(effective_user, None)

        if not self.active_connections[room_id]:
            del self.active_connections[room_id]
            self.user_info.pop(room_id, None)

        logger.info("WebSocket disconnected room=%s user=%s", room_id, effective_user or "unknown")

    async def send_personal_message(
        self,
        message: BaseWebSocketMessage | WebSocketMessage,
        websocket: WebSocket,
    ) -> None:
        try:
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.send_text(message.model_dump_json())
        except Exception:
            logger.exception("Failed to send personal message")

    async def broadcast(
        self,
        message: BaseWebSocketMessage | WebSocketMessage,
        room_id: str,
        exclude: Optional[WebSocket] = None,
        exclude_user: Optional[str] = None,
    ) -> None:
        if room_id not in self.active_connections:
            return

        serialized = message.model_dump_json()
        dead: list[WebSocket] = []

        for ws, ws_user_id in list(self.active_connections[room_id].items()):
            if exclude is not None and ws is exclude:
                continue
            if exclude_user is not None and ws_user_id == exclude_user:
                continue
            try:
                if ws.application_state == WebSocketState.CONNECTED:
                    await ws.send_text(serialized)
                else:
                    dead.append(ws)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws, room_id)

    async def get_room_users(self, room_id: str) -> List[Dict[str, Any]]:
        return list(self.user_info.get(room_id, {}).values())


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
    user_meta: Dict[str, Any] = {
        "id": user_id,
        "name": f"User-{user_id}",
        "accessibilityMode": "standard",
        "joinedAt": now_ms(),
    }
    await manager.connect(websocket, room_id, user_id, user_meta)

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

    room_users = await manager.get_room_users(room_id)
    await manager.send_personal_message(
        WebSocketMessage(
            type="system_message",
            payload={"type": "room_users", "users": room_users, "roomId": room_id},
            timestamp=now_ms(),
            userId="system",
        ),
        websocket,
    )

    try:
        while True:
            data = await websocket.receive_text()
            try:
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
                        payload = TranscriptPayload(segment=inbound.payload.segment, roomId=room_id)
                        outbound_message = OutboundTranscriptMessage(
                            type="transcript",
                            payload=payload,
                            timestamp=inbound.timestamp,
                            userId=message_user_id,
                        )
                    elif message.type in {"sign_frame", "sign_detection"}:
                        inbound = message
                        if not isinstance(inbound, (InboundSignFrameMessage, InboundSignDetectionMessage)):
                            raise TypeError("Expected sign message variant")
                        payload = SignFramePayload(
                            result=inbound.payload.result,
                            userId=message_user_id,
                            roomId=room_id,
                        )
                        if message.type == "sign_detection":
                            outbound_message = OutboundSignDetectionMessage(
                                type="sign_detection",
                                payload=payload,
                                timestamp=inbound.timestamp,
                                userId=message_user_id,
                            )
                        else:
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
                    elif message.type == "speaker_change":
                        inbound = message
                        if not isinstance(inbound, InboundSpeakerChangeMessage):
                            raise TypeError("Expected speaker_change message variant")
                        outbound_message = OutboundSpeakerChangeMessage(
                            type="speaker_change",
                            payload=inbound.payload,
                            timestamp=inbound.timestamp,
                            userId=message_user_id,
                        )
                    else:
                        raise ValueError(f"Unsupported message type: {message.type}")

                    await manager.broadcast(outbound_message, room_id)
                    continue

                except ValidationError:
                    # Legacy path compatibility (video_frame, tts_request, system_message).
                    legacy_message = WebSocketMessage.model_validate_json(data)
                    legacy_user_id = legacy_message.userId or user_id

                    if legacy_message.type == "ping":
                        await manager.send_personal_message(
                            WebSocketMessage(
                                type="pong",
                                payload=None,
                                timestamp=now_ms(),
                                userId=legacy_user_id,
                                messageId=legacy_message.messageId,
                            ),
                            websocket,
                        )
                    elif legacy_message.type in {"audio_chunk", "video_frame"}:
                        await manager.broadcast(legacy_message, room_id, exclude_user=legacy_user_id)
                    elif legacy_message.type == "transcript":
                        await manager.broadcast(legacy_message, room_id)
                    elif legacy_message.type == "tts_request":
                        tts_response = WebSocketMessage(
                            type="tts_response",
                            payload=TTSResponsePayload(
                                audioData=b"",
                                requestId=legacy_message.messageId,
                                duration=0.0,
                            ).model_dump(),
                            timestamp=now_ms(),
                            userId=legacy_user_id,
                        )
                        await manager.send_personal_message(tts_response, websocket)
                    elif legacy_message.type in {"user_joined", "user_left"}:
                        # Connect/disconnect events are managed by the server.
                        pass
                    else:
                        await manager.broadcast(legacy_message, room_id, exclude_user=legacy_user_id)

            except ValidationError as e:
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
                logger.exception("WebSocket message processing error")
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
        manager.disconnect(websocket, room_id, user_id)
        await manager.broadcast(
            OutboundUserLeftMessage(
                type="user_left",
                payload=build_user_event_payload(room_id, user_id),
                timestamp=now_ms(),
                userId=user_id,
            ),
            room_id,
        )


@app.get("/rooms/{room_id}/users")
async def get_room_users(room_id: str):
    users = await manager.get_room_users(room_id)
    return APIResponse(success=True, data={"roomId": room_id, "users": users, "count": len(users)})


@app.get("/health")
async def health_check():
    return APIResponse(
        success=True,
        data={
            "status": "healthy",
            "active_rooms": len(manager.active_connections),
            "total_connections": sum(len(conns) for conns in manager.active_connections.values()),
            "sign_processor_available": processor is not None,
            "sign_client_manager_available": sign_client_manager is not None,
        },
    )


@app.get("/")
async def get_root():
    return {"message": "OmniTalk FastAPI Backend", "version": "1.0.0"}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(detail=str(exc.detail)).model_dump(),
    )


@app.on_event("startup")
async def startup_event():
    if processor and hasattr(processor, "initialize"):
        try:
            processor.initialize()
            logger.info("Sign language processor initialized")
        except Exception:
            logger.exception("Failed to initialize sign language processor")
    else:
        logger.warning("Sign language processor module not available")


@app.on_event("shutdown")
async def shutdown_event():
    if processor and hasattr(processor, "cleanup"):
        try:
            processor.cleanup()
            logger.info("Sign language processor cleaned up")
        except Exception:
            logger.exception("Failed to clean up sign language processor")


@app.post("/api/process/sign", response_model=ProcessedSignResult)
async def process_sign_language(request: ProcessSignRequest):
    if not processor or not hasattr(processor, "process_image"):
        raise HTTPException(status_code=503, detail="Sign language processor not available")

    try:
        result = await processor.process_image(
            image_data=request.image_data,
            language=request.language,
            client_id=request.client_id,
        )

        if request.room_id:
            await manager.broadcast(
                OutboundSignDetectionMessage(
                    type="sign_detection",
                    payload=SignFramePayload(
                        result=result,
                        userId=request.client_id,
                        roomId=request.room_id,
                    ),
                    timestamp=now_ms(),
                    userId=request.client_id,
                ),
                request.room_id,
            )
        return result
    except Exception as e:
        logger.exception("Error processing sign language")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/process/sign/batch")
async def process_sign_language_batch(requests: List[ProcessSignRequest]):
    if not processor or not hasattr(processor, "process_image"):
        raise HTTPException(status_code=503, detail="Sign language processor not available")

    try:
        tasks = [
            processor.process_image(req.image_data, req.language, req.client_id)
            for req in requests
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        successful_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Error processing batch item %s: %s", i, result)
            else:
                successful_results.append(result)

        return APIResponse(
            success=True,
            data={"results": [r.model_dump() for r in successful_results]},
        )
    except Exception as e:
        logger.exception("Error processing sign language batch")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/sign/video")
async def sign_video_websocket(websocket: WebSocket):
    await websocket.accept()

    if not processor or not hasattr(processor, "process_image"):
        await websocket.send_json({"type": "error", "error": "Sign processor not available"})
        await websocket.close()
        return

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                message_type = message.get("type")

                if message_type == "init":
                    client_id = message.get("clientId", "unknown")
                    await websocket.send_json(
                        {"type": "init_ack", "status": "connected", "clientId": client_id}
                    )
                elif message_type == "frame":
                    client_id = message.get("clientId", "unknown")
                    frame_id = message.get("frameId")
                    image_data = message.get("data")
                    language_raw = message.get("language", "ASL")
                    language = SignLanguage(language_raw) if isinstance(language_raw, str) else SignLanguage.ASL

                    if image_data:
                        result = await processor.process_image(
                            image_data=image_data,
                            language=language,
                            client_id=client_id,
                        )
                        await websocket.send_json(
                            {
                                "type": "gesture",
                                "frameId": frame_id,
                                "gesture": result.gesture,
                                "confidence": result.confidence,
                                "text": result.text,
                                "isFinal": result.is_final,
                                "processingTime": result.processing_time_ms,
                            }
                        )
            except json.JSONDecodeError:
                # Ignore malformed text frames and keep connection alive.
                continue
    except WebSocketDisconnect:
        logger.info("Sign language video WebSocket disconnected")


@app.websocket("/sign/results")
async def sign_results_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message.get("type") == "register":
                client_id = message.get("clientId", "unknown")
                logger.info("Results client registered: %s", client_id)
    except WebSocketDisconnect:
        logger.info("Sign language results WebSocket disconnected")


@app.post("/api/sign/process")
async def process_sign_language_image(request: ProcessSignRequest):
    if not processor or not hasattr(processor, "process_image"):
        raise HTTPException(status_code=503, detail="Sign processor not available")

    try:
        result = await processor.process_image(
            image_data=request.image_data,
            language=request.language,
            client_id=request.client_id,
        )
        return result
    except Exception as e:
        logger.exception("Error processing sign language image")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sign/process-binary")
async def process_sign_language_binary(
    image: UploadFile = File(...),
    language: str = Form("ASL"),
    client_id: str = Form("web-client"),
    timestamp: Optional[int] = Form(None),
):
    if not processor or not hasattr(processor, "process_image"):
        raise HTTPException(status_code=503, detail="Sign processor not available")

    try:
        contents = await image.read()
        image_data = base64.b64encode(contents).decode("utf-8")
        _ = timestamp  # Explicitly keep field for API compatibility.
        result = await processor.process_image(
            image_data=image_data,
            language=SignLanguage(language),
            client_id=client_id,
        )
        return result
    except Exception as e:
        logger.exception("Error processing binary sign language")
        raise HTTPException(status_code=500, detail=str(e))
