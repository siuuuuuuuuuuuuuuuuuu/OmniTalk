"""
ASL Alphabet Model Trainer.

Trains an MLP classifier on ASL fingerspelling images by:
1. Loading images from a dataset directory (one subfolder per letter)
2. Running each image through MediaPipe Hands to extract landmarks
3. Converting landmarks to a 78-feature vector
4. Training a scikit-learn MLP classifier
5. Saving the trained model to models/gesture_model.joblib

Dataset format:
    dataset/
    ├── A/
    │   ├── img001.jpg
    │   ├── img002.jpg
    │   └── ...
    ├── B/
    │   └── ...
    └── Z/
        └── ...

Popular datasets that work with this format:
- ASL Alphabet (Kaggle): https://www.kaggle.com/datasets/grassknoted/asl-alphabet
- ASL Alphabet Test (Kaggle): https://www.kaggle.com/datasets/danrasband/asl-alphabet-test

Usage:
    python train_asl.py --dataset /path/to/asl_alphabet/asl_alphabet_train
    python train_asl.py --dataset /path/to/dataset --epochs 800 --test-split 0.2
"""

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

from gesture_classifier import MLGestureClassifier, landmarks_to_features
from hand_detector import HandDetector


def collect_landmark_features(
    dataset_path: Path,
    detector: HandDetector,
    max_per_class: int | None = None,
) -> tuple[np.ndarray, np.ndarray, dict[str, int]]:
    """
    Walk through the dataset directory and extract landmark features.

    Returns:
        features: (N, 78) array of landmark feature vectors
        labels: (N,) array of label strings (e.g. "asl_a", "asl_b")
        stats: dict mapping label to number of samples extracted
    """
    features_list: list[np.ndarray] = []
    labels_list: list[str] = []
    stats: dict[str, int] = {}

    # Each subfolder is a class (A, B, C, ... Z, or custom names)
    class_dirs = sorted([d for d in dataset_path.iterdir() if d.is_dir()])

    if not class_dirs:
        # Maybe images are directly named with their label
        print(f"No subdirectories found in {dataset_path}")
        print("Expected format: dataset/A/*.jpg, dataset/B/*.jpg, etc.")
        sys.exit(1)

    print(f"Found {len(class_dirs)} classes: {[d.name for d in class_dirs]}")

    for class_dir in class_dirs:
        class_name = class_dir.name.upper()
        # Normalize to our gesture naming convention
        if len(class_name) == 1 and class_name.isalpha():
            label = f"asl_{class_name.lower()}"
        else:
            label = class_name.lower()

        # Collect image files
        image_files = sorted(
            [f for f in class_dir.iterdir()
             if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".bmp", ".webp")]
        )

        if max_per_class:
            image_files = image_files[:max_per_class]

        count = 0
        skipped = 0

        for img_path in image_files:
            # Read image
            image = cv2.imread(str(img_path))
            if image is None:
                skipped += 1
                continue

            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # Detect hand landmarks
            detections = detector._detect(image_rgb)

            if not detections:
                skipped += 1
                continue

            # Use the first detected hand
            detection = detections[0]
            feature_vector = landmarks_to_features(detection.landmarks)

            # Skip zero vectors (failed extraction)
            if np.all(feature_vector == 0):
                skipped += 1
                continue

            features_list.append(feature_vector)
            labels_list.append(label)
            count += 1

        stats[label] = count
        total = count + skipped
        print(f"  {label}: {count}/{total} images processed ({skipped} skipped — no hand detected)")

    features = np.array(features_list, dtype=np.float32)
    labels = np.array(labels_list)

    return features, labels, stats


