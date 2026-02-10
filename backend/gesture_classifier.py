"""
ASL Gesture Classifier.

Two classification modes:
1. Rule-based: Analyzes finger extension/curl states from landmarks geometry.
   Works immediately with no training data. Covers common gestures + ASL
   fingerspelling letters that are geometrically distinguishable.
2. ML model: A trained scikit-learn MLP classifier for the full ASL alphabet
   and broader gesture coverage. Train with train_asl.py.
"""

import math
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


def _distance_2d(a: HandLandmark, b: HandLandmark) -> float:
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)


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
        wrist = self.lm[WRIST]

        tip_dist = _distance(tip, index_mcp)
        ip_dist = _distance(ip, index_mcp)

        return tip_dist > ip_dist and _distance(tip, wrist) > _distance(mcp, wrist)

    def is_finger_extended(self, tip_idx: int, pip_idx: int, mcp_idx: int) -> bool:
        """A finger is extended if tip is above PIP and PIP angle is wide."""
        tip = self.lm[tip_idx]
        pip = self.lm[pip_idx]

        tip_extended = tip.y < pip.y

        dip_idx = tip_idx - 1
        angle = _angle(self.lm[mcp_idx], self.lm[pip_idx], self.lm[dip_idx])

        return tip_extended and angle > 140

    def is_finger_curled(self, tip_idx: int, pip_idx: int, mcp_idx: int) -> bool:
        """A finger is curled if tip is near or below MCP and PIP angle is tight."""
        dip_idx = tip_idx - 1
        angle = _angle(self.lm[mcp_idx], self.lm[pip_idx], self.lm[dip_idx])
        return angle < 100

    def pip_angle(self, tip_idx: int, pip_idx: int, mcp_idx: int) -> float:
        """Get the PIP joint angle for a finger."""
        dip_idx = tip_idx - 1
        return _angle(self.lm[mcp_idx], self.lm[pip_idx], self.lm[dip_idx])

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

    @property
    def index_curled(self) -> bool:
        return self.is_finger_curled(INDEX_TIP, INDEX_PIP, INDEX_MCP)

    @property
    def middle_curled(self) -> bool:
        return self.is_finger_curled(MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP)

    @property
    def ring_curled(self) -> bool:
        return self.is_finger_curled(RING_TIP, RING_PIP, RING_MCP)

    @property
    def pinky_curled(self) -> bool:
        return self.is_finger_curled(PINKY_TIP, PINKY_PIP, PINKY_MCP)

    def finger_count(self) -> int:
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
# Rule-based classifier: common gestures + ASL fingerspelling
# ──────────────────────────────────────────────────────────────

def classify_rule_based(detection: HandDetection) -> GestureResult | None:
    """
    Classify ASL gestures and fingerspelling letters using landmark geometry.

    Tries fingerspelling first (more specific), then common gestures.
    """
    lm = detection.landmarks
    if len(lm) < 21:
        return None

    # Try fingerspelling classification first
    letter = _classify_fingerspelling(lm, detection.handedness)
    if letter:
        return letter

    # Fall back to common gesture classification
    return _classify_common_gestures(lm, detection.handedness)


