import cv2
import mediapipe as mp
import numpy as np
import base64
import time
import asyncio
from typing import List, Dict, Any, Optional, Tuple
import logging
from concurrent.futures import ThreadPoolExecutor
import redis
import pickle

from models import SignLanguage, ProcessedSignResult, HandLandmark

logger = logging.getLogger(__name__)

class SignLanguageProcessor:
    """Production-grade sign language processor using MediaPipe"""

    def __init__(self, max_workers: int = 4, use_gpu: bool = True):
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles

        self.hands = None
        self.is_ready = False
        self.executor = ThreadPoolExecutor(max_workers=max_workers)

        # Gesture dictionary (extend with trained models)
        self.gesture_dictionary = {
            SignLanguage.ASL: {
                "thumbs_up": "Yes",
                "thumbs_down": "No",
                "peace": "Hello",
                "point": "You",
                "wave": "Goodbye",
                "open_palm": "Stop",
                "fist": "Wait",
                "ok": "Okay",
                "rock": "Awesome",
                "love_you": "I love you",
                "thank_you": "Thank you",
                "please": "Please",
                "help": "Help",
                "sorry": "Sorry",
            },
            SignLanguage.BSL: {
                "thumbs_up": "Yes",
                "thumbs_down": "No",
                "wave": "Hello",
                "open_palm": "Stop",
            }
        }

        # Temporal smoothing buffers
        self.client_buffers: Dict[str, List[Dict]] = {}

        # Redis for caching (optional)
        try:
            self.redis_client = redis.Redis(host='localhost', port=6379, db=0)
            self.use_redis = True
        except:
            self.use_redis = False
            logger.warning("Redis not available, caching disabled")

    def initialize(self):
        """Initialize MediaPipe hands model"""
        try:
            self.hands = self.mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                model_complexity=1,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
            self.is_ready = True
            logger.info("MediaPipe Hands model initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize MediaPipe: {e}")
            raise

    async def process_image(self, image_data: str, language: SignLanguage, client_id: str) -> ProcessedSignResult:
        """Process an image for sign language recognition"""
        start_time = time.time()

        try:
            # Decode base64 image
            image = self._decode_base64_image(image_data)

            # Process in thread pool to avoid blocking
            result = await asyncio.get_event_loop().run_in_executor(
                self.executor,
                self._process_image_sync,
                image,
                language,
                client_id
            )

            processing_time_ms = (time.time() - start_time) * 1000

            return ProcessedSignResult(
                **result,
                processing_time_ms=processing_time_ms
            )

        except Exception as e:
            logger.error(f"Error processing image for {client_id}: {e}")
            raise

    def _process_image_sync(self, image: np.ndarray, language: SignLanguage, client_id: str) -> Dict[str, Any]:
        """Synchronous image processing (run in thread pool)"""
        if not self.is_ready or not self.hands:
            raise RuntimeError("Processor not initialized")

        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Process with MediaPipe
        results = self.hands.process(image_rgb)

        if not results.multi_hand_landmarks:
            return {
                "gesture": "no_hands",
                "text": "",
                "confidence": 0.0,
                "landmarks": [],
                "is_final": False,
                "handedness": []
            }

        # Extract landmarks
        landmarks = []
        handedness = []

        for hand_landmarks in results.multi_hand_landmarks:
            # Convert landmarks to our format
            hand_points = []
            for landmark in hand_landmarks.landmark:
                hand_points.append({
                    "x": landmark.x,
                    "y": landmark.y,
                    "z": landmark.z,
                    "visibility": getattr(landmark, 'visibility', 1.0)
                })
            landmarks.append(hand_points)

        # Get handedness (left/right)
        if results.multi_handedness:
            for hand in results.multi_handedness:
                handedness.append(hand.classification[0].label)

        # Extract features and classify gesture
        gesture, confidence = self._classify_gesture(landmarks)

        # Apply temporal smoothing
        smoothed_gesture = self._apply_temporal_smoothing(client_id, gesture, confidence)

        # Convert to text
        text = self.gesture_dictionary.get(language, {}).get(smoothed_gesture, smoothed_gesture)

        # Check if gesture is final
        is_final = self._is_gesture_final(client_id, smoothed_gesture)

        return {
            "gesture": smoothed_gesture,
            "text": text,
            "confidence": confidence,
            "landmarks": landmarks,
            "is_final": is_final,
            "handedness": handedness
        }

    def _decode_base64_image(self, image_data: str) -> np.ndarray:
        """Decode base64 image to numpy array"""
        try:
            # Remove data URL prefix if present
            if ',' in image_data:
                image_data = image_data.split(',')[1]

            # Decode base64
            image_bytes = base64.b64decode(image_data)

            # Convert to numpy array
            nparr = np.frombuffer(image_bytes, np.uint8)

            # Decode image
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                raise ValueError("Failed to decode image")

            return image

        except Exception as e:
            logger.error(f"Error decoding image: {e}")
            raise

    def _classify_gesture(self, landmarks: List[List[Dict]]) -> Tuple[str, float]:
        """Classify gesture from hand landmarks"""
        if not landmarks or len(landmarks) == 0:
            return "unknown", 0.0

        # For now, use rule-based classification
        # In production, replace with trained ML model

        hand_landmarks = landmarks[0]  # First hand

        # Convert to numpy for easier calculations
        points = np.array([(p["x"], p["y"], p["z"]) for p in hand_landmarks])

        # Check for common gestures
        gestures_to_check = [
            self._is_thumbs_up(points),
            self._is_thumbs_down(points),
            self._is_peace_sign(points),
            self._is_ok_sign(points),
            self._is_pointing(points),
            self._is_fist(points),
            self._is_open_palm(points),
        ]

        # Return gesture with highest confidence
        best_gesture = ("unknown", 0.0)
        for gesture, confidence in gestures_to_check:
            if confidence > best_gesture[1]:
                best_gesture = (gesture, confidence)

        return best_gesture

    def _is_thumbs_up(self, points: np.ndarray) -> Tuple[str, float]:
        """Check if gesture is thumbs up"""
        # Thumb tip (4) should be above thumb IP (3)
        thumb_up = points[4][1] < points[3][1]

        # Other fingers should be curled (tips below PIP joints)
        fingers_curled = all([
            points[8][1] > points[6][1],   # Index
            points[12][1] > points[10][1],  # Middle
            points[16][1] > points[14][1],  # Ring
            points[20][1] > points[18][1],  # Pinky
        ])

        if thumb_up and fingers_curled:
            return "thumbs_up", 0.95
        return "thumbs_up", 0.0

    def _is_thumbs_down(self, points: np.ndarray) -> Tuple[str, float]:
        """Check if gesture is thumbs down"""
        # Thumb tip should be below thumb IP
        thumb_down = points[4][1] > points[3][1]

        if thumb_down:
            return "thumbs_down", 0.9
        return "thumbs_down", 0.0

    def _is_peace_sign(self, points: np.ndarray) -> Tuple[str, float]:
        """Check if gesture is peace sign (index and middle up)"""
        index_up = points[8][1] < points[6][1]
        middle_up = points[12][1] < points[10][1]
        ring_down = points[16][1] > points[14][1]

        if index_up and middle_up and ring_down:
            return "peace", 0.85
        return "peace", 0.0

    def _is_ok_sign(self, points: np.ndarray) -> Tuple[str, float]:
        """Check if gesture is OK sign"""
        # Thumb and index should be close (forming circle)
        thumb_index_distance = np.linalg.norm(points[4] - points[8])

        # Other fingers extended
        other_fingers_extended = all([
            points[12][1] < points[10][1],  # Middle
            points[16][1] < points[14][1],  # Ring
            points[20][1] < points[18][1],  # Pinky
        ])

        if thumb_index_distance < 0.05 and other_fingers_extended:
            return "ok", 0.88
        return "ok", 0.0

    def _is_pointing(self, points: np.ndarray) -> Tuple[str, float]:
        """Check if gesture is pointing"""
        index_up = points[8][1] < points[6][1]
        other_fingers_down = all([
            points[12][1] > points[10][1],  # Middle
            points[16][1] > points[14][1],  # Ring
            points[20][1] > points[18][1],  # Pinky
        ])

        if index_up and other_fingers_down:
            return "point", 0.82
        return "point", 0.0

    def _is_fist(self, points: np.ndarray) -> Tuple[str, float]:
        """Check if gesture is fist"""
        all_fingers_curled = all([
            points[4][1] > points[3][1],   # Thumb
            points[8][1] > points[6][1],   # Index
            points[12][1] > points[10][1], # Middle
            points[16][1] > points[14][1], # Ring
            points[20][1] > points[18][1], # Pinky
        ])

        if all_fingers_curled:
            return "fist", 0.9
        return "fist", 0.0

    def _is_open_palm(self, points: np.ndarray) -> Tuple[str, float]:
        """Check if gesture is open palm"""
        all_fingers_extended = all([
            points[4][1] < points[3][1],   # Thumb
            points[8][1] < points[6][1],   # Index
            points[12][1] < points[10][1], # Middle
            points[16][1] < points[14][1], # Ring
            points[20][1] < points[18][1], # Pinky
        ])

        if all_fingers_extended:
            return "open_palm", 0.87
        return "open_palm", 0.0

    def _apply_temporal_smoothing(self, client_id: str, gesture: str, confidence: float) -> str:
        """Apply temporal smoothing to reduce flickering"""
        if client_id not in self.client_buffers:
            self.client_buffers[client_id] = []

        buffer = self.client_buffers[client_id]
        current_time = time.time()

        # Add current detection
        buffer.append({
            "gesture": gesture,
            "confidence": confidence,
            "timestamp": current_time
        })

        # Keep only last 2 seconds
        cutoff_time = current_time - 2.0
        buffer[:] = [item for item in buffer if item["timestamp"] > cutoff_time]

        # Find most common gesture
        gesture_counts = {}
        for item in buffer:
            g = item["gesture"]
            gesture_counts[g] = gesture_counts.get(g, 0) + 1

        # Return most common gesture if it appears at least 3 times
        if gesture_counts:
            most_common = max(gesture_counts.items(), key=lambda x: x[1])
            if most_common[1] >= 3 and most_common[0] != gesture:
                logger.debug(f"Temporal smoothing: {gesture} -> {most_common[0]}")
                return most_common[0]

        return gesture

    def _is_gesture_final(self, client_id: str, gesture: str) -> bool:
        """Check if gesture is final (held for sufficient time)"""
        if client_id not in self.client_buffers:
            return False

        buffer = self.client_buffers[client_id]
        current_time = time.time()

        # Count how many times this gesture appears in last second
        recent_count = sum(
            1 for item in buffer
            if item["gesture"] == gesture and current_time - item["timestamp"] < 1.0
        )

        # Consider final if appears at least 5 times in last second
        return recent_count >= 5

    def cleanup(self):
        """Clean up resources"""
        if self.hands:
            self.hands.close()
            self.hands = None

        self.executor.shutdown(wait=True)
        self.is_ready = False
        logger.info("Sign language processor cleaned up")