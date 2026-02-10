"""
OmniTalk Sign Language Detection Server.

FastAPI + WebSocket server that receives camera frames from the React Native
app, detects hand landmarks with MediaPipe, classifies ASL gestures, and
streams results back in real-time.

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8080 --reload

WebSocket protocol (matches frontend signToText.ts expectations):

    Client → Server:
        { "type": "process_frame", "data": "<base64>", "language": "ASL" }

    Server → Client:
        { "type": "landmarks", "landmarks": [...] }
        { "type": "gesture", "gesture": "thumbs_up", "confidence": 0.92 }
        { "type": "text_result", "result": { "text": "Yes", "signs": [...], ... } }
        { "type": "detection_result", "result": { "gesture": "thumbs_up", ... } }
        { "type": "error", "error": "..." }
"""

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from gesture_classifier import GestureClassifier, gesture_to_text
from hand_detector import HandDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("omnitalk")

# ──────────────────────────────────────────────────────────────
# Global services (initialized once at startup)
# ──────────────────────────────────────────────────────────────

hand_detector: HandDetector | None = None
gesture_classifier: GestureClassifier | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize ML services on startup, clean up on shutdown."""
    global hand_detector, gesture_classifier

    logger.info("Initializing hand detector (MediaPipe Hands)...")
    hand_detector = HandDetector(
        max_num_hands=2,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.5,
    )

    logger.info("Initializing gesture classifier...")
    gesture_classifier = GestureClassifier()

    logger.info("Server ready — accepting WebSocket connections")
    yield

    logger.info("Shutting down...")
    if hand_detector:
        hand_detector.close()


app = FastAPI(title="OmniTalk Sign Language API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "hand_detector": hand_detector is not None,
        "gesture_classifier": gesture_classifier is not None,
    }


# ──────────────────────────────────────────────────────────────
# WebSocket endpoint for sign language detection
# ──────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = id(websocket)
    logger.info(f"Client {client_id} connected")

    try:
        while True:
            raw = await websocket.receive_text()
            message = json.loads(raw)
            msg_type = message.get("type")

            if msg_type == "process_frame":
                await handle_frame(websocket, message)
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": time.time()})
            else:
                await websocket.send_json({
                    "type": "error",
                    "error": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except json.JSONDecodeError:
        logger.warning(f"Client {client_id} sent invalid JSON")
        await websocket.send_json({"type": "error", "error": "Invalid JSON"})
    except Exception as e:
        logger.error(f"Client {client_id} error: {e}")
        try:
            await websocket.send_json({"type": "error", "error": str(e)})
        except Exception:
            pass


async def handle_frame(websocket: WebSocket, message: dict):
    """
    Process a single camera frame:
    1. Decode base64 image
    2. Detect hand landmarks with MediaPipe
    3. Classify gesture from landmarks
    4. Send back landmarks, gesture, and text results
    """
    frame_data = message.get("data", "")
    if not frame_data:
        await websocket.send_json({"type": "error", "error": "No frame data"})
        return

    # Run detection in a thread pool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    detections = await loop.run_in_executor(
        None, hand_detector.detect_from_base64, frame_data
    )

    if not detections:
        # No hands detected — send empty result
        await websocket.send_json({
            "type": "detection_result",
            "result": None,
        })
        return

    # Process each detected hand
    for detection in detections:
        # Send landmarks
        landmarks_data = [
            {"x": lm.x, "y": lm.y, "z": lm.z, "visibility": lm.visibility}
            for lm in detection.landmarks
        ]
        await websocket.send_json({
            "type": "landmarks",
            "landmarks": landmarks_data,
            "handedness": detection.handedness,
        })

        # Classify gesture
        result = gesture_classifier.classify(detection)

        if result and result.gesture != "unknown" and result.confidence > 0.5:
            # Send gesture detection
            await websocket.send_json({
                "type": "gesture",
                "gesture": result.gesture,
                "confidence": result.confidence,
                "method": result.method,
            })

            # Send text translation
            text = gesture_to_text(result.gesture)
            if text:
                await websocket.send_json({
                    "type": "text_result",
                    "result": {
                        "text": text,
                        "signs": [result.gesture],
                        "confidence": result.confidence,
                        "timestamp": time.time() * 1000,
                    },
                })

            # Send combined detection_result (for processRemotely() in frontend)
            await websocket.send_json({
                "type": "detection_result",
                "result": {
                    "gesture": result.gesture,
                    "confidence": result.confidence,
                    "landmarks": landmarks_data,
                    "timestamp": time.time() * 1000,
                },
            })
        else:
            await websocket.send_json({
                "type": "detection_result",
                "result": None,
            })


# ──────────────────────────────────────────────────────────────
# REST endpoint for single-frame detection (alternative to WS)
# ──────────────────────────────────────────────────────────────

from fastapi import Body


@app.post("/detect")
async def detect_sign(payload: dict = Body(...)):
    """
    Process a single frame via REST (for testing or non-realtime use).

    Body: { "image": "<base64>", "language": "ASL" }
    """
    image_data = payload.get("image", "")
    if not image_data:
        return {"error": "No image data"}

    loop = asyncio.get_event_loop()
    detections = await loop.run_in_executor(
        None, hand_detector.detect_from_base64, image_data
    )

    if not detections:
        return {"hands_detected": 0, "results": []}

    results = []
    for detection in detections:
        gesture_result = gesture_classifier.classify(detection)
        if gesture_result:
            results.append({
                "gesture": gesture_result.gesture,
                "text": gesture_to_text(gesture_result.gesture),
                "confidence": gesture_result.confidence,
                "method": gesture_result.method,
                "handedness": detection.handedness,
                "landmarks": [
                    {"x": lm.x, "y": lm.y, "z": lm.z}
                    for lm in detection.landmarks
                ],
            })

    return {"hands_detected": len(detections), "results": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
