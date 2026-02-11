/**
 * TextToSpeech - Text-to-Speech Component
 * Person 2: Accessibility and Visual Customization
 *
 * Implements TTS for blind users to hear transcribed text or signed content.
 * Uses expo-speech for cross-platform text-to-speech conversion.
 * Connects to global accessibility settings via useTextToSpeech hook.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import type { TextToSpeechProps } from "@/types";

export function TextToSpeech({
  text,
  autoSpeak = false,
  settings,
  onSpeakStart,
  onSpeakEnd,
}: TextToSpeechProps) {
  const tts = useTextToSpeech({ autoSpeak });
  const lastSpokenText = useRef<string>("");

  // Wave animation values
  const wave1 = useRef(new Animated.Value(0.3)).current;
  const wave2 = useRef(new Animated.Value(0.3)).current;
  const wave3 = useRef(new Animated.Value(0.3)).current;
  const wave4 = useRef(new Animated.Value(0.3)).current;
  const wave5 = useRef(new Animated.Value(0.3)).current;

  // Auto-speak when text changes
  useEffect(() => {
    if (autoSpeak && text && text !== lastSpokenText.current && tts.isEnabled) {
      lastSpokenText.current = text;
      tts.speak(text);
      onSpeakStart?.();
    }
  }, [text, autoSpeak, tts.isEnabled]);

  // Notify parent of speaking state changes
  useEffect(() => {
    if (tts.isSpeaking) {
      onSpeakStart?.();
    } else {
      onSpeakEnd?.();
    }
  }, [tts.isSpeaking]);

  // Animate waveform when speaking
  useEffect(() => {
    if (tts.isSpeaking && !tts.isPaused) {
      const createWaveAnimation = (value: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(value, {
              toValue: 1,
              duration: 300 + Math.random() * 200,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0.3,
              duration: 300 + Math.random() * 200,
              useNativeDriver: true,
            }),
          ]),
        );

      const animations = [
        createWaveAnimation(wave1, 0),
        createWaveAnimation(wave2, 80),
        createWaveAnimation(wave3, 160),
        createWaveAnimation(wave4, 240),
        createWaveAnimation(wave5, 320),
      ];

      animations.forEach((a) => a.start());

      return () => {
        animations.forEach((a) => a.stop());
      };
    } else {
      // Reset to idle
      [wave1, wave2, wave3, wave4, wave5].forEach((w) => {
        Animated.timing(w, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [tts.isSpeaking, tts.isPaused]);

  const handleSpeak = () => {
    if (text.trim()) {
      tts.speak(text);
    }
  };

  const handlePauseResume = () => {
    if (tts.isPaused) {
      tts.resume();
    } else {
      tts.pause();
    }
  };

  const handleReplay = () => {
    if (text.trim()) {
      tts.replay(text);
    }
  };

  const waves = [wave1, wave2, wave3, wave4, wave5];

  return (
    <ThemedView style={styles.container}>
      {/* Waveform visualization */}
      <View style={styles.waveformContainer}>
        {waves.map((wave, index) => (
          <Animated.View
            key={index}
            style={[
              styles.waveBar,
              tts.isSpeaking && styles.waveBarActive,
              {
                transform: [{ scaleY: wave }],
              },
            ]}
          />
        ))}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Play/Pause Button */}
        {!tts.isSpeaking ? (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.playButton,
              !tts.isEnabled && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleSpeak}
            disabled={!tts.isEnabled}
            accessibilityLabel="Speak text"
            accessibilityRole="button"
            accessibilityState={{ disabled: !tts.isEnabled }}
          >
            <ThemedText style={styles.buttonIcon}>▶</ThemedText>
          </Pressable>
        ) : tts.isPaused ? (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.playButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handlePauseResume}
            accessibilityLabel="Resume speaking"
            accessibilityRole="button"
          >
            <ThemedText style={styles.buttonIcon}>▶</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.pauseButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handlePauseResume}
            accessibilityLabel="Pause speaking"
            accessibilityRole="button"
          >
            <ThemedText style={styles.buttonIcon}>⏸</ThemedText>
          </Pressable>
        )}

        {/* Stop Button */}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.stopButton,
            !tts.isSpeaking && styles.buttonDisabled,
            pressed && tts.isSpeaking && styles.buttonPressed,
          ]}
          onPress={() => tts.stop()}
          disabled={!tts.isSpeaking}
          accessibilityLabel="Stop speaking"
          accessibilityRole="button"
        >
          <ThemedText style={styles.buttonIcon}>⏹</ThemedText>
        </Pressable>

        {/* Replay Button */}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.replayButton,
            !tts.isEnabled && styles.buttonDisabled,
            pressed && tts.isEnabled && styles.buttonPressed,
          ]}
          onPress={handleReplay}
          disabled={!tts.isEnabled}
          accessibilityLabel="Replay last text"
          accessibilityRole="button"
        >
          <ThemedText style={styles.buttonIcon}>↻</ThemedText>
        </Pressable>
      </View>

      {/* Status */}
      <View style={styles.status}>
        {tts.isSpeaking && !tts.isPaused && (
          <View style={styles.speakingIndicator}>
            <View style={styles.speakingDot} />
            <ThemedText style={styles.statusText}>Speaking...</ThemedText>
          </View>
        )}
        {tts.isPaused && (
          <View style={styles.speakingIndicator}>
            <View style={[styles.speakingDot, styles.pausedDot]} />
            <ThemedText style={styles.statusText}>Paused</ThemedText>
          </View>
        )}
        {!tts.isEnabled && (
          <ThemedText style={styles.disabledText}>
            TTS disabled — enable in Settings
          </ThemedText>
        )}
        {tts.error && (
          <ThemedText style={styles.errorText}>{tts.error}</ThemedText>
        )}
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
    backgroundColor: "rgba(128, 128, 128, 0.2)",
  },
  waveBarActive: {
    backgroundColor: "#50C878",
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
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
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
    opacity: 0.4,
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
  pausedDot: {
    backgroundColor: "#FFB347",
  },
  statusText: {
    fontSize: 12,
    opacity: 0.7,
  },
  disabledText: {
    fontSize: 12,
    opacity: 0.5,
    fontStyle: "italic",
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
