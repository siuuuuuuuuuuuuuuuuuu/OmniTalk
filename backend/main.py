from typing import Dict, List, Optional, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, Form, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.websockets import WebSocketState
from processor import SignLanguageProcessor
from clientManager import SignLanguageClientManager
import asyncio
import logging
import time
import base64
import json

from models import (
    WebSocketMessage,
    WebSocketMessageType,
    TranscriptPayload,
    SignDetectionPayload,
    UserEventPayload,
    AudioChunkPayload,
    VideoFramePayload,
    TTSRequestPayload,
    TTSResponsePayload,
    User,
    Room,
    APIResponse,
    ErrorResponse,
    ProcessSignRequest,
    ProcessedSignResult,
    SignLanguage
)

app = FastAPI(title="OmniTalk API", version="1.0.0")
processor = SignLanguageProcessor()
sign_client_manager = SignLanguageClientManager()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Log to console
        # logging.FileHandler('app.log')  # Optional: log to file
    ]
)

# Create logger instance
logger = logging.getLogger(__name__)

# Allow all origins for now for development purposes
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React development server
        "http://localhost:8080",  # Alternative port
        "exp://localhost:19000",  # Expo development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_info: Dict[str, Dict[str, Any]] = {}  # room_id -> {user_id: info}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str, user_info: Optional[Dict] = None):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
            self.user_info[room_id] = {}

        self.active_connections[room_id].append(websocket)

        if user_info:
            self.user_info[room_id][user_id] = user_info
        else:
            self.user_info[room_id][user_id] = {"id": user_id, "name": f"User-{user_id}"}

        print(f"User {user_id} connected to room: {room_id}")
        return True

    def disconnect(self, websocket: WebSocket, room_id: str, user_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)

            if user_id in self.user_info.get(room_id, {}):
                del self.user_info[room_id][user_id]

            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
                if room_id in self.user_info:
                    del self.user_info[room_id]

        print(f"User {user_id} disconnected from room: {room_id}")

    async def send_personal_message(self, message: WebSocketMessage, websocket: WebSocket):
        try:
            if websocket.application_state == WebSocketState.CONNECTED:
                await websocket.send_text(message.model_dump_json())
        except Exception as e:
            print(f"Error sending personal message: {e}")

    async def broadcast(self, message: WebSocketMessage, room_id: str, exclude_user: Optional[str] = None):
        """Broadcast message to all clients in a room, optionally excluding a user"""
        if room_id not in self.active_connections:
            return

        dead_connections = []
        for ws in list(self.active_connections[room_id]):
            try:
                # Check if this connection should be excluded
                user_id_for_ws = None
                # Find user_id for this websocket (you might need to store this mapping)
                for uid, info in self.user_info.get(room_id, {}).items():
                    # This is simplified - you'd need to maintain a proper mapping
                    if exclude_user and uid == exclude_user:
                        continue

                if ws.application_state == WebSocketState.CONNECTED:
                    await ws.send_text(message.model_dump_json())
                else:
                    dead_connections.append(ws)
            except Exception as e:
                print(f"Error broadcasting to websocket: {e}")
                dead_connections.append(ws)

        # Clean up dead connections
        for ws in dead_connections:
            try:
                self.active_connections[room_id].remove(ws)
            except ValueError:
                pass

        # Clean up empty rooms
        if room_id in self.active_connections and not self.active_connections[room_id]:
            del self.active_connections[room_id]
            if room_id in self.user_info:
                del self.user_info[room_id]

    async def get_room_users(self, room_id: str) -> List[Dict]:
        """Get list of users in a room"""
        if room_id in self.user_info:
            return list(self.user_info[room_id].values())
        return []