def _classify_fingerspelling(
    lm: list[HandLandmark], handedness: str
) -> GestureResult | None:
    """
    Classify ASL fingerspelling letters A-Z.

    Static letters (detectable from a single frame):
      A, B, C, D, E, F, G, H, I, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y

    Motion-based (need multiple frames, detected as their static start pose):
      J = starts as I
      Z = starts as index pointing
    """
    fs = FingerState(lm, handedness)
    state = fs.state_tuple()
    thumb, index, middle, ring, pinky = state
    wrist = lm[WRIST]
    thumb_tip = lm[THUMB_TIP]
    thumb_ip = lm[THUMB_IP]
    index_tip = lm[INDEX_TIP]
    index_pip = lm[INDEX_PIP]
    index_mcp = lm[INDEX_MCP]
    middle_tip = lm[MIDDLE_TIP]
    middle_pip = lm[MIDDLE_PIP]
    middle_mcp = lm[MIDDLE_MCP]
    ring_tip = lm[RING_TIP]
    ring_mcp = lm[RING_MCP]
    pinky_tip = lm[PINKY_TIP]
    pinky_mcp = lm[PINKY_MCP]

    # Helper: are fingertips touching the thumb tip?
    thumb_index_dist = _distance(thumb_tip, index_tip)
    thumb_middle_dist = _distance(thumb_tip, middle_tip)

    # Helper: is the hand pointing sideways vs upward?
    # Sideways = index MCP and index TIP have similar y but different x
    index_horizontal = abs(index_tip.y - index_mcp.y) < abs(index_tip.x - index_mcp.x)

    # ── A: Fist with thumb alongside (thumb tip beside index PIP, not tucked) ──
    if (not index and not middle and not ring and not pinky
            and thumb
            and thumb_tip.y > wrist.y  # thumb not pointing up
            and _distance(thumb_tip, index_pip) < 0.08):
        return GestureResult("asl_a", 0.82, "rule")

    # ── B: Four fingers extended and together, thumb tucked across palm ──
    if (not thumb and index and middle and ring and pinky):
        # Check fingers are close together (not spread like "four")
        index_middle_dist = _distance_2d(index_tip, middle_tip)
        middle_ring_dist = _distance_2d(middle_tip, ring_tip)
        ring_pinky_dist = _distance_2d(ring_tip, pinky_tip)
        avg_spread = (index_middle_dist + middle_ring_dist + ring_pinky_dist) / 3
        if avg_spread < 0.045:
            return GestureResult("asl_b", 0.85, "rule")

    # ── C: Curved hand forming C shape (fingers together, curved, thumb opposed) ──
    if (thumb and not fs.index_curled and not fs.pinky_curled):
        index_angle = fs.pip_angle(INDEX_TIP, INDEX_PIP, INDEX_MCP)
        middle_angle = fs.pip_angle(MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP)
        # C shape: fingers partially bent (100-150 degrees), not fully extended or curled
        if (100 < index_angle < 155 and 100 < middle_angle < 155):
            thumb_index_gap = _distance(thumb_tip, index_tip)
            # Gap between thumb and index (the C opening)
            if 0.06 < thumb_index_gap < 0.18:
                return GestureResult("asl_c", 0.78, "rule")

    # ── D: Index extended upward, middle/ring/pinky tips touch thumb tip ──
    if (index and not middle and not ring and not pinky):
        if thumb_middle_dist < 0.06:
            return GestureResult("asl_d", 0.83, "rule")

    # ── E: All fingers curled, fingertips near thumb ──
    if (not index and not middle and not ring and not pinky and not thumb):
        # Already matched as "fist" in common gestures, but E has fingertips
        # touching or very near the thumb (not tucked inside)
        all_tips_near_thumb = (
            _distance(thumb_tip, index_tip) < 0.06
            and _distance(thumb_tip, middle_tip) < 0.06
        )
        if all_tips_near_thumb:
            return GestureResult("asl_e", 0.75, "rule")

    # ── F: Index + thumb tips touching (circle), middle/ring/pinky extended ──
    if (middle and ring and pinky and thumb_index_dist < 0.045):
        return GestureResult("asl_f", 0.85, "rule")

    # ── G: Index pointing sideways, thumb parallel ──
    if (thumb and index and not middle and not ring and not pinky and index_horizontal):
        return GestureResult("asl_g", 0.80, "rule")

    # ── H: Index + middle pointing sideways ──
    if (not thumb and index and middle and not ring and not pinky and index_horizontal):
        return GestureResult("asl_h", 0.80, "rule")

    # ── I: Only pinky extended ──
    if (not thumb and not index and not middle and not ring and pinky):
        return GestureResult("asl_i", 0.88, "rule")

    # ── K: Index + middle extended in V, thumb wedged between them ──
    if (index and middle and not ring and not pinky):
        spread = _distance(index_tip, middle_tip)
        thumb_between = (
            min(index_mcp.x, middle_mcp.x) < thumb_tip.x < max(index_mcp.x, middle_mcp.x)
            or _distance(thumb_tip, index_pip) < 0.05
        )
        if spread > 0.05 and thumb and thumb_between:
            return GestureResult("asl_k", 0.78, "rule")

    # ── L: Thumb + index extended at roughly right angle ──
    if (thumb and index and not middle and not ring and not pinky):
        # L shape: thumb points sideways, index points up
        thumb_horizontal = abs(thumb_tip.x - lm[THUMB_MCP].x) > abs(thumb_tip.y - lm[THUMB_MCP].y)
        index_vertical = abs(index_tip.y - index_mcp.y) > abs(index_tip.x - index_mcp.x)
        if thumb_horizontal and index_vertical:
            return GestureResult("asl_l", 0.85, "rule")

    # ── M: Fist with three fingers (index, middle, ring) over thumb ──
    if (not index and not middle and not ring and not pinky and not thumb):
        # M: thumb tip is under/behind index, middle, ring fingers
        thumb_under_fingers = (
            thumb_tip.y > index_pip.y
            and _distance(thumb_tip, lm[RING_PIP]) < 0.08
        )
        if thumb_under_fingers:
            return GestureResult("asl_m", 0.70, "rule")

    # ── N: Fist with two fingers (index, middle) over thumb ──
    if (not index and not middle and not ring and not pinky and not thumb):
        thumb_under_two = (
            thumb_tip.y > index_pip.y
            and _distance(thumb_tip, middle_pip) < 0.06
            and _distance(thumb_tip, lm[RING_PIP]) > 0.06
        )
        if thumb_under_two:
            return GestureResult("asl_n", 0.68, "rule")

    # ── O: All fingertips touching thumb tip, forming an O ──
    if (not index and not middle and not ring and not pinky):
        tips_touch_thumb = (
            thumb_index_dist < 0.05
            and thumb_middle_dist < 0.05
        )
        if tips_touch_thumb and thumb:
            return GestureResult("asl_o", 0.80, "rule")

    # ── R: Index and middle extended and crossed ──
    if (index and middle and not ring and not pinky):
        # Crossed: middle tip is on the same side as index or overlapping in x
        if handedness == "Right":
            crossed = middle_tip.x > index_tip.x
        else:
            crossed = middle_tip.x < index_tip.x
        tips_close = _distance_2d(index_tip, middle_tip) < 0.035
        if crossed or tips_close:
            return GestureResult("asl_r", 0.75, "rule")

    # ── S: Fist with thumb across front of fingers ──
    if (not index and not middle and not ring and not pinky):
        # S: thumb in front of curled fingers
        thumb_in_front = lm[THUMB_TIP].z < lm[INDEX_PIP].z
        if not thumb and thumb_in_front:
            return GestureResult("asl_s", 0.72, "rule")

    # ── T: Thumb tucked between index and middle ──
    if (not index and not middle and not ring and not pinky):
        thumb_between_idx_mid = (
            _distance(thumb_tip, index_pip) < 0.04
            and _distance(thumb_tip, middle_pip) < 0.06
        )
        if thumb_between_idx_mid:
            return GestureResult("asl_t", 0.70, "rule")

    # ── U: Index + middle extended and together (pointing up) ──
    if (not thumb and index and middle and not ring and not pinky):
        tips_together = _distance_2d(index_tip, middle_tip) < 0.035
        if tips_together and not index_horizontal:
            return GestureResult("asl_u", 0.83, "rule")

    # ── V: Index + middle extended and spread (pointing up) ──
    if (not thumb and index and middle and not ring and not pinky):
        spread = _distance(index_tip, middle_tip)
        if spread > 0.05 and not index_horizontal:
            return GestureResult("asl_v", 0.85, "rule")

    # ── W: Index + middle + ring extended and spread ──
    if (not thumb and index and middle and ring and not pinky):
        idx_mid = _distance_2d(index_tip, middle_tip)
        mid_ring = _distance_2d(middle_tip, ring_tip)
        if idx_mid > 0.03 and mid_ring > 0.03:
            return GestureResult("asl_w", 0.83, "rule")

    # ── X: Index finger hooked (partially bent, not extended or fully curled) ──
    if (not thumb and not middle and not ring and not pinky):
        index_angle = fs.pip_angle(INDEX_TIP, INDEX_PIP, INDEX_MCP)
        # Hooked: angle between 80-140 (partially bent)
        if 80 < index_angle < 140 and index_tip.y < index_mcp.y:
            return GestureResult("asl_x", 0.75, "rule")

    # ── Y: Thumb + pinky extended, others curled ──
    if (thumb and not index and not middle and not ring and pinky):
        return GestureResult("asl_y", 0.85, "rule")

    return None


