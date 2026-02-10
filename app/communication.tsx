/**
 * CommunicationScreen - Main Communication Interface
 * Person 1: Core UI and Real-Time Transcript Management
 *
 * This is the main screen where all users interact (deaf, mute, blind).
 * It coordinates audio capture, camera capture, live transcripts, and accessibility features.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, View, ScrollView } from "react-native";
import { router } from "expo-router";

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
const SIGN_BACKEND_URL =
  process.env.EXPO_PUBLIC_SIGN_BACKEND_URL || "ws://localhost:8080/ws";

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
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ThemedText style={styles.backButtonText}>←</ThemedText>
            </Pressable>
            <ThemedText type="title" style={styles.title}>
              OmniTalk
            </ThemedText>
          </View>

          <View style={styles.headerRight}>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  state.session.isConnected
                    ? styles.statusConnected
                    : styles.statusDisconnected,
                ]}
              />
              <ThemedText style={styles.statusText}>
                {state.session.isConnected ? "Live" : "Offline"}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Error Display */}
        {state.error && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
            <ThemedText style={styles.errorText}>{state.error}</ThemedText>
          </View>
        )}

        {/* Main Content Area */}
        <View style={styles.mainContent}>
          {/* Live Transcript - Primary Focus */}
          <View style={styles.transcriptSection}>
            <View style={styles.transcriptHeader}>
              <ThemedText style={styles.transcriptTitle}>Live Transcript</ThemedText>
              {state.session.isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingPulse} />
                  <ThemedText style={styles.recordingText}>Recording</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.transcriptContainer}>
              <LiveTranscript
                segments={segments}
                speakers={speakers}
                autoScroll={true}
                maxSegments={100}
              />
            </View>
          </View>

          {/* Camera Preview (for sign language) */}
          {settings.signLanguageEnabled && (
            <View style={styles.cameraSection}>
              <ThemedText style={styles.sectionLabel}>Sign Language</ThemedText>
              <View style={styles.cameraContainer}>
                <CameraCapture
                  isActive={state.session.isCameraActive}
                  backendUrl={SIGN_BACKEND_URL}
                  onSignDetected={(result) => {
                    socketService?.sendSignDetection({
                      text: result.gesture,
                      signs: [result.gesture],
                      confidence: result.confidence,
                      timestamp: result.timestamp,
                    });
                  }}
                  onTextResult={(result) => {
                    const segment = {
                      id: `sign-${Date.now()}`,
                      speakerId: state.session.currentUser?.id ?? "local",
                      speakerName: "Sign Language",
                      text: result.text,
                      timestamp: Date.now(),
                      isFinal: true,
                      confidence: result.confidence,
                      source: "sign" as const,
                    };
                    addTranscript(segment);
                    setLatestText(result.text);
                    socketService?.sendSignDetection(result);
                  }}
                  onError={(error) => actions.setError(error.message)}
                />
              </View>
            </View>
          )}
        </View>

        {/* Controls Area */}
        <View style={styles.controlsSection}>
          <View style={styles.controlsCard}>
            <AudioCapture
              onAudioData={handleAudioData}
              onRecordingStatusChange={handleRecordingChange}
              onError={(error) => actions.setError(error.message)}
            />
          </View>
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
          <View style={styles.settingsModal}>
            <View style={styles.settingsContent}>
              <View style={styles.settingsHeader}>
                <ThemedText style={styles.settingsTitle}>Settings</ThemedText>
                <Pressable
                  onPress={() => setShowSettings(false)}
                  style={styles.closeButton}
                >
                  <ThemedText style={styles.closeButtonText}>✕</ThemedText>
                </Pressable>
              </View>
              <ScrollView style={styles.settingsScroll}>
                <AccessibilityControls
                  settings={settings}
                  onSettingsChange={updateSettings}
                />
              </ScrollView>
            </View>
          </View>
        )}

        {/* Settings FAB */}
        <Pressable
          style={styles.settingsFab}
          onPress={() => setShowSettings(!showSettings)}
        >
          <ThemedText style={styles.settingsFabIcon}>⚙</ThemedText>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFB",
  },
  container: {
    flex: 1,
    backgroundColor: "#F8FAFB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F0F9FF",
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 24,
    color: "#2196F3",
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2196F3",
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusConnected: {
    backgroundColor: "#10B981",
  },
  statusDisconnected: {
    backgroundColor: "#EF4444",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EF4444",
  },
  errorIcon: {
    fontSize: 20,
  },
  errorText: {
    flex: 1,
    color: "#DC2626",
    fontWeight: "600",
    fontSize: 14,
  },
  mainContent: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  transcriptSection: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  transcriptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#F8FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  transcriptTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordingPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  recordingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
  },
  transcriptContainer: {
    flex: 1,
  },
  cameraSection: {
    height: 240,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#2196F3",
    backgroundColor: "#000000",
  },
  controlsSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  controlsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  settingsModal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  settingsContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    width: "100%",
    maxWidth: 500,
    maxHeight: "80%",
    overflow: "hidden",
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1E293B",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 20,
    color: "#64748B",
    fontWeight: "600",
  },
  settingsScroll: {
    padding: 24,
  },
  settingsFab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2196F3",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  settingsFabIcon: {
    fontSize: 28,
    color: "#FFFFFF",
  },
});
