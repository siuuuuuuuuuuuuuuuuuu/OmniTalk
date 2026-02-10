/**
 * TextToSpeech - Text-to-Speech Component
 * Person 2: Accessibility and Visual Customization
 *
 * Implements TTS for blind users to hear transcribed text or signed content.
 * Uses expo-speech for cross-platform text-to-speech conversion.
 */

import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { TextToSpeechProps } from "@/types";

interface Voice {
  identifier: string;
  name: string;
  quality: string;
  language: string;
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
  const [error, setError] = useState<string | null>(null);
  const lastSpokenText = useRef<string>("");
  const speakingQueue = useRef<string[]>([]);

  // Load available voices on mount
  useEffect(() => {
    loadVoices();
  }, []);

  // Auto-speak when text changes (if enabled)
  useEffect(() => {
    if (autoSpeak && text && text !== lastSpokenText.current) {
      lastSpokenText.current = text;
      speak(text);
    }
  }, [text, autoSpeak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const loadVoices = async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      // Filter to English voices by default
      const englishVoices = voices.filter((v) => v.language.startsWith("en"));
      setAvailableVoices(englishVoices.length > 0 ? englishVoices : voices);
    } catch (err) {
      console.error("Failed to load voices:", err);
    }
  };

  const speak = useCallback(
    async (textToSpeak: string) => {
      if (!textToSpeak.trim()) return;

      try {
        // Check if already speaking
        const speaking = await Speech.isSpeakingAsync();
        if (speaking) {
          // Add to queue instead of interrupting
          speakingQueue.current.push(textToSpeak);
          return;
        }

        setIsSpeaking(true);
        setError(null);
        onSpeakStart?.();

        const speechOptions: Speech.SpeechOptions = {
          rate: settings?.ttsSpeed ?? 1.0,
          pitch: 1.0,
          language: "en-US",
          onStart: () => setIsSpeaking(true),
          onDone: () => {
            setIsSpeaking(false);
            onSpeakEnd?.();
            // Process queue
            processQueue();
          },
          onError: (err) => {
            setError("Speech error occurred");
            setIsSpeaking(false);
            onSpeakEnd?.();
          },
          onStopped: () => {
            setIsSpeaking(false);
            onSpeakEnd?.();
          },
        };

        // Use specified voice if available
        if (settings?.ttsVoice) {
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
      }
    },
    [settings, availableVoices, onSpeakStart, onSpeakEnd],
  );

  const processQueue = useCallback(() => {
    if (speakingQueue.current.length > 0) {
      const nextText = speakingQueue.current.shift();
      if (nextText) {
        speak(nextText);
      }
    }
  }, [speak]);

  const stop = useCallback(async () => {
    try {
      await Speech.stop();
      speakingQueue.current = [];
      setIsSpeaking(false);
      setIsPaused(false);
    } catch (err) {
      console.error("Failed to stop speech:", err);
    }
  }, []);

  const pause = useCallback(async () => {
    if (Platform.OS === "ios") {
      try {
        await Speech.pause();
        setIsPaused(true);
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

  return (
    <ThemedView style={styles.container}>
      {/* Controls */}
      <View style={styles.controls}>
        {/* Play/Pause Button */}
        {!isSpeaking ? (
          <Pressable
            style={[styles.button, styles.playButton]}
            onPress={() => speak(text)}
            accessibilityLabel="Speak text"
            accessibilityRole="button"
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
        >
          <ThemedText style={styles.buttonIcon}>🔄</ThemedText>
        </Pressable>
      </View>

      {/* Status */}
      <View style={styles.status}>
        {isSpeaking && !isPaused && (
          <View style={styles.speakingIndicator}>
            <View style={styles.speakingDot} />
            <ThemedText style={styles.statusText}>Speaking...</ThemedText>
          </View>
        )}
        {isPaused && <ThemedText style={styles.statusText}>Paused</ThemedText>}
        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
      </View>

      {/* Speed indicator */}
      <View style={styles.speedIndicator}>
        <ThemedText style={styles.speedText}>
          Speed: {settings?.ttsSpeed ?? 1.0}x
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
  },
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonIcon: {
    fontSize: 20,
    color: "#FFFFFF",
  },
  status: {
    marginTop: 12,
    alignItems: "center",
  },
  speakingIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#50C878",
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    opacity: 0.7,
  },
  errorText: {
    fontSize: 12,
    color: "#FF6B6B",
  },
  speedIndicator: {
    marginTop: 8,
    alignItems: "center",
  },
  speedText: {
    fontSize: 10,
    opacity: 0.5,
  },
});