def train_model(
    features: np.ndarray,
    labels: np.ndarray,
    test_split: float = 0.15,
    hidden_layers: tuple[int, ...] = (128, 64, 32),
    max_iter: int = 500,
    output_path: Path | None = None,
) -> None:
    """Train and evaluate the MLP gesture classifier."""

    print(f"\nDataset: {len(features)} samples, {len(set(labels))} classes")

    # Split into train/test
    X_train, X_test, y_train, y_test = train_test_split(
        features, labels, test_size=test_split, random_state=42, stratify=labels
    )
    print(f"Train: {len(X_train)} | Test: {len(X_test)}")

    # Train
    print(f"\nTraining MLP {hidden_layers}, max_iter={max_iter}...")
    start = time.time()

    classifier = MLGestureClassifier()
    classifier.train(X_train, y_train, save_path=output_path)

    elapsed = time.time() - start
    print(f"Training completed in {elapsed:.1f}s")

    # Evaluate on test set
    print("\n── Test Set Evaluation ──")
    from sklearn.preprocessing import LabelEncoder

    encoder = LabelEncoder()
    encoder.fit(labels)

    correct = 0
    predictions = []
    for feat, true_label in zip(X_test, y_test):
        feat_2d = feat.reshape(1, -1)
        probs = classifier.model.predict_proba(feat_2d)[0]
        pred_idx = np.argmax(probs)
        pred_label = classifier.label_encoder.inverse_transform([pred_idx])[0]
        predictions.append(pred_label)
        if pred_label == true_label:
            correct += 1

    accuracy = correct / len(X_test) * 100
    print(f"Accuracy: {accuracy:.1f}% ({correct}/{len(X_test)})")

    # Per-class report
    print("\nPer-class performance:")
    print(classification_report(y_test, predictions, zero_division=0))


def main():
    parser = argparse.ArgumentParser(
        description="Train ASL fingerspelling classifier from image dataset"
    )
    parser.add_argument(
        "--dataset",
        type=str,
        required=True,
        help="Path to dataset directory with one subfolder per letter (A/, B/, ... Z/)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output path for trained model (default: models/gesture_model.joblib)",
    )
    parser.add_argument(
        "--max-per-class",
        type=int,
        default=None,
        help="Max images per class (useful for large datasets). Default: all images",
    )
    parser.add_argument(
        "--test-split",
        type=float,
        default=0.15,
        help="Fraction of data for testing (default: 0.15)",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=500,
        help="Max training iterations (default: 500)",
    )
    parser.add_argument(
        "--hidden-layers",
        type=str,
        default="128,64,32",
        help="MLP hidden layer sizes, comma-separated (default: 128,64,32)",
    )

    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"Dataset path not found: {dataset_path}")
        sys.exit(1)

    output_path = Path(args.output) if args.output else None
    hidden_layers = tuple(int(x) for x in args.hidden_layers.split(","))

    print("=" * 60)
    print("OmniTalk ASL Model Trainer")
    print("=" * 60)
    print(f"Dataset: {dataset_path}")
    print(f"Max per class: {args.max_per_class or 'all'}")
    print(f"Hidden layers: {hidden_layers}")
    print()

    # Initialize MediaPipe
    print("Initializing MediaPipe Hands...")
    detector = HandDetector(
        max_num_hands=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    # Extract features
    print("\nExtracting hand landmarks from images...\n")
    features, labels, stats = collect_landmark_features(
        dataset_path, detector, max_per_class=args.max_per_class
    )

    detector.close()

    if len(features) == 0:
        print("\nNo features extracted. Check that your dataset contains hand images.")
        sys.exit(1)

    # Check minimum samples per class
    unique, counts = np.unique(labels, return_counts=True)
    min_count = counts.min()
    if min_count < 5:
        low_classes = [u for u, c in zip(unique, counts) if c < 5]
        print(f"\nWarning: Some classes have very few samples: {low_classes}")
        print("Consider adding more images or using --max-per-class to balance.")

    # Train
    train_model(
        features,
        labels,
        test_split=args.test_split,
        hidden_layers=hidden_layers,
        max_iter=args.epochs,
        output_path=output_path,
    )

    print("\nDone! Model saved. Restart the server to load the new model.")


if __name__ == "__main__":
    main()
