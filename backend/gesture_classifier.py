"""
ASL Gesture Classifier.

Two classification modes:
1. Rule-based: Analyzes finger extension/curl states from landmarks geometry.
   Works immediately with no training data.
2. ML model: A trained scikit-learn MLP classifier for broader gesture coverage.
   Requires training data (see train_model()).

The rule-based classifier covers ~15 common ASL gestures. The ML model
can be trained to recognize the full ASL alphabet and more.
"""

import math
import os
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np

from hand_detector import HandDetection, HandLandmark

# MediaPipe hand landmark indices
WRIST = 0
THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP = 1, 2, 3, 4
INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP = 5, 6, 7, 8
MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP = 9, 10, 11, 12
RING_MCP, RING_PIP, RING_DIP, RING_TIP = 13, 14, 15, 16
PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP = 17, 18, 19, 20

MODEL_PATH = Path(__file__).parent / "models" / "gesture_model.joblib"


@dataclass
class GestureResult:
    gesture: str
    confidence: float
    method: str  # "rule" or "ml"


def _distance(a: HandLandmark, b: HandLandmark) -> float:
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)


def _angle(a: HandLandmark, b: HandLandmark, c: HandLandmark) -> float:
    """Angle at point b formed by segments ba and bc, in degrees."""
    ba = np.array([a.x - b.x, a.y - b.y, a.z - b.z])
    bc = np.array([c.x - b.x, c.y - b.y, c.z - b.z])
    cosine = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


class FingerState:
    """Analyzes extension/curl state of each finger from landmarks."""

    def __init__(self, landmarks: list[HandLandmark], handedness: str = "Right"):
        self.lm = landmarks
        self.handedness = handedness

    def is_thumb_extended(self) -> bool:
        """Thumb is extended if tip is far from index MCP."""
        tip = self.lm[THUMB_TIP]
        ip = self.lm[THUMB_IP]
        mcp = self.lm[THUMB_MCP]
        index_mcp = self.lm[INDEX_MCP]

        # Thumb tip should be farther from wrist than thumb IP
        wrist = self.lm[WRIST]
        tip_dist = _distance(tip, index_mcp)
        ip_dist = _distance(ip, index_mcp)

        # Also check if thumb tip is away from palm
        return tip_dist > ip_dist and _distance(tip, wrist) > _distance(mcp, wrist)

    def is_finger_extended(self, tip_idx: int, pip_idx: int, mcp_idx: int) -> bool:
        """A finger is extended if the tip is farther from wrist than PIP joint."""
        tip = self.lm[tip_idx]
        pip = self.lm[pip_idx]
        mcp = self.lm[mcp_idx]
        wrist = self.lm[WRIST]

        # Tip should be farther from wrist than PIP in the y direction
        # (In normalized coords, y increases downward)
        tip_extended = tip.y < pip.y

        # Also check angle at PIP — extended fingers have wider angles
        dip_idx = tip_idx - 1
        angle = _angle(self.lm[mcp_idx], self.lm[pip_idx], self.lm[dip_idx])

        return tip_extended and angle > 140

    @property
    def index_extended(self) -> bool:
        return self.is_finger_extended(INDEX_TIP, INDEX_PIP, INDEX_MCP)

    @property
    def middle_extended(self) -> bool:
        return self.is_finger_extended(MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP)

    @property
    def ring_extended(self) -> bool:
        return self.is_finger_extended(RING_TIP, RING_PIP, RING_MCP)

    @property
    def pinky_extended(self) -> bool:
        return self.is_finger_extended(PINKY_TIP, PINKY_PIP, PINKY_MCP)

    @property
    def thumb_extended(self) -> bool:
        return self.is_thumb_extended()

    def finger_count(self) -> int:
        """Count number of extended fingers (including thumb)."""
        return sum([
            self.thumb_extended,
            self.index_extended,
            self.middle_extended,
            self.ring_extended,
            self.pinky_extended,
        ])

    def state_tuple(self) -> tuple[bool, bool, bool, bool, bool]:
        """Return (thumb, index, middle, ring, pinky) extension states."""
        return (
            self.thumb_extended,
            self.index_extended,
            self.middle_extended,
            self.ring_extended,
            self.pinky_extended,
        )


# ──────────────────────────────────────────────────────────────
# Rule-based classifier
# ──────────────────────────────────────────────────────────────

