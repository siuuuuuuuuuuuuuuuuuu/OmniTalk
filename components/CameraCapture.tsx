/**
 * CameraCapture - Camera Input Component
 * Person 4: Camera Capture
 *
 * Handles camera input and captures video frames for sign language translation.
 * Frames are emitted via onFrame for downstream processing (e.g. signToText service).
 * Uses expo-camera for cross-platform camera access.
 */

import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { CameraCaptureProps, SignDetectionResult } from "@/types";

// Frame capture interval in milliseconds
const FRAME_CAPTURE_INTERVAL = 100; // 10 FPS for sign detection
const FRAME_QUALITY = 0.5; // Lower quality for faster streaming

export function CameraCapture({
  onFrame,
  onSignDetected,
  onError,
  isActive = true,
}: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [isCapturing, setIsCapturing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);

  // Animated pulse for the recording dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  const startCapturing = useCallback(() => {
    if (captureIntervalRef.current) return;

    setIsCapturing(true);
    frameCountRef.current = 0;
    setFrameCount(0);

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

        // Emit frame for downstream sign detection processing
        onFrame?.(photo.base64);
      }
    } catch (error) {
      // Only report significant errors, ignore rapid-capture glitches
      if ((error as Error).message?.includes("permission")) {
        onError?.(error as Error);
        stopCapturing();
      }
    }
  }, [isCapturing, onFrame, onError, stopCapturing]);

  const toggleFacing = useCallback(() => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }, []);

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
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <View style={styles.overlay}>
          {/* Top bar: status indicator + frame counter */}
          <View style={styles.statusBar}>
            <View style={styles.facingBadge}>
              <ThemedText style={styles.facingText}>
                {facing === "front" ? "Front" : "Back"}
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

            {/* Placeholder for symmetry */}
            <View style={styles.controlButtonPlaceholder} />
          </View>
        </View>
      </CameraView>
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
  facingBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  facingText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
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
  controlButtonPlaceholder: {
    width: 44,
    height: 44,
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