def _classify_common_gestures(
    lm: list[HandLandmark], handedness: str
) -> GestureResult | None:
    """Classify common ASL gestures (non-alphabet)."""
    fs = FingerState(lm, handedness)
    state = fs.state_tuple()
    thumb, index, middle, ring, pinky = state
    wrist = lm[WRIST]
    thumb_tip = lm[THUMB_TIP]
    index_tip = lm[INDEX_TIP]
    middle_tip = lm[MIDDLE_TIP]

    # ── Fist: all fingers curled ──
    if not any(state):
        return GestureResult("fist", 0.90, "rule")

    # ── Thumbs up: only thumb extended, tip above wrist ──
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
        spread = _distance(index_tip, middle_tip)
        if spread > 0.05:
            return GestureResult("peace", 0.90, "rule")

    # ── Open palm / Five: all fingers extended ──
    if all(state):
        return GestureResult("open_palm", 0.92, "rule")

    # ── ILY: thumb + index + pinky extended ──
    if thumb and index and not middle and not ring and pinky:
        return GestureResult("i_love_you", 0.88, "rule")

    # ── Rock on: index + pinky extended (no thumb) ──
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

    # ── Number gestures ──
    if thumb and index and not middle and not ring and not pinky:
        return GestureResult("one", 0.82, "rule")
    if not thumb and index and middle and not ring and not pinky:
        return GestureResult("two", 0.80, "rule")
    if not thumb and index and middle and ring and not pinky:
        return GestureResult("three", 0.85, "rule")
    if not thumb and index and middle and ring and pinky:
        return GestureResult("four", 0.85, "rule")

    return GestureResult("unknown", 0.3, "rule")


