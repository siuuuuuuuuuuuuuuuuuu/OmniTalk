/**
 * useTextToSpeech - Custom Hook for Text-to-Speech
 * Person 2: Accessibility and Visual Customization
 *
 * Provides reusable TTS functionality connected to the app's global
 * accessibility settings. Automatically reads new transcript segments
 * for blind users.
 */

import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { useAccessibility } from "@/state/AppContext";

interface Voice {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

interface UseTextToSpeechOptions {
  /** Automatically speak new text when it changes */
  autoSpeak?: boolean;
  /** Announce speaker name changes */
  announceSpeakers?: boolean;
}

interface UseTextToSpeechReturn {
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Whether TTS is paused (iOS only) */
  isPaused: boolean;
  /** Available voices */
  availableVoices: Voice[];
  /** Current error message */
  error: string | null;
  /** Speak the given text */
  speak: (text: string) => Promise<void>;
  /** Stop all speech and clear queue */
  stop: () => Promise<void>;
  /** Pause speech (iOS only) */
  pause: () => Promise<void>;
  /** Resume paused speech (iOS only) */
  resume: () => Promise<void>;
  /** Stop and re-speak the given text */
  replay: (text: string) => Promise<void>;
  /** Speak a new transcript segment, optionally with speaker announcement */
  speakSegment: (text: string, speakerName?: string) => Promise<void>;
  /** Whether TTS is enabled in settings */
  isEnabled: boolean;
}

export function useTextToSpeech(
  options: UseTextToSpeechOptions = {},
): UseTextToSpeechReturn {
  const { autoSpeak = false, announceSpeakers = true } = options;
  const { settings } = useAccessibility();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const speakingQueue = useRef<string[]>([]);
  const lastSpeakerRef = useRef<string>("");
  const isProcessingQueue = useRef(false);

  // Load available voices on mount
  useEffect(() => {
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const englishVoices = voices.filter((v) => v.language.startsWith("en"));
        setAvailableVoices(englishVoices.length > 0 ? englishVoices : voices);
      } catch (err) {
        console.error("Failed to load voices:", err);
      }
    })();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const getSpeechOptions = useCallback((): Partial<Speech.SpeechOptions> => {
    const opts: Partial<Speech.SpeechOptions> = {
      rate: settings.ttsSpeed,
      pitch: 1.0,
      language: "en-US",
    };

    if (settings.ttsVoice) {
      const voice = availableVoices.find(
        (v) =>
          v.identifier === settings.ttsVoice || v.name === settings.ttsVoice,
      );
      if (voice) {
        opts.voice = voice.identifier;
      }
    }

    return opts;
  }, [settings.ttsSpeed, settings.ttsVoice, availableVoices]);

  const processQueue = useCallback(async () => {
    if (isProcessingQueue.current || speakingQueue.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;
    const textToSpeak = speakingQueue.current.shift();

    if (!textToSpeak) {
      isProcessingQueue.current = false;
      return;
    }

    try {
      setIsSpeaking(true);
      setError(null);

      await new Promise<void>((resolve, reject) => {
        Speech.speak(textToSpeak, {
          ...getSpeechOptions(),
          onDone: () => resolve(),
          onStopped: () => resolve(),
          onError: () => reject(new Error("Speech error")),
        });
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      isProcessingQueue.current = false;

      if (speakingQueue.current.length > 0) {
        processQueue();
      } else {
        setIsSpeaking(false);
      }
    }
  }, [getSpeechOptions]);

  const speak = useCallback(
    async (textToSpeak: string) => {
      if (!textToSpeak.trim() || !settings.ttsEnabled) return;

      speakingQueue.current.push(textToSpeak);
      processQueue();
    },
    [settings.ttsEnabled, processQueue],
  );

  const stop = useCallback(async () => {
    try {
      await Speech.stop();
      speakingQueue.current = [];
      isProcessingQueue.current = false;
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

  const replay = useCallback(
    async (text: string) => {
      await stop();
      await speak(text);
    },
    [stop, speak],
  );

  const speakSegment = useCallback(
    async (text: string, speakerName?: string) => {
      if (!settings.ttsEnabled || !text.trim()) return;

      // Announce speaker change if enabled
      if (
        announceSpeakers &&
        speakerName &&
        speakerName !== lastSpeakerRef.current
      ) {
        lastSpeakerRef.current = speakerName;
        speakingQueue.current.push(`${speakerName} says:`);
      }

      speakingQueue.current.push(text);
      processQueue();
    },
    [settings.ttsEnabled, announceSpeakers, processQueue],
  );

  return {
    isSpeaking,
    isPaused,
    availableVoices,
    error,
    speak,
    stop,
    pause,
    resume,
    replay,
    speakSegment,
    isEnabled: settings.ttsEnabled,
  };
}
