/**
 * TextToSpeech - Text-to-Speech Component
 * Person 2: Accessibility and Visual Customization
 *
 * Implements TTS for blind users to hear transcribed text or signed content.
 * Uses expo-speech for cross-platform text-to-speech conversion.
 *
 * Features:
 * - Play/pause/resume/stop controls
 * - Voice selection picker
 * - Speech queue with status display
 * - Animated waveform visualization
 * - Speaker name announcement before content
 * - Auto-speak mode for continuous transcript reading
 * - Haptic feedback on state changes
 */

import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { TextToSpeechProps } from "@/types";

interface Voice {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

interface QueueItem {
  id: string;
  text: string;
  speakerName?: string;
  timestamp: number;
}

export function TextToSpeech({
  text,
  autoSpeak = false,
  settings,
  onSpeakStart,
  onSpeakEnd,
}: TextToSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null);

  const lastSpokenText = useRef<string>("");
  const speakingQueue = useRef<QueueItem[]>([]);
  const isProcessingQueue = useRef(false);

  // Waveform animation values (5 bars)
  const waveAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3)),
  ).current;
  const waveAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Load available voices on mount
  useEffect(() => {
    loadVoices();
  }, []);

  // Auto-speak when text changes (if enabled)
  useEffect(() => {
    if (autoSpeak && text && text !== lastSpokenText.current) {
      lastSpokenText.current = text;
      addToQueue(text);
    }
  }, [text, autoSpeak]);

  // Sync selected voice with settings
  useEffect(() => {
    if (settings?.ttsVoice && availableVoices.length > 0) {
      const voice = availableVoices.find(
        (v) =>
          v.identifier === settings.ttsVoice || v.name === settings.ttsVoice,
      );
      if (voice) {
        setSelectedVoice(voice);
      }
    }
  }, [settings?.ttsVoice, availableVoices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
      stopWaveAnimation();
    };
  }, []);

  // Start/stop waveform animation based on speaking state
  useEffect(() => {
    if (isSpeaking && !isPaused) {
      startWaveAnimation();
    } else {
      stopWaveAnimation();
    }
  }, [isSpeaking, isPaused]);

  const loadVoices = async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const englishVoices = voices.filter((v) => v.language.startsWith("en"));
      const voiceList = englishVoices.length > 0 ? englishVoices : voices;
      setAvailableVoices(voiceList);

      // Set default voice
      if (voiceList.length > 0 && !selectedVoice) {
        const defaultVoice =
          voiceList.find(
            (v) => v.quality === "Enhanced" || v.quality === "Premium",
          ) || voiceList[0];
        setSelectedVoice(defaultVoice);
      }
    } catch (err) {
      console.error("Failed to load voices:", err);
    }
  };

  const startWaveAnimation = () => {
    const animations = waveAnims.map((anim, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.8 + Math.random() * 0.2,
            duration: 300 + index * 80,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2 + Math.random() * 0.2,
            duration: 300 + index * 80,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    waveAnimationRef.current = Animated.parallel(animations);
    waveAnimationRef.current.start();
  };

  const stopWaveAnimation = () => {
    waveAnimationRef.current?.stop();
    waveAnims.forEach((anim) => {
      Animated.timing(anim, {
        toValue: 0.3,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  const addToQueue = useCallback(
    (textToSpeak: string, speakerName?: string) => {
      if (!textToSpeak.trim()) return;

      const item: QueueItem = {
        id: `tts-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        text: textToSpeak,
        speakerName,
        timestamp: Date.now(),
      };

      speakingQueue.current.push(item);
      setQueueItems([...speakingQueue.current]);

      if (!isProcessingQueue.current) {
        processQueue();
      }
    },
    [],
  );

  const processQueue = useCallback(async () => {
    if (speakingQueue.current.length === 0) {
      isProcessingQueue.current = false;
      setCurrentItem(null);
      return;
    }

    isProcessingQueue.current = true;
    const item = speakingQueue.current.shift()!;
    setCurrentItem(item);
    setQueueItems([...speakingQueue.current]);

    // Build the full text to speak (prepend speaker name if available)
    const fullText = item.speakerName
      ? `${item.speakerName} says: ${item.text}`
      : item.text;

    await speakText(fullText);
  }, []);

  const speakText = useCallback(
    async (textToSpeak: string) => {
      if (!textToSpeak.trim()) return;

      try {
        setIsSpeaking(true);
        setError(null);
        onSpeakStart?.();

        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        const speechOptions: Speech.SpeechOptions = {
          rate: settings?.ttsSpeed ?? 1.0,
          pitch: 1.0,
          language: "en-US",
          onStart: () => setIsSpeaking(true),
          onDone: () => {
            setIsSpeaking(false);
            setIsPaused(false);
            onSpeakEnd?.();
            // Process next in queue
            processQueue();
          },
          onError: () => {
            setError("Speech error occurred");
            setIsSpeaking(false);
            setIsPaused(false);
            onSpeakEnd?.();
            processQueue();
          },
          onStopped: () => {
            setIsSpeaking(false);
            setIsPaused(false);
            onSpeakEnd?.();
          },
        };

        // Use selected voice
        if (selectedVoice) {
          speechOptions.voice = selectedVoice.identifier;
        } else if (settings?.ttsVoice) {
          const voice = availableVoices.find(
            (v) =>
              v.identifier === settings.ttsVoice ||
              v.name === settings.ttsVoice,
          );
          if (voice) {
            speechOptions.voice = voice.identifier;
          }
        }

        await Speech.speak(textToSpeak, speechOptions);
      } catch (err) {
        setError((err as Error).message);
        setIsSpeaking(false);
        processQueue();
      }
    },
    [
      settings,
      selectedVoice,
      availableVoices,
      onSpeakStart,
      onSpeakEnd,
      processQueue,
    ],
  );

  const speak = useCallback(
    (textToSpeak: string) => {
      addToQueue(textToSpeak);
    },
    [addToQueue],
  );

  const stop = useCallback(async () => {
    try {
      await Speech.stop();
      speakingQueue.current = [];
      setQueueItems([]);
      setCurrentItem(null);
      setIsSpeaking(false);
      setIsPaused(false);
      isProcessingQueue.current = false;

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (err) {
      console.error("Failed to stop speech:", err);
    }
  }, []);

  const pause = useCallback(async () => {
    if (Platform.OS === "ios") {
      try {
        await Speech.pause();
        setIsPaused(true);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch (err) {
        console.error("Failed to pause speech:", err);
      }
    } else {
      // Android doesn't support pause, so we stop instead
      await stop();
    }
  }, [stop]);

  const resume = useCallback(async () => {
    if (Platform.OS === "ios") {
      try {
        await Speech.resume();
        setIsPaused(false);
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      } catch (err) {
        console.error("Failed to resume speech:", err);
      }
    }
  }, []);

  const replay = useCallback(() => {
    if (text) {
      stop().then(() => speak(text));
    }
  }, [text, speak, stop]);

  const selectVoice = useCallback((voice: Voice) => {
    setSelectedVoice(voice);
    setShowVoicePicker(false);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const renderVoiceItem = ({ item }: { item: Voice }) => (
    <Pressable
      style={[
        styles.voiceItem,
        selectedVoice?.identifier === item.identifier &&
          styles.voiceItemSelected,
      ]}
      onPress={() => selectVoice(item)}
      accessibilityLabel={`Select voice ${item.name}`}
      accessibilityRole="button"
    >
      <View style={styles.voiceItemContent}>
        <ThemedText
          style={[
            styles.voiceName,
            selectedVoice?.identifier === item.identifier &&
              styles.voiceNameSelected,
          ]}
        >
          {item.name}
        </ThemedText>
        <ThemedText style={styles.voiceLanguage}>{item.language}</ThemedText>
      </View>
      {selectedVoice?.identifier === item.identifier && (
        <ThemedText style={styles.voiceCheckmark}>✓</ThemedText>
      )}
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Waveform Visualization */}
      <View style={styles.waveformContainer}>
        {waveAnims.map((anim, index) => (
          <Animated.View
            key={index}
            style={[
              styles.waveBar,
              isSpeaking && !isPaused
                ? styles.waveBarActive
                : styles.waveBarInactive,
              {
                transform: [{ scaleY: anim }],
              },
            ]}
          />
        ))}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Play/Pause Button */}
        {!isSpeaking ? (
          <Pressable
            style={[styles.button, styles.playButton]}
            onPress={() => speak(text)}
            accessibilityLabel="Speak text"
            accessibilityRole="button"
            accessibilityHint="Reads the current transcript text aloud"
          >
            <ThemedText style={styles.buttonIcon}>▶</ThemedText>
          </Pressable>
        ) : isPaused ? (
          <Pressable
            style={[styles.button, styles.playButton]}
            onPress={resume}
            accessibilityLabel="Resume speaking"
            accessibilityRole="button"
          >
            <ThemedText style={styles.buttonIcon}>▶</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.pauseButton]}
            onPress={pause}
            accessibilityLabel="Pause speaking"
            accessibilityRole="button"
          >
            <ThemedText style={styles.buttonIcon}>⏸</ThemedText>
          </Pressable>
        )}

        {/* Stop Button */}
        <Pressable
          style={[
            styles.button,
            styles.stopButton,
            !isSpeaking && styles.buttonDisabled,
          ]}
          onPress={stop}
          disabled={!isSpeaking}
          accessibilityLabel="Stop speaking"
          accessibilityRole="button"
        >
          <ThemedText style={styles.buttonIcon}>⏹</ThemedText>
        </Pressable>

        {/* Replay Button */}
        <Pressable
          style={[styles.button, styles.replayButton]}
          onPress={replay}
          accessibilityLabel="Replay last text"
          accessibilityRole="button"
          accessibilityHint="Replays the most recent transcript text"
        >
          <ThemedText style={styles.buttonIcon}>🔄</ThemedText>
        </Pressable>

        {/* Voice Picker Button */}
        <Pressable
          style={[styles.button, styles.voiceButton]}
          onPress={() => setShowVoicePicker(true)}
          accessibilityLabel={`Select voice. Current: ${selectedVoice?.name ?? "Default"}`}
          accessibilityRole="button"
        >
          <ThemedText style={styles.buttonIcon}>🎙</ThemedText>
        </Pressable>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        {/* Speaking Status */}
        <View style={styles.statusLeft}>
          {isSpeaking && !isPaused && (
            <View style={styles.speakingIndicator}>
              <View style={styles.speakingDot} />
              <ThemedText style={styles.statusText}>Speaking...</ThemedText>
            </View>
          )}
          {isPaused && (
            <View style={styles.speakingIndicator}>
              <View style={styles.pausedDot} />
              <ThemedText style={styles.statusText}>Paused</ThemedText>
            </View>
          )}
          {!isSpeaking && !isPaused && (
            <ThemedText style={styles.statusTextIdle}>Ready</ThemedText>
          )}
        </View>

        {/* Speed & Voice Info */}
        <View style={styles.statusRight}>
          <ThemedText style={styles.infoText}>
            {settings?.ttsSpeed ?? 1.0}x
          </ThemedText>
          {selectedVoice && (
            <ThemedText style={styles.infoText} numberOfLines={1}>
              {selectedVoice.name.length > 12
                ? selectedVoice.name.substring(0, 12) + "..."
                : selectedVoice.name}
            </ThemedText>
          )}
        </View>
      </View>

      {/* Queue Status */}
      {queueItems.length > 0 && (
        <View style={styles.queueStatus}>
          <ThemedText style={styles.queueText}>
            {queueItems.length} item{queueItems.length !== 1 ? "s" : ""} in
            queue
          </ThemedText>
          <Pressable
            onPress={() => {
              speakingQueue.current = [];
              setQueueItems([]);
            }}
            accessibilityLabel="Clear speech queue"
            accessibilityRole="button"
          >
            <ThemedText style={styles.clearQueueText}>Clear</ThemedText>
          </Pressable>
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable onPress={() => setError(null)}>
            <ThemedText style={styles.dismissError}>✕</ThemedText>
          </Pressable>
        </View>
      )}

      {/* Currently Speaking Text Preview */}
      {currentItem && isSpeaking && (
        <View style={styles.currentTextPreview}>
          <ThemedText style={styles.currentTextLabel}>Now reading:</ThemedText>
          <ThemedText style={styles.currentText} numberOfLines={2}>
            {currentItem.text}
          </ThemedText>
        </View>
      )}

      {/* Voice Picker Modal */}
      <Modal
        visible={showVoicePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowVoicePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Voice</ThemedText>
              <Pressable
                onPress={() => setShowVoicePicker(false)}
                style={styles.modalCloseButton}
                accessibilityLabel="Close voice picker"
                accessibilityRole="button"
              >
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            {availableVoices.length === 0 ? (
              <View style={styles.noVoicesContainer}>
                <ThemedText style={styles.noVoicesText}>
                  No voices available on this device
                </ThemedText>
              </View>
            ) : (
              <FlatList
                data={availableVoices}
                renderItem={renderVoiceItem}
                keyExtractor={(item) => item.identifier}
                style={styles.voiceList}
                showsVerticalScrollIndicator={true}
              />
            )}

            {/* Preview button */}
            {selectedVoice && (
              <Pressable
                style={styles.previewButton}
                onPress={() => {
                  Speech.speak("This is a preview of the selected voice.", {
                    voice: selectedVoice.identifier,
                    rate: settings?.ttsSpeed ?? 1.0,
                  });
                }}
                accessibilityLabel="Preview selected voice"
                accessibilityRole="button"
              >
                <ThemedText style={styles.previewButtonText}>
                  Preview Voice
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    marginVertical: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  // Waveform
  waveformContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    height: 40,
    gap: 4,
    marginBottom: 12,
  },
  waveBar: {
    width: 6,
    height: 32,
    borderRadius: 3,
  },
  waveBarActive: {
    backgroundColor: "#50C878",
  },
  waveBarInactive: {
    backgroundColor: "#CBD5E1",
  },
  // Controls
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playButton: {
    backgroundColor: "#50C878",
  },
  pauseButton: {
    backgroundColor: "#FFB347",
  },
  stopButton: {
    backgroundColor: "#FF6B6B",
  },
  replayButton: {
    backgroundColor: "#4A90D9",
  },
  voiceButton: {
    backgroundColor: "#9B59B6",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonIcon: {
    fontSize: 20,
    color: "#FFFFFF",
  },
  // Status Bar
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  speakingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#50C878",
  },
  pausedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFB347",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  statusTextIdle: {
    fontSize: 13,
    color: "#94A3B8",
  },
  infoText: {
    fontSize: 11,
    color: "#94A3B8",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  // Queue
  queueStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F0F9FF",
    borderRadius: 8,
  },
  queueText: {
    fontSize: 12,
    color: "#4A90D9",
  },
  clearQueueText: {
    fontSize: 12,
    color: "#FF6B6B",
    fontWeight: "600",
  },
  // Error
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    flex: 1,
  },
  dismissError: {
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "600",
    paddingLeft: 8,
  },
  // Current text preview
  currentTextPreview: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#50C878",
  },
  currentTextLabel: {
    fontSize: 10,
    color: "#16A34A",
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  currentText: {
    fontSize: 13,
    color: "#1E293B",
    lineHeight: 18,
  },
  // Voice Picker Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "60%",
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "600",
  },
  voiceList: {
    paddingHorizontal: 16,
  },
  voiceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginVertical: 2,
  },
  voiceItemSelected: {
    backgroundColor: "#F0F9FF",
  },
  voiceItemContent: {
    flex: 1,
  },
  voiceName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1E293B",
  },
  voiceNameSelected: {
    color: "#4A90D9",
    fontWeight: "600",
  },
  voiceLanguage: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  voiceCheckmark: {
    fontSize: 18,
    color: "#4A90D9",
    fontWeight: "700",
  },
  noVoicesContainer: {
    padding: 32,
    alignItems: "center",
  },
  noVoicesText: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  previewButton: {
    marginHorizontal: 24,
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: "#9B59B6",
    borderRadius: 12,
    alignItems: "center",
  },
  previewButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
