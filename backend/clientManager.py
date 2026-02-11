# clientManager.py - Simplified version
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class SignLanguageClientManager:
    """Manages connections for sign language clients"""

    def __init__(self):
        # These will store WebSocket connections
        # We use type hints as strings to avoid import issues
        self.video_clients: Dict[str, Any] = {}  # Will store WebSocket objects
        self.result_clients: Dict[str, Any] = {}  # Will store WebSocket objects

    async def register_video_client(self, client_id: str, websocket):
        """Register a client's video WebSocket connection"""
        self.video_clients[client_id] = websocket
        logger.info(f"Registered video client: {client_id}")

    async def register_result_client(self, client_id: str, websocket):
        """Register a client's result WebSocket connection"""
        self.result_clients[client_id] = websocket
        logger.info(f"Registered result client: {client_id}")

    async def send_result_to_client(self, client_id: str, result: Dict[str, Any]):
        """Send processing result to specific client"""
        if client_id in self.result_clients:
            websocket = self.result_clients[client_id]
            try:
                await websocket.send_json(result)
                logger.debug(f"Sent result to client {client_id}")
            except Exception as e:
                logger.error(f"Failed to send result to client {client_id}: {e}")
                # Remove disconnected client
                del self.result_clients[client_id]
        else:
            logger.warning(f"Result client {client_id} not found")

    async def broadcast_to_room(self, connection_manager, websocket_message_class,
                                room_id: str, result: Dict[str, Any]):
        """Broadcast result to all WebSocket clients in a room"""
        import time  # Import here to avoid circular imports

        if connection_manager and websocket_message_class:
            message = websocket_message_class(
                type="sign_detection",
                payload=result,
                timestamp=int(time.time() * 1000),
                user_id=result.get("client_id", "system")  # lowercase
            )
            await connection_manager.broadcast(message, room_id)
            logger.debug(f"Broadcast sign detection to room {room_id}")
        else:
            logger.error("Connection manager not available for broadcast")