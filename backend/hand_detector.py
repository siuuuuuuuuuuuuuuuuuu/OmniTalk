"""
Hand Landmark Detector using MediaPipe Hands.

Extracts 21 hand landmarks per detected hand from camera frames.
Each landmark has (x, y, z) normalized coordinates plus visibility.
"""

import base64
import io
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image

mp_hands = mp.solutions.hands


@dataclass
class HandLandmark:
    x: float
    y: float
    z: float
    visibility: float


@dataclass
class HandDetection:
    landmarks: list[HandLandmark]
    handedness: str  # "Left" or "Right"
    score: float


class HandDetector:
    """Detects hands and extracts landmarks using MediaPipe Hands."""

    def __init__(
        self,
        max_num_hands: int = 2,
        min_detection_confidence: float = 0.7,
        min_tracking_confidence: float = 0.5,
    ):
        self.hands = mp_hands.Hands(
            static_image_mode=True,  # Process individual frames, not video stream
            max_num_hands=max_num_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def detect_from_base64(self, base64_data: str) -> list[HandDetection]:
        """Detect hands from a base64-encoded image."""
        image = self._decode_base64(base64_data)
        return self._detect(image)

    def detect_from_bytes(self, image_bytes: bytes) -> list[HandDetection]:
        """Detect hands from raw image bytes."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return []
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        return self._detect(image_rgb)

    def _decode_base64(self, base64_data: str) -> np.ndarray:
        """Decode a base64 image string to a numpy array (RGB)."""
        # Strip data URI prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]

        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return np.array(image)

    def _detect(self, image_rgb: np.ndarray) -> list[HandDetection]:
        """Run MediaPipe Hands detection on an RGB image."""
        results = self.hands.process(image_rgb)

        if not results.multi_hand_landmarks:
            return []

        detections: list[HandDetection] = []
        for i, hand_landmarks in enumerate(results.multi_hand_landmarks):
            landmarks = [
                HandLandmark(
                    x=lm.x,
                    y=lm.y,
                    z=lm.z,
                    visibility=getattr(lm, "visibility", 1.0),
                )
                for lm in hand_landmarks.landmark
            ]

            handedness = "Right"
            score = 1.0
            if results.multi_handedness and i < len(results.multi_handedness):
                classification = results.multi_handedness[i].classification[0]
                handedness = classification.label
                score = classification.score

            detections.append(
                HandDetection(
                    landmarks=landmarks,
                    handedness=handedness,
                    score=score,
                )
            )

        return detections

    def close(self):
        """Release MediaPipe resources."""
        self.hands.close()
