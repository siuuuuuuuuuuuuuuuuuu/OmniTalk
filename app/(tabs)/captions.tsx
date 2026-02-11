import { AccessibilityControls } from "@/components/AccessibilityControls";
import { AudioCapture } from "@/components/AudioCapture";
import { ThemedText } from "@/components/themed-text";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import {
  createSpeechToTextService,
  SpeechToTextService,
  TranscriptionResult,
} from "@/services/speechToText";
import { useAccessibility } from "@/state/AppContext";
import { Audio } from "expo-av";
import Constants from "expo-constants";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View
} from "react-native";

const DEEPGRAM_API_KEY =
  Constants.expoConfig?.extra?.deepgramApiKey ||
  process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY ||
  "";

// Debug: Check API key loading
console.log(
  "Deepgram key from Constants:",
  Constants.expoConfig?.extra?.deepgramApiKey ? "SET" : "NOT SET",
);
console.log(
  "Deepgram key from process.env:",
  process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY ? "SET" : "NOT SET",
);

// ─── Speaker color palette (supports up to 15 distinct speakers) ────────────
const SPEAKER_COLORS = [
  "#2563EB",
  "#059669",
  "#D97706",
  "#DC2626",
  "#7C3AED",
  "#DB2777",
  "#0891B2",
  "#EA580C",
  "#0D9488",
  "#4F46E5",
  "#C026D3",
  "#0284C7",
  "#65A30D",
  "#BE123C",
  "#9333EA",
];

// ─── Types ──────────────────────────────────────────────────────────────────
type Speaker = {
  name: string;
  index: number;
  direction: number; // degrees: 0=right, 90=front, 180=left, 270=back
};

type Caption = {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
  speakerIndex: number;
  direction: number;
};

// ─── Default directions for positioning speakers on the radar ───────────────
const SPEAKER_DIRECTIONS = [80, 120, 45, 160, 200, 330, 10, 260, 300, 140];

/** Build a display name and direction for a Deepgram speaker index */
function getSpeakerInfo(index: number) {
  return {
    name: `Speaker ${index + 1}`,
    index,
    direction: SPEAKER_DIRECTIONS[index % SPEAKER_DIRECTIONS.length],
  };
}

// ─── Pulsing Ripple ─────────────────────────────────────────────────────────
function PulsingRipple({
  color,
  delay = 0,
}: {
  color: string;
  delay?: number;
}) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 3,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1600,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.4,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.5,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, scale, opacity]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2.5,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

