import { Audio } from "expo-av";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

export interface AudioCaptureProps {
  onAudioData?: (audioData: Blob | ArrayBuffer) => void;
  onRecordingStatusChange?: (isRecording: boolean) => void;
  onError?: (error: Error) => void;
}

export function AudioCapture({
  onAudioData,
  onRecordingStatusChange,
  onError,
}: AudioCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Request microphone permissions on mount
  useEffect(() => {
    requestPermissions();
    return () => {
      // Cleanup on unmount
      stopRecording();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const requestPermissions = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === "granted");

      if (status !== "granted") {
        onError?.(new Error("Microphone permission denied"));
      }

      // Configure audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      onError?.(error as Error);
      setHasPermission(false);
    }
  };

  const startRecording = useCallback(async () => {
    if (!hasPermission) {
      onError?.(new Error("Microphone permission not granted"));
      return;
    }

    try {
      // Create new recording instance with settings optimized for speech
      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: ".wav",
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".wav",
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 128000,
        },
      });

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      onRecordingStatusChange?.(true);

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [hasPermission, onError, onRecordingStatusChange]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();

      if (uri && onAudioData) {
        // Fetch the audio file and convert to blob for streaming
        const response = await fetch(uri);
        const blob = await response.blob();
        onAudioData(blob);
      }

      recordingRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
      onRecordingStatusChange?.(false);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [onAudioData, onError, onRecordingStatusChange]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (hasPermission === null) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Requesting microphone permission...</ThemedText>
      </ThemedView>
    );
  }

  if (hasPermission === false) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>
          Microphone permission denied. Please enable it in settings.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Pressable
        style={[styles.recordButton, isRecording && styles.recordButtonActive]}
        onPress={toggleRecording}
      >
        <View
          style={[
            styles.recordButtonInner,
            isRecording && styles.recordButtonInnerActive,
          ]}
        />
      </Pressable>

      <ThemedText style={styles.statusText}>
        {isRecording ? "Recording..." : "Tap to record"}
      </ThemedText>

      {isRecording && (
        <ThemedText style={styles.durationText}>
          {formatDuration(recordingDuration)}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#ff4444",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  recordButtonActive: {
    borderColor: "#ff0000",
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ff4444",
  },
  recordButtonInnerActive: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: "#ff0000",
  },
  statusText: {
    marginTop: 16,
    fontSize: 16,
  },
  durationText: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "bold",
  },
  errorText: {
    color: "#ff4444",
    textAlign: "center",
  },
});
