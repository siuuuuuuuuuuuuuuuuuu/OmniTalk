/**
 * Sign Language to Text Service
 * Person 4: Sign Language to Text and Camera Capture
 *
 * Processes camera frames for sign language detection and converts to text.
 * Uses MediaPipe Hands for landmark detection and custom gesture recognition.
 *
 * NOTE: MediaPipe is not directly available in React Native.
 * This implementation provides the interface and can be connected to:
 * 1. A backend service running MediaPipe
 * 2. TensorFlow Lite models for on-device inference
 * 3. Cloud-based sign detection APIs
 */

import type {
    HandLandmark,
    SignDetectionResult,
    SignToTextResult,
} from "@/types";

// ============================================
// Configuration
// ============================================

export interface SignToTextConfig {
  backendUrl?: string; // URL for cloud processing
  useLocalModel?: boolean; // Use on-device model if available
  confidenceThreshold?: number; // Minimum confidence to report detection
  gestureBufferSize?: number; // Number of frames to buffer for gesture recognition
  language?: "ASL" | "BSL" | "ISL"; // Sign language variant
}

const DEFAULT_CONFIG: SignToTextConfig = {
  confidenceThreshold: 0.7,
  gestureBufferSize: 5,
  language: "ASL",
};

// ============================================
// Sign Recognition Dictionary
// ============================================

// Basic ASL fingerspelling and common signs
const ASL_GESTURES: Record<string, string> = {
  thumbs_up: "yes",
  thumbs_down: "no",
  open_palm: "stop",
  fist: "wait",
  peace: "hello",
  point: "you",
  wave: "goodbye",
  // Fingerspelling would be detected through sequences
};

// ============================================
// Callbacks
// ============================================

export interface SignToTextCallbacks {
  onGestureDetected?: (gesture: string, confidence: number) => void;
  onTextResult?: (result: SignToTextResult) => void;
  onError?: (error: Error) => void;
  onLandmarksDetected?: (landmarks: HandLandmark[]) => void;
}

// ============================================
// Sign to Text Service
// ============================================

export class SignToTextService {
  private config: SignToTextConfig;
  private callbacks: SignToTextCallbacks;
  private gestureBuffer: SignDetectionResult[] = [];
  private isProcessing = false;
  private ws: WebSocket | null = null;

