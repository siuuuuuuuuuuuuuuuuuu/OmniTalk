/**
 * CameraCapture - Camera Input Component
 * Person 4: Camera Capture
 *
 * Handles camera input and captures video frames for sign language translation.
 * Frames are emitted via onFrame for downstream processing (signToText service).
 * Uses expo-camera for cross-platform camera access.
 *
 * Respects accessibility settings (high contrast, font size) from AppContext.
 */

import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAccessibility } from "@/state/AppContext";
import type { CameraCaptureProps } from "@/types";

// Defaults — targetFps can be overridden via prop to match signToText config
const DEFAULT_TARGET_FPS = 15;
const FRAME_QUALITY = 0.5;

export function CameraCapture({
  onFrame,
  onSignDetected,
  onError,
  isActive = true,
  targetFps = DEFAULT_TARGET_FPS,
  isConnected = false,
}: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [isCapturing, setIsCapturing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [currentFps, setCurrentFps] = useState(0);

  const { settings } = useAccessibility();
  const highContrast = settings.highContrast;

  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const frameCountRef = useRef(0);
  const fpsCounterRef = useRef(0);
  const fpsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Animated pulse for recording indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  // Reconfigure interval when targetFps changes
  useEffect(() => {
    if (isCapturing) {
      stopCapturing();
      startCapturing();
    }
  }, [targetFps]);

  const startCapturing = useCallback(() => {
    if (captureIntervalRef.current) return;

    setIsCapturing(true);
    frameCountRef.current = 0;
    fpsCounterRef.current = 0;
    setFrameCount(0);
    setCurrentFps(0);

    const interval = Math.round(1000 / targetFps);
    captureIntervalRef.current = setInterval(async () => {
      await captureFrame();
    }, interval);

    // FPS counter — update once per second
    fpsIntervalRef.current = setInterval(() => {
      setCurrentFps(fpsCounterRef.current);
      fpsCounterRef.current = 0;
    }, 1000);
  }, [targetFps]);

  const stopCapturing = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (fpsIntervalRef.current) {
      clearInterval(fpsIntervalRef.current);
      fpsIntervalRef.current = null;
    }
    setIsCapturing(false);
    setCurrentFps(0);
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
        fpsCounterRef.current += 1;
        setFrameCount(frameCountRef.current);

        // Emit frame for downstream sign detection processing
        onFrame?.(photo.base64);
      }
    } catch (error) {
      if ((error as Error).message?.includes("permission")) {
        onError?.(error as Error);
        stopCapturing();
      }
    }
  }, [isCapturing, onFrame, onError, stopCapturing]);

  const toggleFacing = useCallback(() => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }, []);

  // ── Permission not determined ──
  if (!permission) {
    return (
      <ThemedView
        style={[styles.container, highContrast && styles.containerHighContrast]}
      >
        <View style={styles.centeredMessage}>
          <ThemedText style={styles.messageText}>
            Requesting camera permission...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // ── Permission denied ──
  if (!permission.granted) {
    return (
      <ThemedView
        style={[styles.container, highContrast && styles.containerHighContrast]}
      >
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

  // ── Camera inactive ──
  if (!isActive) {
    return (
      <ThemedView
        style={[styles.container, highContrast && styles.containerHighContrast]}
      >
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
    <View
      style={[styles.container, highContrast && styles.containerHighContrast]}
    >
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <View style={styles.overlay}>
          {/* Top bar: facing badge + status */}
          <View style={styles.statusBar}>
            <View style={styles.facingBadge}>
              <ThemedText style={styles.facingText}>
                {facing === "front" ? "Front" : "Back"}
              </ThemedText>
            </View>
            <View style={styles.statusRight}>
              {/* Connection indicator */}
              <View
                style={[
                  styles.connectionBadge,
                  isConnected
                    ? styles.connectionBadgeConnected
                    : styles.connectionBadgeDisconnected,
                ]}
              >
                <View
                  style={[
                    styles.connectionDot,
                    isConnected
                      ? styles.connectionDotConnected
                      : styles.connectionDotDisconnected,
                  ]}
                />
                <ThemedText style={styles.connectionText}>
                  {isConnected ? "Live" : "Offline"}
                </ThemedText>
              </View>
              {/* Capture indicator */}
              {isCapturing && (
                <View style={styles.recordingIndicator}>
                  <Animated.View
                    style={[styles.recordingDot, { opacity: pulseAnim }]}
                  />
                  <ThemedText style={styles.recordingText}>
                    {currentFps > 0 ? `${currentFps} fps` : "Starting..."}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* Hand positioning guide */}
          <View style={styles.handGuide}>
            <View style={styles.handGuideFrame}>
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

            {/* Frame counter */}
            <View style={styles.frameCountBadge}>
              <ThemedText style={styles.frameCountNumber}>
                {frameCount}
              </ThemedText>
              <ThemedText style={styles.frameCountLabel}>frames</ThemedText>
            </View>
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
  containerHighContrast: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: 14,
  },

  // Status bar
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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

  // Connection status
  connectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  connectionBadgeConnected: {
    backgroundColor: "rgba(5, 150, 105, 0.6)",
  },
  connectionBadgeDisconnected: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionDotConnected: {
    backgroundColor: "#34D399",
  },
  connectionDotDisconnected: {
    backgroundColor: "#94A3B8",
  },
  connectionText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  // Recording indicator
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#50C878",
  },
  recordingText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },

  // Hand guide
  handGuide: {
    alignItems: "center",
    justifyContent: "center",
  },
  handGuideFrame: {
    width: 200,
    height: 160,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 20,
  },
  handGuideText: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 12,
    marginTop: 10,
    fontWeight: "500",
  },

  // Corner markers
  cornerMark: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "rgba(255, 255, 255, 0.65)",
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
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  captureButtonActive: {
    borderColor: "#34D399",
  },
  captureButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
  },
  captureButtonInnerActive: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: "#34D399",
  },

  // Frame counter badge
  frameCountBadge: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
  },
  frameCountNumber: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  frameCountLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 8,
    fontWeight: "600",
    marginTop: -2,
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
    backgroundColor: "#059669",
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