def classify_rule_based(detection: HandDetection) -> GestureResult | None:
    """
    Classify a hand gesture using geometric rules on finger states.

    Covers these ASL gestures:
    - thumbs_up, thumbs_down
    - open_palm (stop), fist (wait)
    - peace / victory (hello)
    - point (you), rock_on (ILY sign)
    - ok_sign, call_me (Y hand shape)
    - one, two, three, four, five (number signs)
    """
    lm = detection.landmarks
    if len(lm) < 21:
        return None

    fs = FingerState(lm, detection.handedness)
    state = fs.state_tuple()
    thumb, index, middle, ring, pinky = state
    wrist = lm[WRIST]
    thumb_tip = lm[THUMB_TIP]
    index_tip = lm[INDEX_TIP]
    middle_tip = lm[MIDDLE_TIP]

    # ── Fist: all fingers curled ──
    if not any(state):
        return GestureResult("fist", 0.90, "rule")

    # ── Thumbs up: only thumb extended, thumb tip above wrist ──
    if thumb and not index and not middle and not ring and not pinky:
        if thumb_tip.y < wrist.y:
            return GestureResult("thumbs_up", 0.92, "rule")
        else:
            return GestureResult("thumbs_down", 0.90, "rule")

    # ── Point: only index extended ──
    if not thumb and index and not middle and not ring and not pinky:
        return GestureResult("point", 0.88, "rule")

    # ── Peace / Victory: index + middle extended ──
    if not thumb and index and middle and not ring and not pinky:
        # Check fingers are spread apart
        spread = _distance(index_tip, middle_tip)
        if spread > 0.05:
            return GestureResult("peace", 0.90, "rule")
        else:
            return GestureResult("two", 0.85, "rule")

    # ── Three: index + middle + ring ──
    if not thumb and index and middle and ring and not pinky:
        return GestureResult("three", 0.85, "rule")

    # ── Four: all fingers except thumb ──
    if not thumb and index and middle and ring and pinky:
        return GestureResult("four", 0.85, "rule")

    # ── Open palm / Five: all fingers extended ──
    if all(state):
        return GestureResult("open_palm", 0.92, "rule")

    # ── Rock on / ILY: thumb + index + pinky extended ──
    if thumb and index and not middle and not ring and pinky:
        return GestureResult("i_love_you", 0.88, "rule")

    # ── Rock: index + pinky extended (no thumb) ──
    if not thumb and index and not middle and not ring and pinky:
        return GestureResult("rock_on", 0.85, "rule")

    # ── OK sign: thumb + index tips close, other fingers extended ──
    if middle and ring and pinky:
        thumb_index_dist = _distance(thumb_tip, index_tip)
        if thumb_index_dist < 0.05:
            return GestureResult("ok_sign", 0.88, "rule")

    # ── Call me / Y shape: thumb + pinky extended ──
    if thumb and not index and not middle and not ring and pinky:
        return GestureResult("call_me", 0.85, "rule")

    # ── One: just index (with thumb helping) ──
    if thumb and index and not middle and not ring and not pinky:
        return GestureResult("one", 0.82, "rule")

    # Fallback: unknown gesture
    return GestureResult("unknown", 0.3, "rule")


# ──────────────────────────────────────────────────────────────
# Gesture-to-text mapping (ASL common signs)
# ──────────────────────────────────────────────────────────────

GESTURE_TEXT_MAP: dict[str, str] = {
    "thumbs_up": "Yes",
    "thumbs_down": "No",
    "open_palm": "Stop",
    "fist": "Wait",
    "peace": "Hello",
    "point": "You",
    "i_love_you": "I love you",
    "rock_on": "Rock on",
    "ok_sign": "OK",
    "call_me": "Call me",
    "wave": "Goodbye",
    "one": "One",
    "two": "Two",
    "three": "Three",
    "four": "Four",
    "five": "Five",
    "unknown": "",
}


def gesture_to_text(gesture: str) -> str:
    """Map a gesture name to its ASL text meaning."""
    return GESTURE_TEXT_MAP.get(gesture, gesture)


# ──────────────────────────────────────────────────────────────
# ML-based classifier (optional, for broader coverage)
# ──────────────────────────────────────────────────────────────

