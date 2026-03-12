"""
Sign Language Processor
Uses MediaPipe Hands (Tasks API) for landmark detection and a gesture classifier
to translate hand poses into ASL letters/words.
"""

import base64
import logging
import os
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions
from mediapipe.tasks.python.vision.core.image import Image as MpImage

from models import HandLandmark, ProcessedSignResult, SignLanguage

MODEL_PATH = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")

logger = logging.getLogger(__name__)

# ============================================
# ASL Gesture Classifier
# ============================================

# Each gesture is defined by constraints on finger states.
# A finger is "extended" when its tip is above (lower y) its PIP joint.
# Thumb extension is checked via x-distance from the palm.

# MediaPipe hand landmark indices
WRIST = 0
THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP = 1, 2, 3, 4
INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP = 5, 6, 7, 8
MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP = 9, 10, 11, 12
RING_MCP, RING_PIP, RING_DIP, RING_TIP = 13, 14, 15, 16
PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP = 17, 18, 19, 20

FINGER_TIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
FINGER_PIPS = [THUMB_IP, INDEX_PIP, MIDDLE_PIP, RING_PIP, PINKY_PIP]


def _finger_states(landmarks: list) -> List[bool]:
    """Return a list of 5 booleans indicating whether each finger is extended.

    Order: [thumb, index, middle, ring, pinky].
    """
    states: List[bool] = []

    # Thumb: compare tip x vs IP x relative to handedness.
    # Use simple heuristic: thumb tip is further from palm center than IP.
    thumb_tip = landmarks[THUMB_TIP]
    thumb_ip = landmarks[THUMB_IP]
    thumb_mcp = landmarks[THUMB_MCP]
    # Thumb is extended if tip is further from wrist (in x) than IP joint.
    states.append(
        abs(thumb_tip.x - landmarks[WRIST].x)
        > abs(thumb_ip.x - landmarks[WRIST].x)
    )

    # Other fingers: tip y < pip y means extended (lower y = higher on screen).
    for tip_idx, pip_idx in [
        (INDEX_TIP, INDEX_PIP),
        (MIDDLE_TIP, MIDDLE_PIP),
        (RING_TIP, RING_PIP),
        (PINKY_TIP, PINKY_PIP),
    ]:
        states.append(landmarks[tip_idx].y < landmarks[pip_idx].y)

    return states


def _distance(a, b) -> float:
    return ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2) ** 0.5


def classify_asl_gesture(landmarks: list) -> Tuple[str, float]:
    """Classify hand landmarks into an ASL gesture.

    Returns (gesture_name, confidence).
    This is a rule-based classifier covering common ASL letters and phrases.
    """
    fingers = _finger_states(landmarks)
    thumb, index, middle, ring, pinky = fingers
    extended_count = sum(fingers)

    # ----- Open hand (all fingers extended) -----
    if extended_count == 5:
        return ("open_hand", 0.85)

    # ----- Fist / 'S' (no fingers extended) -----
    if extended_count == 0:
        return ("S", 0.80)

    # ----- Index only → 'D' or pointing -----
    if index and not middle and not ring and not pinky:
        if thumb:
            return ("L", 0.80)
        return ("D", 0.80)

    # ----- Index + Middle → 'V' / Peace -----
    if index and middle and not ring and not pinky:
        # Check if fingers are spread apart
        tip_dist = _distance(landmarks[INDEX_TIP], landmarks[MIDDLE_TIP])
        if tip_dist > 0.05:
            return ("V", 0.85)
        else:
            return ("U", 0.75)

    # ----- Index + Middle + Ring → 'W' -----
    if index and middle and ring and not pinky:
        return ("W", 0.80)

    # ----- Thumb + Pinky (hang loose / 'Y') -----
    if thumb and pinky and not index and not middle and not ring:
        return ("Y", 0.85)

    # ----- Thumb + Index touching → 'O' / OK -----
    if not index and not middle and not ring and not pinky and thumb:
        thumb_index_dist = _distance(
            landmarks[THUMB_TIP], landmarks[INDEX_TIP]
        )
        if thumb_index_dist < 0.05:
            return ("O", 0.75)
        return ("A", 0.70)

    # ----- Index + Pinky (rock / 'I love you' without thumb) -----
    if index and not middle and not ring and pinky:
        if thumb:
            return ("I_LOVE_YOU", 0.85)
        return ("rock", 0.70)

    # ----- Pinky only → 'I' -----
    if pinky and not index and not middle and not ring:
        return ("I", 0.75)

    # ----- Thumb only → thumbs up / 'A' variant -----
    if thumb and extended_count == 1:
        # Check if thumb is pointing up
        if landmarks[THUMB_TIP].y < landmarks[THUMB_MCP].y:
            return ("thumbs_up", 0.80)
        return ("A", 0.65)

    # ----- Fallback -----
    return ("unknown", 0.30)


