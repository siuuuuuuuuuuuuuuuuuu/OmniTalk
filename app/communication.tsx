/**
 * CommunicationScreen - Main Communication Interface
 * Person 1: Core UI and Real-Time Transcript Management
 *
 * This is the main screen where all users interact (deaf, mute, blind).
 * It coordinates audio capture, camera capture, live transcripts, and accessibility features.
 */

import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, View } from "react-native";

import { AccessibilityControls } from "@/components/AccessibilityControls";
import { AudioCapture } from "@/components/AudioCapture";
import { CameraCapture } from "@/components/CameraCapture";
import { LiveTranscript } from "@/components/LiveTranscript";
import { TextToSpeech } from "@/components/TextToSpeech";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { RealtimeSocketService } from "@/services/RealtimeSocket";
import {
    createSpeechToTextService,
    SpeechToTextService,
} from "@/services/speechToText";
import { useAccessibility, useApp, useTranscript } from "@/state/AppContext";
import type { SpeakerInfo, TranscriptSegment } from "@/types";

// TODO: Move to environment config
const DEEPGRAM_API_KEY = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY || "";
const WEBSOCKET_URL =
  process.env.EXPO_PUBLIC_WEBSOCKET_URL || "ws://localhost:8080";

export default function CommunicationScreen() {
  const { state, actions } = useApp();
  const { segments, speakers, addTranscript, updateTranscript } =
    useTranscript();
  const { settings, updateSettings } = useAccessibility();

  const [showSettings, setShowSettings] = useState(false);
  const [latestText, setLatestText] = useState("");
  const [sttService, setSttService] = useState<SpeechToTextService | null>(
    null,
  );
  const [socketService, setSocketService] =
    useState<RealtimeSocketService | null>(null);

  // Initialize services on mount
  useEffect(() => {
    initializeServices();
    return () => {
      cleanupServices();
    };
  }, []);

  const initializeServices = async () => {
    try {
      // Initialize Speech-to-Text service
      const stt = createSpeechToTextService(
        DEEPGRAM_API_KEY,
        {
          enableDiarization: true,
          maxSpeakers: 4,
        },
        {
          onTranscript: handleTranscriptResult,
          onError: (error) => actions.setError(error.message),
          onOpen: () => console.log("STT connected"),
          onClose: () => console.log("STT disconnected"),
        },
      );
      setSttService(stt);

      // Initialize WebSocket service for real-time communication
      const socket = new RealtimeSocketService(WEBSOCKET_URL, {
        onConnect: () => actions.setConnected(true),
        onDisconnect: () => actions.setConnected(false),
        onTranscript: handleRemoteTranscript,
        onSignDetection: handleSignDetection,
        onError: (error) => actions.setError(error.message),
      });
      setSocketService(socket);

      // Connect to WebSocket
      await socket.connect();
    } catch (error) {
      actions.setError((error as Error).message);
    }
  };

  const cleanupServices = () => {
    sttService?.disconnect();
    socketService?.disconnect();
  };

  // Handle local speech-to-text results
  const handleTranscriptResult = useCallback(
    (result: {
      transcript: string;
      isFinal: boolean;
      speaker?: number;
      confidence: number;
      start: number;
      end: number;
    }) => {
      if (!result.transcript.trim()) return;

      const segment: TranscriptSegment = {
        id: `local-${Date.now()}-${result.start}`,
        speakerId: `speaker-${result.speaker ?? 0}`,
        speakerName: `Speaker ${(result.speaker ?? 0) + 1}`,
        text: result.transcript,
        timestamp: Date.now(),
        isFinal: result.isFinal,
        confidence: result.confidence,
        source: "speech",
      };

      if (result.isFinal) {
        addTranscript(segment);
        setLatestText(result.transcript);

        // Broadcast to other participants
        socketService?.sendTranscript(segment);
      } else {
        updateTranscript(segment);
      }

      // Update speaker info
      const speakerInfo: SpeakerInfo = {
        id: segment.speakerId,
        name: segment.speakerName,
        color: getSpeakerColor(result.speaker ?? 0),
        isCurrentlySpeaking: !result.isFinal,
        lastSpoke: Date.now(),
      };
      actions.updateSpeaker(speakerInfo);
    },
    [addTranscript, updateTranscript, socketService, actions],
  );

  // Handle transcript from remote participants
  const handleRemoteTranscript = useCallback(
    (segment: TranscriptSegment) => {
      addTranscript(segment);
      setLatestText(segment.text);
    },
    [addTranscript],
  );

  // Handle sign language detection results
  const handleSignDetection = useCallback(
    (result: { text: string; userId: string }) => {
      const segment: TranscriptSegment = {
        id: `sign-${Date.now()}`,
        speakerId: result.userId,
        speakerName: "Sign Language",
        text: result.text,
        timestamp: Date.now(),
        isFinal: true,
        confidence: 0.8,
        source: "sign",
      };
      addTranscript(segment);
      setLatestText(result.text);
    },
    [addTranscript],
  );

  // Handle audio data from AudioCapture
  const handleAudioData = useCallback(
    async (audioBlob: Blob | ArrayBuffer) => {
      if (!sttService) return;

      try {
        if (!sttService.connected) {
          await sttService.connect();
        }

        if (audioBlob instanceof Blob) {
          await sttService.streamAudioBlob(audioBlob);
        } else {
          sttService.sendAudio(audioBlob);
        }
        sttService.finishStream();
      } catch (error) {
        actions.setError((error as Error).message);
      }
    },
    [sttService, actions],
  );

  // Handle recording status change
  const handleRecordingChange = useCallback(
    (isRecording: boolean) => {
      actions.setRecording(isRecording);
    },
    [actions],
  );

  // Handle camera status change
  const handleCameraChange = useCallback(
    (isActive: boolean) => {
      actions.setCameraActive(isActive);
    },
    [actions],
  );

  // Get consistent color for speaker
  const getSpeakerColor = (speakerIndex: number): string => {
    const colors = [
      "#4A90D9",
      "#50C878",
      "#FFB347",
      "#FF6B6B",
      "#9B59B6",
      "#1ABC9C",
    ];
    return colors[speakerIndex % colors.length];
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            OmniTalk
          </ThemedText>
          <View style={styles.statusIndicators}>
            <View
              style={[
                styles.statusDot,
                state.session.isConnected
                  ? styles.statusConnected
                  : styles.statusDisconnected,
              ]}
            />
            <ThemedText style={styles.statusText}>
              {state.session.isConnected ? "Connected" : "Disconnected"}
            </ThemedText>
          </View>
        </View>

        {/* Error Display */}
        {state.error && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorText}>{state.error}</ThemedText>
          </View>
        )}

        {/* Main Content Area */}
        <View style={styles.mainContent}>
          {/* Live Transcript - Primary Focus */}
          <View style={styles.transcriptContainer}>
            <LiveTranscript
              segments={segments}
              speakers={speakers}
              autoScroll={true}
              maxSegments={100}
            />
          </View>

          {/* Camera Preview (for sign language) */}
          {settings.signLanguageEnabled && (
            <View style={styles.cameraContainer}>
              <CameraCapture
                isActive={state.session.isCameraActive}
                onSignDetected={(result) => {
                  socketService?.sendSignDetection({
                    text: result.gesture,
                    signs: [result.gesture],
                    confidence: result.confidence,
                    timestamp: result.timestamp,
                  });
                }}
                onError={(error) => actions.setError(error.message)}
              />
            </View>
          )}
        </View>

        {/* Controls Area */}
        <View style={styles.controlsArea}>
          {/* Audio Capture Control */}
          <AudioCapture
            onAudioData={handleAudioData}
            onRecordingStatusChange={handleRecordingChange}
            onError={(error) => actions.setError(error.message)}
          />
        </View>

        {/* Text-to-Speech for blind users */}
        {settings.ttsEnabled && (
          <TextToSpeech
            text={latestText}
            autoSpeak={true}
            settings={{
              ttsSpeed: settings.ttsSpeed,
              ttsVoice: settings.ttsVoice,
            }}
          />
        )}

        {/* Accessibility Settings Panel */}
        {showSettings && (
          <View style={styles.settingsPanel}>
            <AccessibilityControls
              settings={settings}
              onSettingsChange={updateSettings}
            />
          </View>
        )}

        {/* Settings Toggle */}
        <View style={styles.settingsToggle}>
          <ThemedText
            style={styles.settingsToggleText}
            onPress={() => setShowSettings(!showSettings)}
          >
            {showSettings ? "✕ Close Settings" : "⚙ Settings"}
          </ThemedText>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
  },
  statusIndicators: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusConnected: {
    backgroundColor: "#50C878",
  },
  statusDisconnected: {
    backgroundColor: "#FF6B6B",
  },
  statusText: {
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: "#FF6B6B",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#FFFFFF",
    textAlign: "center",
  },
  mainContent: {
    flex: 1,
    flexDirection: "column",
  },
  transcriptContainer: {
    flex: 1,
    marginBottom: 16,
  },
  cameraContainer: {
    height: 200,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  controlsArea: {
    paddingVertical: 16,
    alignItems: "center",
  },
  settingsPanel: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: "rgba(0,0,0,0.9)",
    borderRadius: 12,
    padding: 16,
    maxHeight: 300,
  },
  settingsToggle: {
    position: "absolute",
    bottom: 16,
    right: 16,
  },
  settingsToggleText: {
    fontSize: 16,
    padding: 8,
  },
});