def landmarks_to_features(landmarks: list[HandLandmark]) -> np.ndarray:
    """
    Convert 21 hand landmarks to a feature vector for ML classification.

    Features:
    - 63 values: flattened (x, y, z) for each landmark, normalized to wrist origin
    - 10 values: pairwise distances between fingertips
    - 5 values: angles at each finger's PIP joint
    Total: 78 features
    """
    if len(landmarks) < 21:
        return np.zeros(78)

    # Normalize to wrist
    wrist = landmarks[WRIST]
    coords = []
    for lm in landmarks:
        coords.extend([lm.x - wrist.x, lm.y - wrist.y, lm.z - wrist.z])

    # Pairwise fingertip distances
    tips = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
    distances = []
    for i in range(len(tips)):
        for j in range(i + 1, len(tips)):
            distances.append(_distance(landmarks[tips[i]], landmarks[tips[j]]))

    # PIP joint angles
    pip_angles = []
    finger_joints = [
        (THUMB_MCP, THUMB_IP, THUMB_TIP),
        (INDEX_MCP, INDEX_PIP, INDEX_DIP),
        (MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP),
        (RING_MCP, RING_PIP, RING_DIP),
        (PINKY_MCP, PINKY_PIP, PINKY_DIP),
    ]
    for mcp, pip, dip in finger_joints:
        pip_angles.append(_angle(landmarks[mcp], landmarks[pip], landmarks[dip]) / 180.0)

    return np.array(coords + distances + pip_angles, dtype=np.float32)


class MLGestureClassifier:
    """
    Scikit-learn MLP classifier for ASL gesture recognition.

    Load a pre-trained model with load(), or train a new one with train().
    Falls back to rule-based classification if no model is loaded.
    """

    def __init__(self):
        self.model = None
        self.label_encoder = None

    def load(self, path: str | Path | None = None) -> bool:
        """Load a trained model from disk. Returns True if successful."""
        path = Path(path) if path else MODEL_PATH
        if not path.exists():
            return False
        try:
            data = joblib.load(path)
            self.model = data["model"]
            self.label_encoder = data["label_encoder"]
            return True
        except Exception as e:
            print(f"Failed to load model: {e}")
            return False

    def predict(self, detection: HandDetection) -> GestureResult | None:
        """Classify gesture using the ML model."""
        if self.model is None or self.label_encoder is None:
            return None

        features = landmarks_to_features(detection.landmarks)
        features_2d = features.reshape(1, -1)

        probabilities = self.model.predict_proba(features_2d)[0]
        predicted_idx = np.argmax(probabilities)
        confidence = float(probabilities[predicted_idx])
        gesture = self.label_encoder.inverse_transform([predicted_idx])[0]

        return GestureResult(gesture=gesture, confidence=confidence, method="ml")

    def train(
        self,
        features: np.ndarray,
        labels: np.ndarray,
        save_path: str | Path | None = None,
    ):
        """
        Train the gesture classifier.

        Args:
            features: (N, 78) array of landmark features
            labels: (N,) array of gesture label strings
        """
        from sklearn.neural_network import MLPClassifier
        from sklearn.preprocessing import LabelEncoder

        self.label_encoder = LabelEncoder()
        encoded_labels = self.label_encoder.fit_transform(labels)

        self.model = MLPClassifier(
            hidden_layer_sizes=(128, 64, 32),
            activation="relu",
            max_iter=500,
            random_state=42,
            early_stopping=True,
            validation_fraction=0.15,
        )
        self.model.fit(features, encoded_labels)

        save_path = Path(save_path) if save_path else MODEL_PATH
        save_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {"model": self.model, "label_encoder": self.label_encoder},
            save_path,
        )
        print(f"Model saved to {save_path}")


# ──────────────────────────────────────────────────────────────
# Unified classifier
# ──────────────────────────────────────────────────────────────

class GestureClassifier:
    """
    Unified gesture classifier that tries ML model first,
    then falls back to rule-based classification.
    """

    def __init__(self, model_path: str | Path | None = None):
        self.ml_classifier = MLGestureClassifier()
        self.has_ml_model = self.ml_classifier.load(model_path)
        if self.has_ml_model:
            print("ML gesture model loaded successfully")
        else:
            print("No ML model found — using rule-based classification")

    def classify(
        self, detection: HandDetection, prefer_ml: bool = True
    ) -> GestureResult | None:
        """
        Classify a hand gesture.

        If an ML model is loaded and prefer_ml is True, uses ML classification
        with rule-based as fallback for low-confidence results.
        Otherwise uses rule-based classification.
        """
        if self.has_ml_model and prefer_ml:
            ml_result = self.ml_classifier.predict(detection)
            if ml_result and ml_result.confidence > 0.6:
                return ml_result

        return classify_rule_based(detection)
