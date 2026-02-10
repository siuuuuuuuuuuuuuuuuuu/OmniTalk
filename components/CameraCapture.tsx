/**
 * CameraCapture - Camera Input Component
 * Person 4: Sign Language to Text and Camera Capture
 *
 * Handles camera input and captures video frames for sign language translation.
 * Uses expo-camera for cross-platform camera access.
 */

import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { CameraCaptureProps } from "@/types";

// Frame capture interval in milliseconds
const FRAME_CAPTURE_INTERVAL = 100; // 10 FPS for sign detection

export function CameraCapture({
  onFrame,
  onSignDetected,
  onError,
  isActive = true,
}: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      // Capture a frame from the camera
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5, // Lower quality for faster processing
        base64: true,
        skipProcessing: true, // Skip processing for speed
      });

      if (photo?.base64 && onFrame) {
        onFrame(photo.base64);
      }

      // TODO: Process frame for sign detection
      // This would typically send the frame to a sign detection service
      // For now, we'll simulate with placeholder logic
    } catch (error) {
      // Silently handle camera capture errors during rapid capture
      // Only report significant errors
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
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        {/* Overlay Controls */}
        <View style={styles.overlay}>
          {/* Status indicator */}
          <View style={styles.statusBar}>
            {isCapturing && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <ThemedText style={styles.recordingText}>Detecting</ThemedText>
              </View>
            )}
          </View>

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
              <ThemedText style={styles.controlButtonText}>🔄</ThemedText>
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

            {/* Placeholder for symmetry */}
            <View style={styles.controlButton} />
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
  statusBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
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
