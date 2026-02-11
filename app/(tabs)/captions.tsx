import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { ThemedText } from '@/components/themed-text';

// ─── Speaker color palette (supports up to 15 distinct speakers) ────────────
const SPEAKER_COLORS = [
  '#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED',
  '#DB2777', '#0891B2', '#EA580C', '#0D9488', '#4F46E5',
  '#C026D3', '#0284C7', '#65A30D', '#BE123C', '#9333EA',
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

// ─── Mock meeting data ──────────────────────────────────────────────────────
const MOCK_SPEAKERS: Speaker[] = [
  { name: 'David Park', index: 0, direction: 80 },
  { name: 'Lisa Wang', index: 1, direction: 120 },
  { name: 'James Miller', index: 2, direction: 45 },
  { name: 'Priya Patel', index: 3, direction: 160 },
  { name: 'Tom Anderson', index: 4, direction: 200 },
  { name: 'Maria Garcia', index: 5, direction: 330 },
];

const INITIAL_CAPTIONS: Caption[] = [
  {
    id: '1', speaker: 'David Park', speakerIndex: 0, direction: 80,
    text: "Alright everyone, let us kick off the standup. Quick updates from each team please.",
    timestamp: Date.now() - 45000,
  },
  {
    id: '2', speaker: 'Lisa Wang', speakerIndex: 1, direction: 120,
    text: "Design team shipped the new onboarding flow mockups yesterday. We are waiting on eng review.",
    timestamp: Date.now() - 38000,
  },
  {
    id: '3', speaker: 'James Miller', speakerIndex: 2, direction: 45,
    text: "I will take a look this afternoon. We had a blocker on the auth service but it is resolved now.",
    timestamp: Date.now() - 30000,
  },
];

// Simulated incoming captions (fed one at a time)
const QUEUED_CAPTIONS: Caption[] = [
  {
    id: '4', speaker: 'Priya Patel', speakerIndex: 3, direction: 160,
    text: "Quick note — the API rate limits need to be bumped before we launch. Can someone file that?",
    timestamp: 0,
  },
  {
    id: '5', speaker: 'Tom Anderson', speakerIndex: 4, direction: 200,
    text: "I can handle it. Also, QA found two regressions in the checkout flow we need to prioritize.",
    timestamp: 0,
  },
  {
    id: '6', speaker: 'David Park', speakerIndex: 0, direction: 80,
    text: "Thanks Tom. Let us make those P0. Anything else before we move to the roadmap discussion?",
    timestamp: 0,
  },
  {
    id: '7', speaker: 'Maria Garcia', speakerIndex: 5, direction: 330,
    text: "The accessibility audit results came in. We have a few critical items to address before the release.",
    timestamp: 0,
  },
  {
    id: '8', speaker: 'Lisa Wang', speakerIndex: 1, direction: 120,
    text: "I can help with the visual design updates for the audit findings. I will sync with Maria after this.",
    timestamp: 0,
  },
  {
    id: '9', speaker: 'James Miller', speakerIndex: 2, direction: 45,
    text: "Sounds good. On the backend side, we are on track for the v2 API migration by end of sprint.",
    timestamp: 0,
  },
  {
    id: '10', speaker: 'Priya Patel', speakerIndex: 3, direction: 160,
    text: "One more thing — we should schedule a cross-team design review before the feature freeze.",
    timestamp: 0,
  },
];

// ─── Pulsing Ripple ─────────────────────────────────────────────────────────
function PulsingRipple({ color, delay = 0 }: { color: string; delay?: number }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: 3, duration: 1600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 1600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.4, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [delay, scale, opacity]);

  return (
    <Animated.View style={{
      position: 'absolute',
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2.5,
      borderColor: color,
      opacity,
      transform: [{ scale }],
    }} />
  );
}

