from typing import Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from starlette.websockets import WebSocketState

from models import (
    WebSocketMessage,
    WebSocketMessageType,
    TranscriptPayload,
    SignDetectionPayload,
    UserEventPayload,
    User,
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
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        print(f"WebSocket connected to room: {room_id}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        print(f"WebSocket disconnected from room: {room_id}")


    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str, room_id: str):
        if room_id not in self.active_connections:
            return

        dead = []
        for ws in list(self.active_connections[room_id]):
            try:
                if ws.application_state == WebSocketState.CONNECTED:
                    await ws.send_text(message)
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

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str = "anonymous"):
    await manager.connect(websocket, room_id)
    
    # Notify other users in the room that a new user has joined
    await manager.broadcast(
        WebSocketMessage(
            type="user_joined",
            payload=UserEventPayload(
                user=User(id=user_id, name=f"User-{user_id}", accessibilityMode="standard"),
                roomId=room_id,
            ).model_dump(),
            timestamp=0, # Placeholder
            userId=user_id,
        ).model_dump_json(),
        room_id
    )

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = WebSocketMessage.model_validate_json(data)
                
                # Update userId from connection if not present in message
                if not message.userId:
                    message.userId = user_id

                if message.type == "ping":
                    await websocket.send_text(
                        WebSocketMessage(type="pong", payload=None, timestamp=0, userId=user_id).model_dump_json()
                    )
                elif message.type == "user_joined":
                    # User joined message already handled on connect
                    pass
                else:
                    print(f"Received message type: {message.type} from user: {message.userId} in room: {room_id}")
                    # Re-broadcast to all clients in the room
                    await manager.broadcast(message.model_dump_json(), room_id)

            except ValidationError as e:
                print(f"WebSocket message validation error: {e}")
                await websocket.send_text(
                    WebSocketMessage(type="error", payload=f"Invalid message format: {e}", timestamp=0).model_dump_json()
                )
            except Exception as e:
                print(f"WebSocket message processing error: {e}")
                await websocket.send_text(
                    WebSocketMessage(type="error", payload=f"Server error: {e}", timestamp=0).model_dump_json()
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        # Notify other users in the room that a user has left
        await manager.broadcast(
            WebSocketMessage(
                type="user_left",
                payload=UserEventPayload(
                    user=User(id=user_id, name=f"User-{user_id}", accessibilityMode="standard"),
                    roomId=room_id,
                ).model_dump(),
                timestamp=0, # Placeholder
                userId=user_id,
            ).model_dump_json(),
            room_id
        )

# Example HTTP endpoint (for testing or health check)
@app.get("/")
async def get_root():
    return {"message": "OmniTalk FastAPI Backend"}
