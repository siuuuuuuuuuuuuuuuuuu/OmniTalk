/**
 * CameraCapture - Camera Input Component
 * Person 4: Camera Capture
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
const FRAME_QUALITY = 0.5; // Lower quality for faster streaming
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
  const [frameCount, setFrameCount] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);
  const signServiceRef = useRef<SignToTextService | null>(null);
  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animated values for gesture feedback
  const gestureFadeAnim = useRef(new Animated.Value(0)).current;
  const gestureScaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
        }, 2000) as unknown as NodeJS.Timeout;

        // Notify parent
        const result: SignDetectionResult = {
          gesture,
          confidence,
          landmarks: [],
          timestamp: Date.now(),
          isFinal: true,
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

      onLandmarksDetected: (detectedLandmarks: HandLandmark[][]) => {
        // Flatten array of arrays to single array for display
        setLandmarks(detectedLandmarks.flat());
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
        backendUrl: backendUrl || "",
        confidenceThreshold,
        language: signLanguage,
      },
      signServiceCallbacks,
    );

    signServiceRef.current = service;

    return () => {
      service.disconnect();
      signServiceRef.current = null;
    };
  }, [backendUrl, signLanguage, confidenceThreshold]);

  // Update callbacks when they change (without recreating the service)
  useEffect(() => {
    signServiceRef.current?.setCallbacks(signServiceCallbacks);
  }, [signServiceCallbacks]);

  // Start pulse animation when capturing
  useEffect(() => {
    if (isCapturing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isCapturing, pulseAnim]);

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
    frameCountRef.current = 0;
    setFrameCount(0);

    captureIntervalRef.current = setInterval(async () => {
      await captureFrame();
    }, FRAME_CAPTURE_INTERVAL) as unknown as NodeJS.Timeout;
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
        quality: FRAME_QUALITY,
        base64: true,
        skipProcessing: true,
      });

      if (photo?.base64) {
        frameCountRef.current += 1;
        setFrameCount(frameCountRef.current);

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
        <View style={styles.centeredMessage}>
          <ThemedText style={styles.messageText}>
            Requesting camera permission...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centeredMessage}>
          <ThemedText style={styles.errorText}>
            Camera permission is required for sign language detection
          </ThemedText>
          <Pressable
            style={({ pressed }) => [
              styles.permissionButton,
              pressed && styles.permissionButtonPressed,
            ]}
            onPress={requestPermission}
          >
            <ThemedText style={styles.permissionButtonText}>
              Grant Permission
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  // Camera not active
  if (!isActive) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.inactiveOverlay}>
          <ThemedText style={styles.inactiveIcon}>{"\uD83D\uDCF7"}</ThemedText>
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
                <Animated.View
                  style={[styles.recordingDot, { opacity: pulseAnim }]}
                />
                <ThemedText style={styles.recordingText}>
                  Capturing
                </ThemedText>
                <ThemedText style={styles.frameCountText}>
                  {frameCount} frames
                </ThemedText>
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
            <View style={styles.handGuideFrame}>
              {/* Corner markers for the guide box */}
              <View style={[styles.cornerMark, styles.cornerTopLeft]} />
              <View style={[styles.cornerMark, styles.cornerTopRight]} />
              <View style={[styles.cornerMark, styles.cornerBottomLeft]} />
              <View style={[styles.cornerMark, styles.cornerBottomRight]} />
            </View>
            <ThemedText style={styles.handGuideText}>
              Position hands within the frame
            </ThemedText>
          </View>

          {/* Bottom controls */}
          <View style={styles.controls}>
            {/* Flip camera */}
            <Pressable
              style={({ pressed }) => [
                styles.controlButton,
                pressed && styles.controlButtonPressed,
              ]}
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
                isCapturing ? "Stop capture" : "Start capture"
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
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#50C878",
  },
  recordingText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  frameCountText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 10,
    fontWeight: "500",
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
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 20,
  },
  handGuideText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginTop: 12,
    fontWeight: "500",
  },

  // Corner markers for the guide frame
  cornerMark: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "rgba(255, 255, 255, 0.7)",
  },
  cornerTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 20,
  },
  cornerTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 20,
  },
  cornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 20,
  },
  cornerBottomRight: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 20,
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
  controlButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.35)",
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

  // Inactive / Permission states
  centeredMessage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  messageText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 15,
    fontWeight: "500",
  },
  inactiveOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    gap: 8,
  },
  inactiveIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  inactiveText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  inactiveSubtext: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
  },

  // Error/Permission states
  errorText: {
    color: "#FF6B6B",
    textAlign: "center",
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: "#4A90D9",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonPressed: {
    opacity: 0.9,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});
