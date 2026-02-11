import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { ThemedText } from '@/components/themed-text';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useAccessibility } from '@/state/AppContext';

// ─── Mock detected signs (static demo data) ─────────────────────────────────
const MOCK_DETECTED: { id: string; text: string; timestamp: number }[] = [
  { id: '1', text: 'Hello everyone', timestamp: Date.now() - 15000 },
  { id: '2', text: 'Thank you for having me', timestamp: Date.now() - 11000 },
  { id: '3', text: 'I have a question about the project timeline', timestamp: Date.now() - 7000 },
  { id: '4', text: 'Can we schedule a follow-up meeting', timestamp: Date.now() - 3000 },
];

// ─── Detected Text Item ──────────────────────────────────────────────────────
function DetectedItem({ item, isLatest }: { item: typeof MOCK_DETECTED[0]; isLatest: boolean }) {
  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fadeAnim = useRef(new Animated.Value(isLatest ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isLatest ? 10 : 0)).current;

  useEffect(() => {
    if (isLatest) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [isLatest, fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.detectedItem,
        isLatest && styles.detectedItemLatest,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.detectedDot} />
      <View style={styles.detectedContent}>
        <ThemedText style={styles.detectedText}>{item.text}</ThemedText>
        <ThemedText style={styles.detectedTime}>{time}</ThemedText>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function SignLanguageScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedSigns] = useState(MOCK_DETECTED);
  const cameraRef = useRef<CameraView>(null);

  const { settings } = useAccessibility();
  const tts = useTextToSpeech({ autoSpeak: false });

  const fullText = detectedSigns.map(d => d.text).join('. ');

  const toggleDetection = useCallback(() => {
    setIsDetecting(prev => !prev);
  }, []);

  const toggleFacing = useCallback(() => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  const speakText = useCallback(async () => {
    if (!fullText.trim()) return;

    if (tts.isSpeaking) {
      await tts.stop();
      return;
    }

    tts.speak(fullText);
  }, [fullText, tts]);

  const clearText = useCallback(() => {
    tts.stop();
  }, [tts]);

  // Auto-read new detections when TTS is enabled
  const lastReadId = useRef<string>('');
  useEffect(() => {
    if (!settings.ttsEnabled || detectedSigns.length === 0) return;
    const latest = detectedSigns[detectedSigns.length - 1];
    if (latest.id !== lastReadId.current) {
      lastReadId.current = latest.id;
      tts.speakSegment(latest.text, 'Sign Language');
    }
  }, [detectedSigns, settings.ttsEnabled]);

  // ── Permission states ──
  if (!permission) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.permissionContainer}>
          <ThemedText style={styles.permissionText}>Requesting camera permission...</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionCard}>
            <ThemedText style={styles.permissionIcon}>{'\uD83D\uDCF7'}</ThemedText>
            <ThemedText style={styles.permissionTitle}>Camera Access Needed</ThemedText>
            <ThemedText style={styles.permissionDescription}>
              We need camera access to detect sign language gestures and convert them to text.
            </ThemedText>
            <Pressable
              style={({ pressed }) => [styles.permissionButton, pressed && styles.permissionButtonPressed]}
              onPress={requestPermission}
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
            <ThemedText style={styles.headerTitle}>Sign Language</ThemedText>
            <ThemedText style={styles.headerSub}>Front camera active</ThemedText>
          </View>
          <View style={[styles.statusBadge, isDetecting ? styles.statusBadgeActive : styles.statusBadgeIdle]}>
            <View style={[styles.statusDot, isDetecting ? styles.statusDotActive : styles.statusDotIdle]} />
            <ThemedText style={[styles.statusLabel, isDetecting ? styles.statusLabelActive : styles.statusLabelIdle]}>
              {isDetecting ? 'DETECTING' : 'READY'}
            </ThemedText>
          </View>
        </View>

        {/* ── Camera Section ── */}
        <View style={styles.cameraSection}>
          <View style={styles.cameraWrapper}>
            <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
              {/* Overlay */}
              <View style={styles.cameraOverlay}>
                {/* Detection status */}
                {isDetecting && (
                  <View style={styles.detectingBanner}>
                    <View style={styles.detectingPulse} />
                    <ThemedText style={styles.detectingText}>Detecting signs...</ThemedText>
                  </View>
                )}

                {/* Hand guide */}
                <View style={styles.handGuide}>
                  <View style={styles.handGuideFrame} />
                  <ThemedText style={styles.handGuideText}>Position hands here</ThemedText>
                </View>

                {/* Camera controls */}
                <View style={styles.cameraControls}>
                  <Pressable
                    style={({ pressed }) => [styles.cameraBtn, pressed && styles.cameraBtnPressed]}
                    onPress={toggleFacing}
                  >
                    <ThemedText style={styles.cameraBtnText}>{'\uD83D\uDD04'}</ThemedText>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.detectBtn,
                      isDetecting && styles.detectBtnActive,
                      pressed && styles.detectBtnPressed,
                    ]}
                    onPress={toggleDetection}
                  >
                    <View style={[styles.detectBtnInner, isDetecting && styles.detectBtnInnerActive]} />
                  </Pressable>

                  <View style={styles.cameraBtnPlaceholder} />
                </View>
              </View>
            </CameraView>
          </View>
        </View>

        {/* ── Transcript Section ── */}
        <View style={styles.transcriptSection}>
          <View style={styles.transcriptHeader}>
            <ThemedText style={styles.transcriptTitle}>Detected Text</ThemedText>
            <ThemedText style={styles.transcriptCount}>
              {detectedSigns.length} {detectedSigns.length === 1 ? 'phrase' : 'phrases'}
            </ThemedText>
          </View>

          {/* TTS status bar when active */}
          {settings.ttsEnabled && tts.isSpeaking && (
            <View style={styles.ttsStatusBar}>
              <ThemedText style={styles.ttsStatusIcon}>{'\uD83D\uDD0A'}</ThemedText>
              <ThemedText style={styles.ttsStatusText}>Reading detected signs aloud...</ThemedText>
            </View>
          )}

          <ScrollView
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptList}
            showsVerticalScrollIndicator={false}
          >
            {detectedSigns.length === 0 ? (
              <View style={styles.emptyState}>
                <ThemedText style={styles.emptyIcon}>{'\uD83E\uDD1F'}</ThemedText>
                <ThemedText style={styles.emptyText}>
                  Start detection and begin signing to see text appear here
                </ThemedText>
              </View>
            ) : (
              detectedSigns.map((item, index) => (
                <DetectedItem
                  key={item.id}
                  item={item}
                  isLatest={index === detectedSigns.length - 1}
                />
              ))
            )}
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.actionBar}>
            <Pressable
              style={({ pressed }) => [
                styles.speakBtn,
                tts.isSpeaking && styles.speakBtnActive,
                pressed && styles.speakBtnPressed,
              ]}
              onPress={speakText}
            >
              <ThemedText style={styles.speakBtnIcon}>
                {tts.isSpeaking ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
              </ThemedText>
              <ThemedText style={[styles.speakBtnText, tts.isSpeaking && styles.speakBtnTextActive]}>
                {tts.isSpeaking ? 'Stop' : 'Speak All'}
              </ThemedText>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.clearBtn, pressed && styles.clearBtnPressed]}
              onPress={clearText}
            >
              <ThemedText style={styles.clearBtnText}>Clear</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
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

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 7,
  },
  statusBadgeIdle: { backgroundColor: '#F1F5F9' },
  statusBadgeActive: { backgroundColor: '#ECFDF5' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotIdle: { backgroundColor: '#94A3B8' },
  statusDotActive: { backgroundColor: '#059669' },
  statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  statusLabelIdle: { color: '#94A3B8' },
  statusLabelActive: { color: '#059669' },

  // Camera
  cameraSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cameraWrapper: {
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 14,
  },

  detectingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  detectingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  detectingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  handGuide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  handGuideFrame: {
    width: 180,
    height: 140,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 20,
    borderStyle: 'dashed',
  },
  handGuideText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },

  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  cameraBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBtnPressed: { backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  cameraBtnText: { fontSize: 18 },
  cameraBtnPlaceholder: { width: 42, height: 42 },

  detectBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detectBtnActive: { borderColor: '#34D399' },
  detectBtnPressed: { opacity: 0.8 },
  detectBtnInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  detectBtnInnerActive: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },

  // Transcript
  transcriptSection: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  transcriptTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  transcriptCount: { fontSize: 12, fontWeight: '500', color: '#94A3B8' },

  // TTS status bar
  ttsStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    gap: 8,
  },
  ttsStatusIcon: {
    fontSize: 14,
  },
  ttsStatusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3B82F6',
  },

  transcriptScroll: { flex: 1 },
  transcriptList: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  detectedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    gap: 12,
  },
  detectedItemLatest: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF9',
  },
  detectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
    marginTop: 6,
  },
  detectedContent: {
    flex: 1,
  },
  detectedText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1E293B',
    fontWeight: '400',
  },
  detectedTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: 4,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  speakBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  speakBtnActive: { backgroundColor: '#DC2626' },
  speakBtnPressed: { opacity: 0.9 },
  speakBtnIcon: { fontSize: 18 },
  speakBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  speakBtnTextActive: { color: '#FFFFFF' },

  clearBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnPressed: { backgroundColor: '#E2E8F0' },
  clearBtnText: { fontSize: 15, fontWeight: '600', color: '#64748B' },

  // Permission
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 24,
  },
  permissionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
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
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  permissionText: { fontSize: 15, color: '#64748B', fontWeight: '500' },
  permissionDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  permissionButtonPressed: { opacity: 0.9 },
  permissionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