// ─── Speaker Node on Radar ──────────────────────────────────────────────────
function SpeakerNode({ speaker, isActive }: { speaker: Speaker; isActive: boolean }) {
  const color = SPEAKER_COLORS[speaker.index % SPEAKER_COLORS.length];
  const radius = 58;
  const angleRad = ((speaker.direction - 90) * Math.PI) / 180;
  const x = Math.cos(angleRad) * radius;
  const y = Math.sin(angleRad) * radius;
  const initials = speaker.name.split(' ').map(n => n[0]).join('');

  // Animate scale when becoming active
  const nodeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.sequence([
        Animated.timing(nodeScale, { toValue: 1.3, duration: 200, useNativeDriver: true }),
        Animated.timing(nodeScale, { toValue: 1.1, duration: 150, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(nodeScale, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isActive, nodeScale]);

  return (
    <View style={[styles.speakerNodeWrapper, { transform: [{ translateX: x }, { translateY: y }] }]}>
      {isActive && (
        <>
          <PulsingRipple color={color} delay={0} />
          <PulsingRipple color={color} delay={500} />
          <PulsingRipple color={color} delay={1000} />
        </>
      )}
      <Animated.View style={[
        styles.speakerNode,
        { backgroundColor: color, transform: [{ scale: nodeScale }] },
        isActive && styles.speakerNodeActive,
      ]}>
        <ThemedText style={styles.speakerInitials}>{initials}</ThemedText>
      </Animated.View>
    </View>
  );
}

// ─── Radar Visualizer ───────────────────────────────────────────────────────
function SoundRadar({ activeSpeakerIndex }: { activeSpeakerIndex: number }) {
  const activeColor = SPEAKER_COLORS[activeSpeakerIndex % SPEAKER_COLORS.length];
  const activeName = MOCK_SPEAKERS.find(s => s.index === activeSpeakerIndex)?.name ?? '—';

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
        {MOCK_SPEAKERS.map((speaker) => (
          <SpeakerNode
            key={speaker.name}
            speaker={speaker}
            isActive={speaker.index === activeSpeakerIndex}
          />
        ))}
      </View>

      {/* Active speaker label */}
      <View style={styles.activeSpeakerLabel}>
        <View style={[styles.activeDot, { backgroundColor: activeColor }]} />
        <ThemedText style={styles.activeSpeakerText}>
          <ThemedText style={[styles.activeSpeakerName, { color: activeColor }]}>{activeName}</ThemedText>
          {' is speaking'}
        </ThemedText>
      </View>
    </View>
  );
}

// ─── Caption Bubble ─────────────────────────────────────────────────────────
function CaptionBubble({ item, isLatest }: { item: Caption; isLatest: boolean }) {
  const color = SPEAKER_COLORS[item.speakerIndex % SPEAKER_COLORS.length];
  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Fade-in animation for new captions
  const fadeAnim = useRef(new Animated.Value(isLatest ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isLatest ? 12 : 0)).current;

  useEffect(() => {
    if (isLatest) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [isLatest, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[
      styles.bubble,
      isLatest && styles.bubbleLatest,
      { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
    ]}>
      <View style={[styles.bubbleAccent, { backgroundColor: color }]} />
      <View style={styles.bubbleContent}>
        <View style={styles.bubbleHeader}>
          <ThemedText style={[styles.bubbleSpeaker, { color }]}>{item.speaker}</ThemedText>
          <ThemedText style={styles.bubbleTime}>{time}</ThemedText>
        </View>
        <ThemedText style={styles.bubbleText}>{item.text}</ThemedText>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function CaptionsScreen() {
  const listRef = useRef<FlatList>(null);
  const allCaptions = [...INITIAL_CAPTIONS, ...QUEUED_CAPTIONS.map(c => ({ ...c, timestamp: Date.now() }))];
  const [captions] = useState<Caption[]>(allCaptions);
  const [activeSpeakerIndex] = useState(allCaptions[allCaptions.length - 1].speakerIndex);

  // Microphone permission & recording state
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request microphone permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setMicPermission(status === 'granted');
    })();
    return () => {
      stopRecording();
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, []);

  const requestMicPermission = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    setMicPermission(status === 'granted');
  }, []);

  const startRecording = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync({
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.wav',
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
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }, []);

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
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Scroll to bottom on new caption
  const handleContentSizeChange = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  // ── Microphone permission not yet determined ──
  if (micPermission === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.permissionContainer}>
          <ThemedText style={styles.permissionLoadingText}>Requesting microphone permission...</ThemedText>
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
            <ThemedText style={styles.permissionIcon}>{'\uD83C\uDF99\uFE0F'}</ThemedText>
            <ThemedText style={styles.permissionTitle}>Microphone Access Needed</ThemedText>
            <ThemedText style={styles.permissionDescription}>
              We need microphone access to capture speech and generate live captions in real time.
            </ThemedText>
            <Pressable
              style={({ pressed }) => [styles.permissionButton, pressed && styles.permissionButtonPressed]}
              onPress={requestMicPermission}
            >
              <ThemedText style={styles.permissionButtonText}>Grant Access</ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.headerTitle}>Live Captions</ThemedText>
            <ThemedText style={styles.headerSub}>{MOCK_SPEAKERS.length} participants</ThemedText>
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
        <SoundRadar activeSpeakerIndex={activeSpeakerIndex} />

        {/* ── Recording Controls ── */}
        <View style={styles.recordingBar}>
          <Pressable
            style={({ pressed }) => [
              styles.recordBtn,
              isRecording && styles.recordBtnActive,
              pressed && styles.recordBtnPressed,
            ]}
            onPress={toggleRecording}
          >
            <View style={[styles.recordBtnInner, isRecording && styles.recordBtnInnerActive]} />
          </Pressable>
          <View style={styles.recordingInfo}>
            <ThemedText style={styles.recordingStatusText}>
              {isRecording ? 'Listening...' : 'Tap to start live captions'}
            </ThemedText>
            {isRecording && (
              <ThemedText style={styles.recordingDurationText}>{formatDuration(recordingDuration)}</ThemedText>
            )}
          </View>
        </View>

        {/* ── Transcript ── */}
        <View style={styles.transcriptSection}>
          <FlatList
            ref={listRef}
            data={captions}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <CaptionBubble item={item} isLatest={index === captions.length - 1} />
            )}
            contentContainerStyle={styles.transcriptList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={handleContentSizeChange}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#0F172A', letterSpacing: 0.3 },
  headerSub: { fontSize: 13, color: '#94A3B8', marginTop: 2, fontWeight: '500' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 7,
  },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  liveLabel: { fontSize: 11, fontWeight: '800', color: '#EF4444', letterSpacing: 1 },

  // Radar
  radarSection: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  radarOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  radarRingOuter: { width: 150, height: 150 },
  radarRingMid: { width: 110, height: 110 },
  radarRingInner: { width: 70, height: 70 },
  crosshairH: {
    position: 'absolute',
    width: 180,
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: 180,
    backgroundColor: '#F1F5F9',
  },
  youMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  youText: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8 },

  // Speaker nodes
  speakerNodeWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerNode: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  speakerNodeActive: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  speakerInitials: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },

  activeSpeakerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  activeSpeakerText: { fontSize: 14, fontWeight: '500', color: '#64748B' },
  activeSpeakerName: { fontWeight: '700' },

  // Transcript
  transcriptSection: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  transcriptList: {
    padding: 16,
    paddingBottom: 24,
  },

  // Permission
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 24,
  },
  permissionLoadingText: { fontSize: 15, color: '#64748B', fontWeight: '500' },
  permissionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%' as const,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  permissionIcon: { fontSize: 48, marginBottom: 16 },
  permissionTitle: { fontSize: 20, fontWeight: '700' as const, color: '#0F172A', marginBottom: 8 },
  permissionDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center' as const,
    lineHeight: 21,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  permissionButtonPressed: { opacity: 0.9 },
  permissionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' as const },

  // Idle badge
  idleBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  idleLabel: { fontSize: 11, fontWeight: '800' as const, color: '#94A3B8', letterSpacing: 1 },

  // Recording bar
  recordingBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 14,
  },
  recordBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#EF4444',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  recordBtnActive: { borderColor: '#DC2626' },
  recordBtnPressed: { opacity: 0.8 },
  recordBtnInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EF4444',
  },
  recordBtnInnerActive: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingStatusText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1E293B',
  },
  recordingDurationText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: '#EF4444',
    marginTop: 2,
  },

  // Caption bubbles
  bubble: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleLatest: {
    borderColor: '#BFDBFE',
    backgroundColor: '#F0F9FF',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bubbleSpeaker: {
    fontSize: 14,
    fontWeight: '700',
  },
  bubbleTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1E293B',
    fontWeight: '400',
  },
});
