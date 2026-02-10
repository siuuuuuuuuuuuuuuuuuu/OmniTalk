/**
 * CameraCapture - Camera Input Component
 * Person 4: Sign Language to Text and Camera Capture
 *
 * Handles camera input and captures video frames for sign language translation.
 * Integrates with SignToTextService for gesture recognition and text conversion.
 * Uses expo-camera for cross-platform camera access.
 */

import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  SignToTextService,
  type SignToTextCallbacks,
} from "@/services/signToText";
import type {
  CameraCaptureProps,
  HandLandmark,
  SignDetectionResult,
  SignToTextResult,
} from "@/types";

// Frame capture interval in milliseconds
const FRAME_CAPTURE_INTERVAL = 100; // 10 FPS for sign detection
const MAX_GESTURE_HISTORY = 8;

interface DetectedGesture {
  id: string;
  text: string;
  confidence: number;
  timestamp: number;
}

export function CameraCapture({
  onFrame,
  onSignDetected,
  onTextResult,
  onError,
  isActive = true,
  signLanguage = "ASL",
  backendUrl,
  confidenceThreshold = 0.7,
}: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentGesture, setCurrentGesture] = useState<string | null>(null);
  const [gestureConfidence, setGestureConfidence] = useState(0);
  const [landmarks, setLandmarks] = useState<HandLandmark[]>([]);
  const [gestureHistory, setGestureHistory] = useState<DetectedGesture[]>([]);

  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const signServiceRef = useRef<SignToTextService | null>(null);
  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animated values for gesture feedback
  const gestureFadeAnim = useRef(new Animated.Value(0)).current;
  const gestureScaleAnim = useRef(new Animated.Value(0.8)).current;

  // Initialize SignToTextService
  const signServiceCallbacks: SignToTextCallbacks = useMemo(
    () => ({
      onGestureDetected: (gesture: string, confidence: number) => {
        setCurrentGesture(gesture);
        setGestureConfidence(confidence);

        // Animate gesture display
        Animated.parallel([
          Animated.timing(gestureFadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(gestureScaleAnim, {
            toValue: 1,
            useNativeDriver: true,
          }),
        ]).start();

        // Clear gesture display after 2 seconds
        if (gestureTimeoutRef.current) {
          clearTimeout(gestureTimeoutRef.current);
        }
        gestureTimeoutRef.current = setTimeout(() => {
          Animated.timing(gestureFadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setCurrentGesture(null);
            gestureScaleAnim.setValue(0.8);
          });
        }, 2000);

        // Notify parent
        const result: SignDetectionResult = {
          gesture,
          confidence,
          landmarks: [],
          timestamp: Date.now(),
        };
        onSignDetected?.(result);
      },

      onTextResult: (result: SignToTextResult) => {
        // Add to history
        const entry: DetectedGesture = {
          id: `gesture-${Date.now()}`,
          text: result.text,
          confidence: result.confidence,
          timestamp: result.timestamp,
        };

        setGestureHistory((prev) => {
          const updated = [entry, ...prev];
          return updated.slice(0, MAX_GESTURE_HISTORY);
        });

        onTextResult?.(result);
      },

      onLandmarksDetected: (detectedLandmarks: HandLandmark[]) => {
        setLandmarks(detectedLandmarks);
      },

      onError: (error: Error) => {
        onError?.(error);
      },
    }),
    [onSignDetected, onTextResult, onError, gestureFadeAnim, gestureScaleAnim],
  );

  // Create/update SignToTextService when config changes
  useEffect(() => {
    const service = new SignToTextService(
      {
        backendUrl,
        confidenceThreshold,
        language: signLanguage,
        gestureBufferSize: 5,
      },
      signServiceCallbacks,
    );

    signServiceRef.current = service;

    // Connect to backend if URL is provided
    if (backendUrl) {
      service.connectToBackend().catch((error) => {
        onError?.(error as Error);
      });
    }

    return () => {
      service.disconnect();
      signServiceRef.current = null;
    };
  }, [backendUrl, signLanguage, confidenceThreshold]);

  // Update callbacks when they change (without recreating the service)
  useEffect(() => {
    signServiceRef.current?.setCallbacks(signServiceCallbacks);
  }, [signServiceCallbacks]);

  // Request permissions on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Start/stop frame capture based on isActive prop
  useEffect(() => {
    if (isActive && permission?.granted) {
      startCapturing();
    } else {
      stopCapturing();
    }

    return () => {
      stopCapturing();
    };
  }, [isActive, permission?.granted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gestureTimeoutRef.current) {
        clearTimeout(gestureTimeoutRef.current);
      }
    };
  }, []);

  const startCapturing = useCallback(() => {
    if (captureIntervalRef.current) return;

    setIsCapturing(true);
    captureIntervalRef.current = setInterval(async () => {
      await captureFrame();
    }, FRAME_CAPTURE_INTERVAL);
  }, []);

  const stopCapturing = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    setIsCapturing(false);
    setLandmarks([]);
  }, []);

  const captureFrame = useCallback(async () => {
    if (!cameraRef.current || !isCapturing) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: true,
      });

      if (photo?.base64) {
        // Pass raw frame to parent if they want it
        onFrame?.(photo.base64);

        // Process frame through SignToTextService
        const result = await signServiceRef.current?.processFrame(photo.base64);
        if (result) {
          onSignDetected?.(result);
        }
      }
    } catch (error) {
      // Only report significant errors, ignore rapid-capture glitches
      if ((error as Error).message?.includes("permission")) {
        onError?.(error as Error);
        stopCapturing();
      }
    }
  }, [isCapturing, onFrame, onSignDetected, onError, stopCapturing]);

  const toggleFacing = useCallback(() => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }, []);

  const clearHistory = useCallback(() => {
    setGestureHistory([]);
    signServiceRef.current?.clearBuffer();
  }, []);

  // Render landmark dots on the camera overlay
  const renderLandmarks = () => {
    if (landmarks.length === 0) return null;

    return (
      <View style={styles.landmarksContainer} pointerEvents="none">
        {landmarks.map((lm, index) => (
          <View
            key={index}
            style={[
              styles.landmarkDot,
              {
                left: `${lm.x * 100}%` as unknown as number,
                top: `${lm.y * 100}%` as unknown as number,
                opacity: lm.visibility ?? 1,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  // Permission not determined yet
  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Requesting camera permission...</ThemedText>
      </ThemedView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>
          Camera permission denied
        </ThemedText>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <ThemedText style={styles.permissionButtonText}>
            Grant Permission
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  // Camera not active
  if (!isActive) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.inactiveOverlay}>
          <ThemedText style={styles.inactiveText}>Camera paused</ThemedText>
          <ThemedText style={styles.inactiveSubtext}>
            Enable sign language detection to activate
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <View style={styles.overlay}>
          {/* Top bar: status + language badge */}
          <View style={styles.statusBar}>
            <View style={styles.languageBadge}>
              <ThemedText style={styles.languageText}>
                {signLanguage}
              </ThemedText>
            </View>
            {isCapturing && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <ThemedText style={styles.recordingText}>Detecting</ThemedText>
              </View>
            )}
          </View>

          {/* Hand landmarks overlay */}
          {renderLandmarks()}

          {/* Detected gesture overlay */}
          {currentGesture && (
            <Animated.View
              style={[
                styles.gestureOverlay,
                {
                  opacity: gestureFadeAnim,
                  transform: [{ scale: gestureScaleAnim }],
                },
              ]}
            >
              <ThemedText style={styles.gestureText}>
                {currentGesture}
              </ThemedText>
              <ThemedText style={styles.gestureConfidence}>
                {Math.round(gestureConfidence * 100)}% confidence
              </ThemedText>
            </Animated.View>
          )}

          {/* Hand detection guide */}
          <View style={styles.handGuide}>
            <View style={styles.handGuideFrame} />
            <ThemedText style={styles.handGuideText}>
              Position hands here
            </ThemedText>
          </View>

          {/* Bottom controls */}
          <View style={styles.controls}>
            {/* Flip camera */}
            <Pressable
              style={styles.controlButton}
              onPress={toggleFacing}
              accessibilityLabel="Flip camera"
              accessibilityRole="button"
            >
              <ThemedText style={styles.controlButtonText}>
                {"\uD83D\uDD04"}
              </ThemedText>
            </Pressable>

            {/* Capture toggle */}
            <Pressable
              style={[
                styles.captureButton,
                isCapturing && styles.captureButtonActive,
              ]}
              onPress={() => (isCapturing ? stopCapturing() : startCapturing())}
              accessibilityLabel={
                isCapturing ? "Stop detection" : "Start detection"
              }
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.captureButtonInner,
                  isCapturing && styles.captureButtonInnerActive,
                ]}
              />
            </Pressable>

            {/* Clear history */}
            <Pressable
              style={styles.controlButton}
              onPress={clearHistory}
              accessibilityLabel="Clear detected gestures"
              accessibilityRole="button"
            >
              <ThemedText style={styles.controlButtonText}>
                {"\u2715"}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </CameraView>

      {/* Gesture History */}
      {gestureHistory.length > 0 && (
        <View style={styles.historyContainer}>
          <ThemedText style={styles.historyTitle}>Detected Signs</ThemedText>
          <View style={styles.historyList}>
            {gestureHistory.map((gesture) => (
              <View key={gesture.id} style={styles.historyItem}>
                <View style={styles.historyDot} />
                <ThemedText style={styles.historyText}>
                  {gesture.text}
                </ThemedText>
                <ThemedText style={styles.historyConfidence}>
                  {Math.round(gesture.confidence * 100)}%
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: 16,
  },

  // Status bar
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  languageBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  languageText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#50C878",
    marginRight: 8,
  },
  recordingText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },

  // Landmarks
  landmarksContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  landmarkDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#50C878",
    marginLeft: -3,
    marginTop: -3,
  },

  // Gesture overlay
  gestureOverlay: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  gestureText: {
    color: "#50C878",
    fontSize: 24,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  gestureConfidence: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    marginTop: 4,
  },

  // Hand guide
  handGuide: {
    alignItems: "center",
    justifyContent: "center",
  },
  handGuideFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 20,
    borderStyle: "dashed",
  },
  handGuideText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    marginTop: 12,
  },

  // Controls
  controls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonText: {
    fontSize: 20,
    color: "#FFFFFF",
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  captureButtonActive: {
    borderColor: "#50C878",
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FFFFFF",
  },
  captureButtonInnerActive: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: "#50C878",
  },

  // Gesture history
  historyContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 160,
  },
  historyTitle: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  historyList: {
    gap: 6,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#50C878",
  },
  historyText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
  },
  historyConfidence: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
  },

  // Inactive state
  inactiveOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  inactiveText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  inactiveSubtext: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 14,
    marginTop: 8,
  },

  // Error/Permission states
  errorText: {
    color: "#FF6B6B",
    textAlign: "center",
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: "#4A90D9",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