# ──────────────────────────────────────────────────────────────
# Gesture-to-text mapping
# ──────────────────────────────────────────────────────────────

GESTURE_TEXT_MAP: dict[str, str] = {
    # Common gestures
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
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    # ASL fingerspelling
    "asl_a": "A",
    "asl_b": "B",
    "asl_c": "C",
    "asl_d": "D",
    "asl_e": "E",
    "asl_f": "F",
    "asl_g": "G",
    "asl_h": "H",
    "asl_i": "I",
    "asl_j": "J",
    "asl_k": "K",
    "asl_l": "L",
    "asl_m": "M",
    "asl_n": "N",
    "asl_o": "O",
    "asl_p": "P",
    "asl_q": "Q",
    "asl_r": "R",
    "asl_s": "S",
    "asl_t": "T",
    "asl_u": "U",
    "asl_v": "V",
    "asl_w": "W",
    "asl_x": "X",
    "asl_y": "Y",
    "asl_z": "Z",
    "unknown": "",
}


def gesture_to_text(gesture: str) -> str:
    """Map a gesture name to its ASL text meaning."""
    return GESTURE_TEXT_MAP.get(gesture, gesture)


# ──────────────────────────────────────────────────────────────
# ML-based classifier
# ──────────────────────────────────────────────────────────────

def landmarks_to_features(landmarks: list[HandLandmark]) -> np.ndarray:
    """
    Convert 21 hand landmarks to a feature vector for ML classification.

    Features:
    - 63 values: flattened (x, y, z) for each landmark, normalized to wrist
    - 10 values: pairwise distances between fingertips
    - 5 values: angles at each finger's PIP joint
    Total: 78 features
    """
    if len(landmarks) < 21:
        return np.zeros(78)

    wrist = landmarks[WRIST]
    coords = []
    for lm in landmarks:
        coords.extend([lm.x - wrist.x, lm.y - wrist.y, lm.z - wrist.z])

    tips = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
    distances = []
    for i in range(len(tips)):
        for j in range(i + 1, len(tips)):
            distances.append(_distance(landmarks[tips[i]], landmarks[tips[j]]))

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

    Load a pre-trained model with load(), or train with train_asl.py.
    Falls back to rule-based classification if no model is loaded.
    """

    def __init__(self):
        self.model = None
        self.label_encoder = None

    def load(self, path: str | Path | None = None) -> bool:
        """Load a trained model from disk."""
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
    Unified classifier: ML model first, rule-based fallback.
    """

    def __init__(self, model_path: str | Path | None = None):
        self.ml_classifier = MLGestureClassifier()
        self.has_ml_model = self.ml_classifier.load(model_path)
        if self.has_ml_model:
            print("ML gesture model loaded — using trained ASL classifier")
        else:
            print("No ML model found — using rule-based classification")

    def classify(
        self, detection: HandDetection, prefer_ml: bool = True
    ) -> GestureResult | None:
        """
        Classify a hand gesture. ML model takes priority if available,
        with rule-based as fallback for low-confidence results.
        """
        if self.has_ml_model and prefer_ml:
            ml_result = self.ml_classifier.predict(detection)
            if ml_result and ml_result.confidence > 0.6:
                return ml_result

        return classify_rule_based(detection)
