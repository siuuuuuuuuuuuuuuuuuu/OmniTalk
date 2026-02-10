# OmniTalk Sign Language Detection Backend

FastAPI + WebSocket server that detects hand gestures from camera frames using MediaPipe Hands and classifies them into ASL signs, including fingerspelling (A-Z).

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
3. **Gesture classifier** (`gesture_classifier.py`) analyzes finger geometry to identify ASL signs
4. Results stream back over the same WebSocket connection

## Supported Gestures

### Common Gestures (rule-based, works immediately)

| Gesture | ASL Meaning |
|---------|------------|
| `thumbs_up` / `thumbs_down` | Yes / No |
| `open_palm` | Stop |
| `fist` | Wait |
| `peace` | Hello |
| `point` | You |
| `i_love_you` | I love you |
| `ok_sign` | OK |
| `call_me` | Call me |
| `one` - `four` | Numbers 1-4 |

### ASL Fingerspelling (rule-based, works immediately)

Letters detected by analyzing finger positions from a single frame:

**High confidence (~80-88%):** A, B, D, F, G, H, I, L, U, V, W, Y

**Medium confidence (~70-78%):** C, E, K, M, N, O, R, S, T, X

**Motion-based (detected as start pose):** J (= I pose), Z (= point pose)

### Full ASL Alphabet (ML model, requires training)

Train the MLP classifier for reliable recognition of all 26 letters:

```bash
python train_asl.py --dataset /path/to/asl_alphabet_train
```

## Training the ML Model

### 1. Get a dataset

Download an ASL alphabet image dataset. Recommended:
- [ASL Alphabet (Kaggle)](https://www.kaggle.com/datasets/grassknoted/asl-alphabet) — 87,000 images, 200x200px

Dataset format — one folder per letter:
```
asl_alphabet_train/
├── A/    (3000 images)
├── B/    (3000 images)
├── ...
└── Z/    (3000 images)
```

### 2. Train

```bash
# Full training (all images)
python train_asl.py --dataset /path/to/asl_alphabet_train

# Quick training (500 images per letter, faster)
python train_asl.py --dataset /path/to/asl_alphabet_train --max-per-class 500

# Custom config
python train_asl.py \
  --dataset /path/to/data \
  --max-per-class 1000 \
  --epochs 800 \
  --hidden-layers 256,128,64 \
  --test-split 0.2
```

### 3. Use

The trained model saves to `models/gesture_model.joblib`. Restart the server and it will automatically load the model and use it (with rule-based as fallback for low-confidence predictions).

## API

### WebSocket: `ws://localhost:8080/ws`

Send:
```json
{ "type": "process_frame", "data": "<base64_image>", "language": "ASL" }
```

Receive:
```json
{ "type": "landmarks", "landmarks": [...], "handedness": "Right" }
{ "type": "gesture", "gesture": "asl_a", "confidence": 0.92, "method": "ml" }
{ "type": "text_result", "result": { "text": "A", "signs": ["asl_a"], "confidence": 0.92 } }
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

## Files

| File | Purpose |
|------|---------|
| `server.py` | FastAPI + WebSocket server |
| `hand_detector.py` | MediaPipe Hands landmark extraction |
| `gesture_classifier.py` | Rule-based + ML gesture classification |
| `train_asl.py` | Training script for ML model |
| `models/` | Trained model output directory |
| `requirements.txt` | Python dependencies |