// ─── Speaker Node on Radar ──────────────────────────────────────────────────
function SpeakerNode({
  speaker,
  isActive,
}: {
  speaker: Speaker;
  isActive: boolean;
}) {
  const color = SPEAKER_COLORS[speaker.index % SPEAKER_COLORS.length];
  const radius = 58;
  const angleRad = ((speaker.direction - 90) * Math.PI) / 180;
  const x = Math.cos(angleRad) * radius;
  const y = Math.sin(angleRad) * radius;
  const initials = speaker.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  // Animate scale when becoming active
  const nodeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.sequence([
        Animated.timing(nodeScale, {
          toValue: 1.3,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(nodeScale, {
          toValue: 1.1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(nodeScale, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isActive, nodeScale]);

  return (
    <View
      style={[
        styles.speakerNodeWrapper,
        { transform: [{ translateX: x }, { translateY: y }] },
      ]}
    >
      {isActive && (
        <>
          <PulsingRipple color={color} delay={0} />
          <PulsingRipple color={color} delay={500} />
          <PulsingRipple color={color} delay={1000} />
        </>
      )}
      <Animated.View
        style={[
          styles.speakerNode,
          { backgroundColor: color, transform: [{ scale: nodeScale }] },
          isActive && styles.speakerNodeActive,
        ]}
      >
        <ThemedText style={styles.speakerInitials}>{initials}</ThemedText>
      </Animated.View>
    </View>
  );
}

// ─── Radar Visualizer ───────────────────────────────────────────────────────
function SoundRadar({
  activeSpeakerIndex,
  speakers,
}: {
  activeSpeakerIndex: number;
  speakers: Speaker[];
}) {
  const activeColor =
    SPEAKER_COLORS[activeSpeakerIndex % SPEAKER_COLORS.length];
  const activeName =
    speakers.find((s) => s.index === activeSpeakerIndex)?.name ?? "—";

  return (
    <View style={styles.radarSection}>
      <View style={styles.radarOuter}>
        {/* Concentric rings */}
        <View style={[styles.radarRing, styles.radarRingOuter]} />
        <View style={[styles.radarRing, styles.radarRingMid]} />
        <View style={[styles.radarRing, styles.radarRingInner]} />

        {/* Cross-hair lines */}
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />

        {/* "You" center marker */}
        <View style={styles.youMarker}>
          <ThemedText style={styles.youText}>YOU</ThemedText>
        </View>

        {/* Speaker nodes */}
        {speakers.map((speaker) => (
          <SpeakerNode
            key={speaker.index}
            speaker={speaker}
            isActive={speaker.index === activeSpeakerIndex}
          />
        ))}
      </View>

      {/* Active speaker label */}
      {speakers.length > 0 && (
        <View style={styles.activeSpeakerLabel}>
          <View style={[styles.activeDot, { backgroundColor: activeColor }]} />
          <ThemedText style={styles.activeSpeakerText}>
            <ThemedText
              style={[styles.activeSpeakerName, { color: activeColor }]}
            >
              {activeName}
            </ThemedText>
            {" is speaking"}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

// ─── Font size helper ────────────────────────────────────────────────────────
function getAccessibleFontSize(fontSize: string): number {
  switch (fontSize) {
    case "small": return 14;
    case "medium": return 16;
    case "large": return 20;
    case "extra-large": return 26;
    default: return 16;
  }
}

// ─── Caption Bubble ─────────────────────────────────────────────────────────
function CaptionBubble({
  item,
  isLatest,
  highContrast,
  fontSize,
}: {
  item: Caption;
  isLatest: boolean;
  highContrast: boolean;
  fontSize: number;
}) {
  const color = SPEAKER_COLORS[item.speakerIndex % SPEAKER_COLORS.length];
  const time = new Date(item.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Fade-in animation for new captions
  const fadeAnim = useRef(new Animated.Value(isLatest ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isLatest ? 12 : 0)).current;

  useEffect(() => {
    if (isLatest) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isLatest, fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.bubble,
        isLatest && styles.bubbleLatest,
        highContrast && styles.bubbleHighContrast,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.bubbleAccent, { backgroundColor: color }]} />
      <View style={styles.bubbleContent}>
        <View style={styles.bubbleHeader}>
          <ThemedText style={[styles.bubbleSpeaker, { color }]}>
            {item.speaker}
          </ThemedText>
          <ThemedText style={[styles.bubbleTime, highContrast && styles.highContrastMuted]}>
            {time}
          </ThemedText>
        </View>
        <ThemedText
          style={[
            styles.bubbleText,
            { fontSize, lineHeight: fontSize * 1.5 },
            highContrast && styles.highContrastText,
          ]}
        >
          {item.text}
        </ThemedText>
      </View>
    </Animated.View>
  );
}


// ─── Main Screen ────────────────────────────────────────────────────────────
export default function CaptionsScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [activeSpeakerIndex, setActiveSpeakerIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [sttService, setSttService] = useState<SpeechToTextService | null>(
    null,
  );
  // Track which Deepgram speaker indices we've seen so far
  const [knownSpeakers, setKnownSpeakers] = useState<Speaker[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  // Auto-scroll to bottom; disabled when user scrolls up manually
  const autoScrollRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const captionIdRef = useRef(1);
  const interimIdRef = useRef(0);

  // Microphone permission state
  const [micPermission, setMicPermission] = useState<boolean | null>(null);

  // Accessibility & TTS
  const { settings, updateSettings } = useAccessibility();
  const [showSettings, setShowSettings] = useState(false);
  const tts = useTextToSpeech({ autoSpeak: false, announceSpeakers: true });
  const lastReadCaptionId = useRef<string>("");
  const fullText = captions.map((c) => `${c.speaker}: ${c.text}`).join(". ");

  // Auto-read the latest caption when TTS is enabled
  useEffect(() => {
    if (!settings.ttsEnabled || captions.length === 0) return;
    const latest = captions[captions.length - 1];
    if (latest.id !== lastReadCaptionId.current) {
      lastReadCaptionId.current = latest.id;
      tts.speakSegment(latest.text, latest.speaker);
    }
  }, [captions, settings.ttsEnabled]);

  // Request microphone permission on mount (platform-aware)
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          stream.getTracks().forEach((t) => t.stop());
          setMicPermission(true);
        } else {
          // iOS / Android: use expo-av
          const { status } = await Audio.requestPermissionsAsync();
          if (status === "granted") {
            await Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
              staysActiveInBackground: true,
            });
            setMicPermission(true);
          } else {
            setMicPermission(false);
          }
        }
      } catch {
        setMicPermission(false);
      }
    })();
  }, []);

  const requestMicPermission = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
        setMicPermission(true);
      } else {
        const { status } = await Audio.requestPermissionsAsync();
        if (status === "granted") {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
          });
          setMicPermission(true);
        } else {
          setMicPermission(false);
        }
      }
    } catch {
      setMicPermission(false);
    }
  }, []);

  // Sliding window: max number of caption bubbles to keep visible
  const MAX_VISIBLE_CAPTIONS = 50;

  // Handle incoming transcription from Deepgram
  const handleTranscript = useCallback((result: TranscriptionResult) => {
    console.log(
      "Transcript received:",
      result.transcript,
      "isFinal:",
      result.isFinal,
      "speaker:",
      result.speaker,
    );
    if (!result.transcript.trim()) return;

    const speakerIdx = result.speaker ?? 0;
    const speaker = getSpeakerInfo(speakerIdx);

    // Register any new speaker we haven't seen yet
    setKnownSpeakers((prev) => {
      if (prev.some((s) => s.index === speakerIdx)) return prev;
      return [...prev, speaker];
    });

    if (result.isFinal) {
      const newCaption: Caption = {
        id: `final-${captionIdRef.current++}`,
        speaker: speaker.name,
        speakerIndex: speaker.index,
        direction: speaker.direction,
        text: result.transcript,
        timestamp: Date.now(),
      };
      setCaptions((prev) => {
        const updated = [
          ...prev.filter((c) => !c.id.startsWith("interim-")),
          newCaption,
        ];
        // Sliding window: drop oldest bubbles beyond the limit
        return updated.length > MAX_VISIBLE_CAPTIONS
          ? updated.slice(-MAX_VISIBLE_CAPTIONS)
          : updated;
      });
    } else {
      const newCaption: Caption = {
        id: `interim-${interimIdRef.current++}`,
        speaker: speaker.name,
        speakerIndex: speaker.index,
        direction: speaker.direction,
        text: result.transcript,
        timestamp: Date.now(),
      };
      setCaptions((prev) => {
        const updated = [
          ...prev.filter((c) => !c.id.startsWith("interim-")),
          newCaption,
        ];
        return updated.length > MAX_VISIBLE_CAPTIONS
          ? updated.slice(-MAX_VISIBLE_CAPTIONS)
          : updated;
      });
    }
    setActiveSpeakerIndex(speakerIdx);
  }, []);

  // Only true when the user explicitly pressed the mic button to record
  const userWantsRecording = useRef(false);

  // Initialize STT service only when API key is available
  useEffect(() => {
    if (!DEEPGRAM_API_KEY) {
      console.warn("Deepgram API key not found. Speech-to-text disabled.");
      setConnectionStatus("error");
      return;
    }
    console.log("Initializing STT service...");
    const stt = createSpeechToTextService(
      DEEPGRAM_API_KEY,
      { enableDiarization: true, maxSpeakers: 6 },
      {
        onTranscript: handleTranscript,
        onError: (err) => {
          console.error("STT Error:", err);
          setConnectionStatus("error");
        },
        onOpen: () => {
          console.log("STT Connected to Deepgram");
          setConnectionStatus("connected");
        },
        onClose: () => {
          console.log("STT Disconnected");
          setConnectionStatus("idle");
          // Auto-reconnect only if user explicitly started recording
          if (userWantsRecording.current) {
            console.log("Auto-reconnecting to Deepgram in 500ms...");
            setConnectionStatus("connecting");
            // Brief delay to let the old connection fully tear down
            setTimeout(() => {
              stt
                .connect()
                .then(() => {
                  console.log("STT auto-reconnected successfully");
                })
                .catch((err) => {
                  console.error("Auto-reconnect failed:", err);
                  setConnectionStatus("error");
                });
            }, 500);
          }
        },
      },
    );
    setSttService(stt);
    return () => stt.disconnect();
  }, [handleTranscript]);

  // Connect to Deepgram FIRST, then start audio capture
  const handleRecordPress = useCallback(async () => {
    if (isRecording) {
      // Stop
      userWantsRecording.current = false;
      setIsRecording(false);
      sttService?.finishStream();
      return;
    }

    // Start: connect to Deepgram before audio capture begins
    if (!sttService) {
      console.error("STT service not initialized (check API key)");
      setConnectionStatus("error");
      return;
    }

    if (!sttService.connected) {
      setConnectionStatus("connecting");
      try {
        await sttService.connect();
        console.log("STT connected — starting audio capture");
      } catch (err) {
        console.error("Failed to connect to Deepgram:", err);
        setConnectionStatus("error");
        return;
      }
    }

    // Deepgram is connected, now start recording
    userWantsRecording.current = true;
    setIsRecording(true);
  }, [isRecording, sttService]);

  const handleRecordingStart = useCallback(() => {
    console.log("Audio capture started, STT connected:", sttService?.connected);
  }, [sttService]);

  const handleRecordingStop = useCallback(() => {
    console.log("Audio capture stopped");
  }, []);

  // Keep a ref to sttService so the audio chunk callback never has a stale reference
  const sttServiceRef = useRef(sttService);
  useEffect(() => {
    sttServiceRef.current = sttService;
  }, [sttService]);

  const handleAudioChunk = useCallback((chunk: ArrayBuffer) => {
    const stt = sttServiceRef.current;
    if (stt?.connected) {
      stt.sendAudio(chunk);
    }
  }, []);

  // Auto-scroll to bottom whenever captions change
  useEffect(() => {
    if (autoScrollRef.current) {
      // Small timeout to let the DOM update before scrolling
      const t = setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [captions]);

  // Detect if user scrolled away from bottom
  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      isNearBottomRef.current = distanceFromBottom < 80;
      autoScrollRef.current = isNearBottomRef.current;
    },
    [],
  );

  // Tap to re-enable auto-scroll and jump to bottom
  const handleScrollToBottom = useCallback(() => {
    autoScrollRef.current = true;
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  // ── Microphone permission not yet determined ──
  if (micPermission === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.permissionContainer}>
          <ThemedText style={styles.permissionLoadingText}>
            Requesting microphone permission...
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // ── Microphone permission denied ──
  if (micPermission === false) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionCard}>
            <ThemedText style={styles.permissionIcon}>
              {"\uD83C\uDF99\uFE0F"}
            </ThemedText>
            <ThemedText style={styles.permissionTitle}>
              Microphone Access Needed
            </ThemedText>
            <ThemedText style={styles.permissionDescription}>
              We need microphone access to capture speech and generate live
              captions in real time.
            </ThemedText>
            <Pressable
              style={({ pressed }) => [
                styles.permissionButton,
                pressed && styles.permissionButtonPressed,
              ]}
              onPress={requestMicPermission}
            >
              <ThemedText style={styles.permissionButtonText}>
                Grant Access
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const accessibleFontSize = getAccessibleFontSize(settings.fontSize);

  return (
    <SafeAreaView style={[styles.safeArea, settings.highContrast && styles.safeAreaHighContrast]}>
      <View style={[styles.container, settings.highContrast && styles.containerHighContrast]}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.headerTitle}>Live Captions</ThemedText>
            <ThemedText style={styles.headerSub}>
              {knownSpeakers.length} participant
              {knownSpeakers.length !== 1 ? "s" : ""}
            </ThemedText>
          </View>
          {isRecording ? (
            <View style={styles.liveBadge}>
              <View style={styles.livePulse} />
              <ThemedText style={styles.liveLabel}>LIVE</ThemedText>
            </View>
          ) : (
            <View style={styles.idleBadge}>
              <ThemedText style={styles.idleLabel}>IDLE</ThemedText>
            </View>
          )}
        </View>

        {/* ── Sound Radar ── */}
        <SoundRadar
          activeSpeakerIndex={activeSpeakerIndex}
          speakers={knownSpeakers}
        />


        {/* ── Transcript ── */}
        <View style={styles.transcriptSection}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.transcriptList}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={100}
          >
            {captions.map((item, index) => (
              <CaptionBubble
                key={item.id}
                item={item}
                isLatest={index === captions.length - 1}
                highContrast={settings.highContrast}
                fontSize={accessibleFontSize}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── Hidden Audio Capture ── */}
        <AudioCapture
          autoStart={isRecording}
          hideUI={true}
          onAudioChunk={handleAudioChunk}
          onRecordingStart={handleRecordingStart}
          onRecordingStop={handleRecordingStop}
          onRecordingStatusChange={setIsRecording}
          onError={(err) => console.error("Audio Error:", err)}
        />

        {/* ── Status Badge ── */}
        {connectionStatus === "connecting" && (
          <View style={styles.statusBadge}>
            <ThemedText style={styles.statusText}>
              Connecting to Deepgram…
            </ThemedText>
          </View>
        )}
        {connectionStatus === "error" && (
          <View style={[styles.statusBadge, styles.statusBadgeError]}>
            <ThemedText style={styles.statusTextError}>
              {!DEEPGRAM_API_KEY
                ? "No API key set"
                : "Connection failed — tap mic to retry"}
            </ThemedText>
          </View>
        )}

        {/* ── Record FAB ── */}
        <Pressable
          style={[
            styles.recordFab,
            isRecording && styles.recordFabActive,
            connectionStatus === "connecting" && styles.recordFabConnecting,
          ]}
          onPress={handleRecordPress}
          accessibilityLabel={
            isRecording ? "Stop recording" : "Start recording"
          }
          accessibilityRole="button"
        >
          <ThemedText style={styles.recordFabIcon}>
            {connectionStatus === "connecting"
              ? "⏳"
              : isRecording
                ? "⏹"
                : "🎤"}
          </ThemedText>
        </Pressable>

        {/* ── Settings FAB ── */}
        <Pressable
          style={styles.settingsFab}
          onPress={() => setShowSettings(!showSettings)}
          accessibilityLabel={showSettings ? "Close settings" : "Open accessibility settings"}
          accessibilityRole="button"
        >
          <ThemedText style={styles.settingsFabIcon}>⚙</ThemedText>
        </Pressable>

        {/* ── Accessibility Settings Modal ── */}
        {showSettings && (
          <View
            style={styles.settingsModal}
            accessibilityViewIsModal={true}
            accessibilityLabel="Accessibility settings modal"
          >
            <Pressable
              style={styles.settingsBackdrop}
              onPress={() => setShowSettings(false)}
              accessibilityLabel="Close settings"
              accessibilityRole="button"
            />
            <View style={styles.settingsContent}>
              <View style={styles.settingsHeader}>
                <ThemedText style={styles.settingsTitle}>Settings</ThemedText>
                <Pressable
                  onPress={() => setShowSettings(false)}
                  style={styles.settingsCloseBtn}
                  accessibilityLabel="Close settings"
                  accessibilityRole="button"
                >
                  <ThemedText style={styles.settingsCloseBtnText}>✕</ThemedText>
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
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  safeAreaHighContrast: { backgroundColor: "#000000" },
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  containerHighContrast: { backgroundColor: "#000000" },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 7,
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#EF4444",
    letterSpacing: 1,
  },

  // Radar
  radarSection: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  radarOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  radarRing: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  radarRingOuter: { width: 150, height: 150 },
  radarRingMid: { width: 110, height: 110 },
  radarRingInner: { width: 70, height: 70 },
  crosshairH: {
    position: "absolute",
    width: 180,
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  crosshairV: {
    position: "absolute",
    width: 1,
    height: 180,
    backgroundColor: "#F1F5F9",
  },
  youMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  youText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
  },

  // Speaker nodes
  speakerNodeWrapper: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  speakerNode: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  speakerNodeActive: {
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  speakerInitials: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },

  activeSpeakerLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 8,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  activeSpeakerText: { fontSize: 14, fontWeight: "500", color: "#64748B" },
  activeSpeakerName: { fontWeight: "700" },


  // Transcript
  transcriptSection: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  transcriptList: {
    padding: 16,
    paddingBottom: 24,
  },

  // Permission
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 24,
  },
  permissionLoadingText: { fontSize: 15, color: "#64748B", fontWeight: "500" },
  permissionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "100%" as const,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  permissionIcon: { fontSize: 48, marginBottom: 16 },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#0F172A",
    marginBottom: 8,
  },
  permissionDescription: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center" as const,
    lineHeight: 21,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  permissionButtonPressed: { opacity: 0.9 },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700" as const,
  },

  // Idle badge
  idleBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  idleLabel: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#94A3B8",
    letterSpacing: 1,
  },

  // Recording bar
  recordingBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 14,
  },
  recordBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: "#EF4444",
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  recordBtnActive: { borderColor: "#DC2626" },
  recordBtnPressed: { opacity: 0.8 },
  recordBtnInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EF4444",
  },
  recordBtnInnerActive: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#DC2626",
  },
  recordingInfo: {
    flex: 1,
  },
  recordingStatusText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#1E293B",
  },
  recordingDurationText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: "#EF4444",
    marginTop: 2,
  },

  // Caption bubbles
  bubble: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleLatest: {
    borderColor: "#BFDBFE",
    backgroundColor: "#F0F9FF",
  },
  bubbleAccent: {
    width: 4,
  },
  bubbleContent: {
    flex: 1,
    padding: 14,
    paddingLeft: 12,
  },
  bubbleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  bubbleSpeaker: {
    fontSize: 14,
    fontWeight: "700",
  },
  bubbleTime: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1E293B",
    fontWeight: "400",
  },
  bubbleHighContrast: {
    backgroundColor: "#1A1A1A",
    borderColor: "#333333",
  },
  highContrastText: {
    color: "#FFFFFF",
  },
  highContrastMuted: {
    color: "#AAAAAA",
  },

  // Record FAB
  recordFab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  recordFabActive: {
    backgroundColor: "#DC2626",
    shadowColor: "#DC2626",
  },
  recordFabConnecting: {
    backgroundColor: "#94A3B8",
    shadowColor: "#94A3B8",
  },
  recordFabIcon: {
    fontSize: 28,
  },
  statusBadge: {
    position: "absolute",
    bottom: 96,
    alignSelf: "center",
    backgroundColor: "#F0F9FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  statusBadgeError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  statusText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },
  statusTextError: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "600",
  },
  scrollToBottomBtn: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollToBottomText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },

  // Settings FAB & Modal
  settingsFab: {
    position: "absolute",
    bottom: 24,
    left: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#64748B",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  settingsFabIcon: {
    fontSize: 22,
    color: "#FFFFFF",
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
    zIndex: 100,
  },
  settingsBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  settingsCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsCloseBtnText: {
    fontSize: 20,
    color: "#64748B",
    fontWeight: "600",
  },
  settingsScroll: {
    padding: 24,
  },
});