  constructor(
    config?: Partial<SignToTextConfig>,
    callbacks: SignToTextCallbacks = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Connect to backend service for cloud-based processing
   */
  async connectToBackend(): Promise<void> {
    if (!this.config.backendUrl) {
      console.warn("SignToText: No backend URL configured");
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.backendUrl!);

        this.ws.onopen = () => {
          console.log("SignToText: Connected to backend");
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleBackendMessage(event.data);
        };

        this.ws.onerror = () => {
          this.callbacks.onError?.(new Error("Backend connection error"));
          reject(new Error("Backend connection error"));
        };

        this.ws.onclose = () => {
          console.log("SignToText: Disconnected from backend");
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Process a camera frame for sign detection
   */
  async processFrame(
    frameData: string | ArrayBuffer,
  ): Promise<SignDetectionResult | null> {
    if (this.isProcessing) return null;

    this.isProcessing = true;

    try {
      // If connected to backend, send frame for processing
      if (this.ws?.readyState === WebSocket.OPEN) {
        return await this.processRemotely(frameData);
      }

      // Otherwise, use local processing (simplified/mock)
      return await this.processLocally(frameData);
    } catch (error) {
      this.callbacks.onError?.(error as Error);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process frame using backend service
   */
  private async processRemotely(
    frameData: string | ArrayBuffer,
  ): Promise<SignDetectionResult | null> {
    return new Promise((resolve) => {
      const messageHandler = (event: MessageEvent) => {
        const response = JSON.parse(event.data);
        if (response.type === "detection_result") {
          this.ws?.removeEventListener("message", messageHandler);
          resolve(response.result);
        }
      };

      this.ws?.addEventListener("message", messageHandler);
      this.ws?.send(
        JSON.stringify({
          type: "process_frame",
          data: frameData,
          language: this.config.language,
        }),
      );

      // Timeout after 2 seconds
      setTimeout(() => {
        this.ws?.removeEventListener("message", messageHandler);
        resolve(null);
      }, 2000);
    });
  }

  /**
   * Process frame locally (placeholder for real implementation)
   * In production, this would use TensorFlow Lite or similar
   */
  private async processLocally(
    frameData: string | ArrayBuffer,
  ): Promise<SignDetectionResult | null> {
    // Placeholder implementation
    // Real implementation would:
    // 1. Run hand landmark detection model
    // 2. Extract hand features
    // 3. Classify gesture using trained model
    // 4. Return detection result

    // For now, return null to indicate no detection
    // This should be replaced with actual model inference
    return null;
  }

  /**
   * Handle messages from backend service
   */
  private handleBackendMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "landmarks":
          this.callbacks.onLandmarksDetected?.(message.landmarks);
          break;

        case "gesture":
          this.handleGestureDetection({
            gesture: message.gesture,
            confidence: message.confidence,
            timestamp: Date.now(),
          });
          break;

        case "text_result":
          this.callbacks.onTextResult?.(message.result);
          break;

        case "error":
          this.callbacks.onError?.(new Error(message.error));
          break;
      }
    } catch (error) {
      console.error("SignToText: Failed to parse backend message", error);
    }
  }

  /**
   * Handle detected gesture and buffer for text conversion
   */
  private handleGestureDetection(detection: SignDetectionResult): void {
    // Skip low-confidence detections
    if (detection.confidence < (this.config.confidenceThreshold ?? 0.7)) {
      return;
    }

    this.callbacks.onGestureDetected?.(detection.gesture, detection.confidence);

    // Add to buffer
    this.gestureBuffer.push(detection);

    // Keep buffer at configured size
    const bufferSize = this.config.gestureBufferSize ?? 5;
    if (this.gestureBuffer.length > bufferSize) {
      this.gestureBuffer.shift();
    }

    // Try to convert buffered gestures to text
    this.convertBufferToText();
  }

  /**
   * Convert gesture buffer to meaningful text
   */
  private convertBufferToText(): void {
    if (this.gestureBuffer.length === 0) return;

    // Get the most recent stable gesture (appears consistently)
    const gestureCounts = new Map<string, number>();
    this.gestureBuffer.forEach((detection) => {
      const count = gestureCounts.get(detection.gesture) || 0;
      gestureCounts.set(detection.gesture, count + 1);
    });

    // Find gesture that appears most consistently
    let dominantGesture = "";
    let maxCount = 0;
    gestureCounts.forEach((count, gesture) => {
      if (count > maxCount) {
        maxCount = count;
        dominantGesture = gesture;
      }
    });

    // If gesture appears in at least 60% of buffer, consider it stable
    const threshold = Math.ceil(this.gestureBuffer.length * 0.6);
    if (maxCount >= threshold) {
      const text = ASL_GESTURES[dominantGesture] || dominantGesture;

      const result: SignToTextResult = {
        text,
        signs: [dominantGesture],
        confidence: maxCount / this.gestureBuffer.length,
        timestamp: Date.now(),
      };

      this.callbacks.onTextResult?.(result);

      // Clear buffer after successful conversion
      this.gestureBuffer = [];
    }
  }

  /**
   * Manually trigger text conversion from current buffer
   */
  forceConvert(): SignToTextResult | null {
    if (this.gestureBuffer.length === 0) return null;

    const gestures = this.gestureBuffer.map((d) => d.gesture);
    const avgConfidence =
      this.gestureBuffer.reduce((sum, d) => sum + d.confidence, 0) /
      this.gestureBuffer.length;

    const result: SignToTextResult = {
      text: gestures.map((g) => ASL_GESTURES[g] || g).join(" "),
      signs: gestures,
      confidence: avgConfidence,
      timestamp: Date.now(),
    };

    this.gestureBuffer = [];
    return result;
  }

  /**
   * Clear the gesture buffer
   */
  clearBuffer(): void {
    this.gestureBuffer = [];
  }

  /**
   * Disconnect from backend
   */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.gestureBuffer = [];
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: Partial<SignToTextCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SignToTextConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a pre-configured sign-to-text service
 */
export function createSignToTextService(
  config?: Partial<SignToTextConfig>,
  callbacks?: SignToTextCallbacks,
): SignToTextService {
  return new SignToTextService(config, callbacks);
}

/**
 * Get supported sign languages
 */
export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return [
    { code: "ASL", name: "American Sign Language" },
    { code: "BSL", name: "British Sign Language" },
    { code: "ISL", name: "International Sign Language" },
  ];
}