manager = ConnectionManager()

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str = "anonymous"):
    """Main WebSocket endpoint for real-time communication"""

    # Create user info
    user_info = {
        "id": user_id,
        "name": f"User-{user_id}",
        "accessibilityMode": "standard",
        "joinedAt": int(asyncio.get_event_loop().time())
    }

    # Connect to room
    await manager.connect(websocket, room_id, user_id, user_info)

    # Notify other users in the room that a new user has joined
    join_message = WebSocketMessage(
        type="user_joined",
        payload=UserEventPayload(
            user=User(
                id=user_id,
                name=f"User-{user_id}",
                accessibilityMode="standard"
            ),
            roomId=room_id,
        ).model_dump(),
        timestamp=int(asyncio.get_event_loop().time()),
        userId=user_id,
    )

    await manager.broadcast(join_message, room_id, exclude_user=user_id)

    # Send current room users to the new user
    room_users = await manager.get_room_users(room_id)
    users_message = WebSocketMessage(
        type="system_message",
        payload={
            "type": "room_users",
            "users": room_users,
            "roomId": room_id
        },
        timestamp=int(asyncio.get_event_loop().time()),
        userId="system"
    )
    await manager.send_personal_message(users_message, websocket)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = WebSocketMessage.model_validate_json(data)

                # Update userId from connection if not present in message
                if not message.userId:
                    message.userId = user_id

                # Handle different message types
                if message.type == "ping":
                    # Respond with pong
                    pong_message = WebSocketMessage(
                        type="pong",
                        payload=None,
                        timestamp=int(asyncio.get_event_loop().time()),
                        userId=user_id,
                        messageId=message.messageId
                    )
                    await manager.send_personal_message(pong_message, websocket)

                elif message.type == "audio_chunk":
                    # Handle audio data - just broadcast to others
                    await manager.broadcast(message, room_id, exclude_user=user_id)

                elif message.type == "video_frame":
                    # Handle video frames for sign language
                    await manager.broadcast(message, room_id, exclude_user=user_id)

                elif message.type == "transcript":
                    # Broadcast transcript updates
                    await manager.broadcast(message, room_id)

                elif message.type == "tts_request":
                    # Handle TTS requests (you can integrate with a TTS service here)
                    # For now, just echo back with a placeholder
                    tts_response = WebSocketMessage(
                        type="tts_response",
                        payload=TTSResponsePayload(
                            audioData=b"",  # Placeholder
                            requestId=message.messageId,
                            duration=0.0
                        ).model_dump(),
                        timestamp=int(asyncio.get_event_loop().time()),
                        userId=user_id
                    )
                    await manager.send_personal_message(tts_response, websocket)

                elif message.type in ["user_joined", "user_left"]:
                    # These are handled on connect/disconnect
                    pass

                else:
                    # Default: broadcast all other messages
                    print(f"Broadcasting message type: {message.type} from user: {message.userId}")
                    await manager.broadcast(message, room_id, exclude_user=user_id)

            except ValidationError as e:
                print(f"WebSocket message validation error: {e}")
                error_message = WebSocketMessage(
                    type="error",
                    payload={"error": f"Invalid message format: {str(e)}"},
                    timestamp=int(asyncio.get_event_loop().time()),
                    userId=user_id
                )
                await manager.send_personal_message(error_message, websocket)
            except Exception as e:
                print(f"WebSocket message processing error: {e}")
                error_message = WebSocketMessage(
                    type="error",
                    payload={"error": f"Server error: {str(e)}"},
                    timestamp=int(asyncio.get_event_loop().time()),
                    userId=user_id
                )
                await manager.send_personal_message(error_message, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id, user_id)

        # Notify other users in the room that a user has left
        leave_message = WebSocketMessage(
            type="user_left",
            payload=UserEventPayload(
                user=User(
                    id=user_id,
                    name=f"User-{user_id}",
                    accessibilityMode="standard"
                ),
                roomId=room_id,
            ).model_dump(),
            timestamp=int(asyncio.get_event_loop().time()),
            userId=user_id,
        )
        await manager.broadcast(leave_message, room_id)

# NEW: HTTP endpoints for room management
@app.get("/rooms/{room_id}/users")
async def get_room_users(room_id: str):
    """Get list of users in a room"""
    users = await manager.get_room_users(room_id)
    return APIResponse(
        success=True,
        data={"roomId": room_id, "users": users, "count": len(users)}
    )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return APIResponse(
        success=True,
        data={
            "status": "healthy",
            "active_rooms": len(manager.active_connections),
            "total_connections": sum(len(conns) for conns in manager.active_connections.values())
        }
    )

# Example HTTP endpoint (for testing or health check)
@app.get("/")
async def get_root():
    return {"message": "OmniTalk FastAPI Backend", "version": "1.0.0"}

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(detail=exc.detail).model_dump()
    )

