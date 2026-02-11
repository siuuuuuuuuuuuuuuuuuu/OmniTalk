import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

/** Convert a base64 string to an ArrayBuffer (works on all platforms) */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface AudioCaptureProps {
  /** Called with audio data - for batch processing after recording stops */
  onAudioData?: (audioData: Blob | ArrayBuffer) => void;
  /** Called with audio chunks in real-time while recording */
  onAudioChunk?: (chunk: ArrayBuffer) => void;
  /** Called when recording starts - good time to connect to STT */
  onRecordingStart?: () => void;
  /** Called when recording stops */
  onRecordingStop?: () => void;
  onRecordingStatusChange?: (isRecording: boolean) => void;
  onError?: (error: Error) => void;
  /** Interval in ms to send audio chunks (default: 250ms) */
  chunkInterval?: number;
  /** Auto-start recording when component mounts */
  autoStart?: boolean;
  /** Hide the UI (for headless operation) */
  hideUI?: boolean;
}

export function AudioCapture({
  onAudioData,
  onAudioChunk,
  onRecordingStart,
  onRecordingStop,
  onRecordingStatusChange,
  onError,
  chunkInterval = 250,
  autoStart = false,
  hideUI = false,
}: AudioCaptureProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Refs for expo-av (native)
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // Refs for native chunk polling (read growing WAV file in real-time)
  const chunkPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastReadPositionRef = useRef(0);
  const isReadingChunkRef = useRef(false);

  // Refs for Web Audio API (web real-time streaming)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Ref to hold the latest onAudioChunk callback (avoids stale closure in worklet)
  const onAudioChunkRef = useRef(onAudioChunk);
  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
  }, [onAudioChunk]);

  // Request microphone permissions on mount
  useEffect(() => {
    requestPermissions();
    return () => {
      cleanup();
    };
  }, []);

  // Auto-start/stop recording based on autoStart prop
  useEffect(() => {
    if (!hasPermission) return;

    if (autoStart && !isRecording) {
      startRecording();
    } else if (!autoStart && isRecording) {
      stopRecording();
    }
  }, [autoStart, hasPermission]);

  const cleanup = () => {
    stopRecording();
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    if (chunkPollingRef.current) {
      clearInterval(chunkPollingRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const requestPermissions = async () => {
    try {
      if (Platform.OS === "web") {
        // Web: Request via navigator.mediaDevices
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop()); // Stop test stream
        setHasPermission(true);
      } else {
        // Native: Use expo-av
        const { status } = await Audio.requestPermissionsAsync();
        setHasPermission(status === "granted");

        if (status !== "granted") {
          onError?.(new Error("Microphone permission denied"));
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          playThroughEarpieceAndroid: false,
        });
      }
    } catch (error) {
      onError?.(error as Error);
      setHasPermission(false);
    }
  };

  // ==========================================
  // Web: Real-time streaming with Web Audio API (AudioWorklet)
  // ==========================================

  // AudioWorklet processor code (runs on audio thread)
  const workletProcessorCode = `
    class PCMProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
      }

      process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input[0]) {
          const inputData = input[0];
          
          // Convert Float32 to Int16 PCM
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Send to main thread
          this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
        }
        return true; // Keep processor alive
      }
    }

    registerProcessor('pcm-processor', PCMProcessor);
  `;

  const startRecordingWeb = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Create AudioContext for processing
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Create Blob URL for the AudioWorklet processor
      const blob = new Blob([workletProcessorCode], {
        type: "application/javascript",
      });
      const workletUrl = URL.createObjectURL(blob);

      // Register the AudioWorklet processor
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl); // Clean up blob URL

      // Create source from microphone stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create AudioWorkletNode (replaces deprecated ScriptProcessorNode)
      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
      workletNodeRef.current = workletNode;

      // Handle messages from the audio worklet (PCM chunks)
      workletNode.port.onmessage = (event) => {
        onAudioChunkRef.current?.(event.data);
      };

      // Connect: microphone → worklet → destination
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      // Notify recording started
      onRecordingStart?.();
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
  }, [onRecordingStart, onRecordingStatusChange, onError]);

  const stopRecordingWeb = useCallback(() => {
    try {
      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Disconnect audio nodes
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current.port.close();
        workletNodeRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      // Stop media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Notify recording stopped
      onRecordingStop?.();
      setIsRecording(false);
      setRecordingDuration(0);
      onRecordingStatusChange?.(false);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [onRecordingStop, onRecordingStatusChange, onError]);

  // ==========================================
  // Native: expo-av recording with real-time chunk streaming
  // Records to a WAV file and polls it to extract new PCM data
  // ==========================================
  const startRecordingNative = useCallback(async () => {
    if (!hasPermission) {
      onError?.(new Error("Microphone permission not granted"));
      return;
    }

    try {
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
      onRecordingStart?.();
      setIsRecording(true);
      setRecordingDuration(0);
      onRecordingStatusChange?.(true);

      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // ── Real-time chunk polling ──
      // WAV header is 44 bytes; raw Int16 PCM data starts at byte 44.
      // Poll the growing file every chunkInterval ms and send new bytes.
      lastReadPositionRef.current = 44; // skip WAV header
      isReadingChunkRef.current = false;

      chunkPollingRef.current = setInterval(async () => {
        if (isReadingChunkRef.current) return; // prevent overlapping reads
        isReadingChunkRef.current = true;
        try {
          const uri = recordingRef.current?.getURI();
          if (!uri) return;

          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (!fileInfo.exists || !fileInfo.size || fileInfo.size <= 44) return;

          const bytesToRead = fileInfo.size - lastReadPositionRef.current;
          if (bytesToRead <= 0) return;

          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: "base64",
            position: lastReadPositionRef.current,
            length: bytesToRead,
          });

          if (base64Data) {
            onAudioChunkRef.current?.(base64ToArrayBuffer(base64Data));
            lastReadPositionRef.current = fileInfo.size;
          }
        } catch {
          // Ignore read errors during active recording
        } finally {
          isReadingChunkRef.current = false;
        }
      }, chunkInterval);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [
    hasPermission,
    onError,
    onRecordingStart,
    onRecordingStatusChange,
    chunkInterval,
  ]);

  const stopRecordingNative = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      // Stop chunk polling first
      if (chunkPollingRef.current) {
        clearInterval(chunkPollingRef.current);
        chunkPollingRef.current = null;
      }

      // One final read to capture any remaining audio before stopping
      try {
        const uri = recordingRef.current.getURI();
        if (uri) {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (
            fileInfo.exists &&
            fileInfo.size &&
            fileInfo.size > lastReadPositionRef.current
          ) {
            const bytesToRead = fileInfo.size - lastReadPositionRef.current;
            const base64Data = await FileSystem.readAsStringAsync(uri, {
              encoding: "base64",
              position: lastReadPositionRef.current,
              length: bytesToRead,
            });
            if (base64Data) {
              onAudioChunkRef.current?.(base64ToArrayBuffer(base64Data));
            }
          }
        }
      } catch {
        // Ignore final-read errors
      }

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();

      if (uri && onAudioData) {
        const response = await fetch(uri);
        const blob = await response.blob();
        onAudioData(blob);
      }

      recordingRef.current = null;
      onRecordingStop?.();
      setIsRecording(false);
      setRecordingDuration(0);
      onRecordingStatusChange?.(false);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [onAudioData, onRecordingStop, onError, onRecordingStatusChange]);

  // ==========================================
  // Unified start/stop
  // ==========================================
  const startRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      await startRecordingWeb();
    } else {
      await startRecordingNative();
    }
  }, [startRecordingWeb, startRecordingNative]);

  const stopRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      stopRecordingWeb();
    } else {
      await stopRecordingNative();
    }
  }, [stopRecordingWeb, stopRecordingNative]);

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
    if (hideUI) return null;
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Requesting microphone permission...</ThemedText>
      </ThemedView>
    );
  }

  if (hasPermission === false) {
    if (hideUI) return null;
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>
          Microphone permission denied. Please enable it in settings.
        </ThemedText>
      </ThemedView>
    );
  }

  if (hideUI) return null;

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