# Map gesture names to readable text
GESTURE_TEXT_MAP: Dict[str, str] = {
    "open_hand": "Hello",
    "S": "S",
    "A": "A",
    "D": "D",
    "L": "L",
    "V": "V / Peace",
    "U": "U",
    "W": "W",
    "Y": "Y",
    "O": "O",
    "I": "I",
    "I_LOVE_YOU": "I Love You",
    "thumbs_up": "Thumbs Up",
    "rock": "Rock On",
    "unknown": "...",
}


# ============================================
# Sign Language Processor
# ============================================


class SignLanguageProcessor:
    """Processes camera frames to detect hand landmarks and classify ASL gestures."""

    def __init__(self):
        self.detector: Optional[HandLandmarker] = None
        self._initialized = False

    def initialize(self) -> None:
        """Initialize the MediaPipe HandLandmarker (Tasks API)."""
        if self._initialized:
            return

        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                f"Hand landmarker model not found at {MODEL_PATH}. "
                "Download it from https://storage.googleapis.com/mediapipe-models/"
                "hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
            )

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.detector = HandLandmarker.create_from_options(options)
        self._initialized = True
        logger.info("SignLanguageProcessor initialized with MediaPipe Tasks API")

    def cleanup(self) -> None:
        """Release MediaPipe resources."""
        if self.detector:
            self.detector.close()
            self.detector = None
        self._initialized = False
        logger.info("SignLanguageProcessor cleaned up")

    async def process_image(
        self,
        image_data: str,
        language: SignLanguage = SignLanguage.ASL,
        client_id: str = "unknown",
    ) -> ProcessedSignResult:
        """Process a base64-encoded image and return gesture detection results."""
        if not self._initialized or not self.detector:
            self.initialize()

        start_time = time.time()

        # Decode base64 image
        try:
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]

            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is None:
                raise ValueError("Failed to decode image")
        except Exception as e:
            logger.error("Image decode error: %s", e)
            return self._empty_result(start_time)

        # Convert BGR → RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Wrap in MediaPipe Image and run detection
        mp_image = MpImage(image_format=1, data=rgb_frame)  # 1 = SRGB
        results = self.detector.detect(mp_image)

        if not results.hand_landmarks:
            return self._empty_result(start_time)

        # Convert MediaPipe landmarks to our model
        all_hand_landmarks: List[List[HandLandmark]] = []
        handedness_list: List[str] = []

        for idx, hand_lms in enumerate(results.hand_landmarks):
            lm_list = [
                HandLandmark(
                    x=lm.x,
                    y=lm.y,
                    z=lm.z,
                    visibility=getattr(lm, "visibility", None),
                )
                for lm in hand_lms
            ]
            all_hand_landmarks.append(lm_list)

            # Get handedness label
            if results.handedness and idx < len(results.handedness):
                label = results.handedness[idx][0].category_name
                handedness_list.append(label)
            else:
                handedness_list.append("Unknown")

        # Classify gesture using the first detected hand
        primary_landmarks = all_hand_landmarks[0]
        gesture, confidence = classify_asl_gesture(primary_landmarks)
        text = GESTURE_TEXT_MAP.get(gesture, gesture)

        processing_time = (time.time() - start_time) * 1000  # ms

        return ProcessedSignResult(
            gesture=gesture,
            text=text,
            confidence=confidence,
            landmarks=all_hand_landmarks,
            is_final=confidence >= 0.7,
            processing_time_ms=round(processing_time, 2),
            handedness=handedness_list,
            timestamp=int(time.time() * 1000),
        )

    def _empty_result(self, start_time: float) -> ProcessedSignResult:
        """Return a result indicating no hands were detected."""
        processing_time = (time.time() - start_time) * 1000
        return ProcessedSignResult(
            gesture="none",
            text="",
            confidence=0.0,
            landmarks=[],
            is_final=False,
            processing_time_ms=round(processing_time, 2),
            handedness=[],
            timestamp=int(time.time() * 1000),
        )
