# OmniTalk Sign Language Detection Backend

FastAPI + WebSocket server that detects hand gestures from camera frames using MediaPipe Hands and classifies them into ASL signs.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn server:app --host 0.0.0.0 --port 8080 --reload
```

The server starts on `ws://localhost:8080/ws` (WebSocket) and `http://localhost:8080` (REST).

## How It Works

1. **React Native app** captures camera frames at 10 FPS and sends base64-encoded images over WebSocket
2. **MediaPipe Hands** (`hand_detector.py`) extracts 21 hand landmarks per detected hand
3. **Gesture classifier** (`gesture_classifier.py`) analyzes finger extension/curl geometry to identify ASL signs
4. Results stream back over the same WebSocket connection

## Supported Gestures

| Gesture | ASL Meaning | Detection Method |
|---------|------------|-----------------|
| `thumbs_up` | Yes | Rule-based |
| `thumbs_down` | No | Rule-based |
| `open_palm` | Stop | Rule-based |
| `fist` | Wait | Rule-based |
| `peace` | Hello | Rule-based |
| `point` | You | Rule-based |
| `i_love_you` | I love you | Rule-based |
| `ok_sign` | OK | Rule-based |
| `call_me` | Call me | Rule-based |
| `one` - `five` | Numbers | Rule-based |

## API

### WebSocket: `ws://localhost:8080/ws`

Send:
```json
{ "type": "process_frame", "data": "<base64_image>", "language": "ASL" }
```

Receive:
```json
{ "type": "landmarks", "landmarks": [...], "handedness": "Right" }
{ "type": "gesture", "gesture": "thumbs_up", "confidence": 0.92 }
{ "type": "text_result", "result": { "text": "Yes", "signs": ["thumbs_up"], "confidence": 0.92 } }
```

### REST: `POST /detect`

```bash
curl -X POST http://localhost:8080/detect \
  -H "Content-Type: application/json" \
  -d '{"image": "<base64>", "language": "ASL"}'
```

### Health: `GET /health`

```bash
curl http://localhost:8080/health
```

## ML Model (Optional)

For broader gesture coverage, you can train an MLP classifier on labeled landmark data:

```python
from gesture_classifier import MLGestureClassifier, landmarks_to_features

classifier = MLGestureClassifier()
classifier.train(features_array, labels_array)  # Saves to models/gesture_model.joblib
```

The server automatically loads `models/gesture_model.joblib` on startup if it exists, and falls back to rule-based classification otherwise.