@app.on_event("startup")
async def startup_event():
    """Initialize sign language processor on startup"""
    try:
        processor.initialize()
        logger.info("Sign language processor initialized")
    except Exception as e:
        logger.error(f"Failed to initialize sign language processor: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up processor on shutdown"""
    processor.cleanup()
    logger.info("Sign language processor cleaned up")

@app.post("/api/process/sign", response_model=ProcessedSignResult)
async def process_sign_language(request: ProcessSignRequest):
    """
    Process sign language image and return detection results
    """
    try:
        result = await processor.process_image(
            image_data=request.image_data,
            language=request.language,
            client_id=request.client_id
        )

        # If room_id is provided, broadcast via WebSocket
        if request.room_id:
            message = WebSocketMessage(
                type="sign_detection",
                payload={
                    "result": result.model_dump(),
                    "userId": request.client_id,
                    "roomId": request.room_id
                },
                timestamp=int(time.time() * 1000),
                userId=request.client_id
            )
            await manager.broadcast(message, request.room_id)

        return result

    except Exception as e:
        logger.error(f"Error processing sign language: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process/sign/batch")
async def process_sign_language_batch(requests: List[ProcessSignRequest]):
    """
    Process multiple sign language images in batch
    """
    try:
        tasks = [
            processor.process_image(
                req.image_data,
                req.language,
                req.client_id
            )
            for req in requests
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out errors
        successful_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error processing batch item {i}: {result}")
            else:
                successful_results.append(result)

        return APIResponse(
            success=True,
            data={"results": [r.model_dump() for r in successful_results]}
        )

    except Exception as e:
        logger.error(f"Error processing sign language batch: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Add these new WebSocket endpoints

@app.websocket("/sign/video")
async def sign_video_websocket(websocket: WebSocket):
    """WebSocket endpoint for receiving video frames from frontend"""
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                message_type = message.get("type")

                if message_type == "init":
                    # Handle initialization
                    client_id = message.get("clientId", "unknown")
                    language = message.get("language", "ASL")
                    target_fps = message.get("targetFps", 15)

                    print(f"Sign language client connected: {client_id}")

                    # Send acknowledgement
                    await websocket.send_json({
                        "type": "init_ack",
                        "status": "connected",
                        "clientId": client_id
                    })

                elif message_type == "frame":
                    # Process video frame
                    client_id = message.get("clientId")
                    frame_id = message.get("frameId")
                    image_data = message.get("data")
                    timestamp = message.get("timestamp")

                    if image_data and processor:
                        # Process the frame
                        result = await processor.process_image(
                            image_data=image_data,
                            language=SignLanguage(message.get("language", "ASL")),
                            client_id=client_id
                        )

                        # Send result back
                        await websocket.send_json({
                            "type": "gesture",
                            "frameId": frame_id,
                            "gesture": result.gesture,
                            "confidence": result.confidence,
                            "text": result.text,
                            "isFinal": result.is_final,
                            "processingTime": result.processing_time_ms
                        })

                elif message_type == "start_stream":
                    print(f"Starting stream for client: {message.get('clientId')}")

                elif message_type == "stop_stream":
                    print(f"Stopping stream for client: {message.get('clientId')}")

            except json.JSONDecodeError:
                # Try binary data for video frames
                try:
                    binary_data = await websocket.receive_bytes()
                    # Handle binary frame data
                    # You'll need to implement binary frame parsing
                    pass
                except:
                    pass

    except WebSocketDisconnect:
        print("Sign language video WebSocket disconnected")

@app.websocket("/sign/results")
async def sign_results_websocket(websocket: WebSocket):
    """WebSocket endpoint for sending results to frontend"""
    await websocket.accept()

    try:
        while True:
            # Wait for client registration
            data = await websocket.receive_text()
            message = json.loads(data)

            if message.get("type") == "register":
                client_id = message.get("clientId")
                print(f"Results client registered: {client_id}")

                # Store connection for this client
                # You'll need to track which results socket belongs to which client

    except WebSocketDisconnect:
        print("Sign language results WebSocket disconnected")

# Add to main.py

@app.post("/api/sign/process")
async def process_sign_language_image(
        request: ProcessSignRequest
):
    """Process a single sign language image (REST fallback)"""
    try:
        if not processor:
            raise HTTPException(status_code=503, detail="Sign processor not available")

        result = await processor.process_image(
            image_data=request.image_data,
            language=request.language,
            client_id=request.client_id
        )

        return result

    except Exception as e:
        logger.error(f"Error processing sign language: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sign/process-binary")
async def process_sign_language_binary(
        image: UploadFile = File(...),
        language: str = Form("ASL"),
        client_id: str = Form("web-client"),
        timestamp: Optional[int] = Form(None)
):
    """Process binary image data (for efficient transmission)"""
    try:
        contents = await image.read()

        # Convert binary to base64
        import base64
        image_data = base64.b64encode(contents).decode('utf-8')

        result = await processor.process_image(
            image_data=image_data,
            language=SignLanguage(language),
            client_id=client_id
        )

        return result

    except Exception as e:
        logger.error(f"Error processing binary sign language: {e}")
        raise HTTPException(status_code=500, detail=str(e))