import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AccessibilityControls } from '@/components/AccessibilityControls';
import { CameraCapture } from '@/components/CameraCapture';
import { ThemedText } from '@/components/themed-text';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useAccessibility } from '@/state/AppContext';
import type { SignDetectionResult, SignToTextResult } from '@/types';

// Backend URL for sign language detection
const SIGN_BACKEND_URL = process.env.EXPO_PUBLIC_SIGN_BACKEND_URL || "ws://localhost:8080/ws";

// ─── Types ───────────────────────────────────────────────────────────────────
type DetectedSign = {
  id: string;
  text: string;
  timestamp: number;
};

// ─── Detected signs (will be populated by actual sign detection) ───────────
const INITIAL_DETECTED: DetectedSign[] = [];

// ─── Font size helper ────────────────────────────────────────────────────────
function getAccessibleFontSize(fontSize: string): number {
  switch (fontSize) {
    case 'small': return 13;
    case 'medium': return 15;
    case 'large': return 19;
    case 'extra-large': return 25;
    default: return 15;
  }
}

// ─── Detected Text Item ──────────────────────────────────────────────────────
function DetectedItem({
  item,
  isLatest,
  highContrast,
  fontSize,
}: {
  item: DetectedSign;
  isLatest: boolean;
  highContrast: boolean;
  fontSize: number;
}) {
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
        highContrast && styles.detectedItemHighContrast,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.detectedDot} />
      <View style={styles.detectedContent}>
        <ThemedText
          style={[
            styles.detectedText,
            { fontSize, lineHeight: fontSize * 1.47 },
            highContrast && styles.highContrastText,
          ]}
        >
          {item.text}
        </ThemedText>
        <ThemedText style={[styles.detectedTime, highContrast && styles.highContrastMuted]}>
          {time}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function SignLanguageScreen() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedSigns, setDetectedSigns] = useState(INITIAL_DETECTED);

  const { settings, updateSettings } = useAccessibility();
  const tts = useTextToSpeech({ autoSpeak: false });
  const [showSettings, setShowSettings] = useState(false);

  const fullText = detectedSigns.map(d => d.text).join('. ');

  // Handle sign detection results
  const handleSignDetected = useCallback((result: SignDetectionResult) => {
    if (!result.gesture || result.confidence < 0.7) return;

    console.log('Sign detected:', result.gesture, 'confidence:', result.confidence);

    // Don't add duplicate consecutive gestures
    setDetectedSigns(prev => {
      const lastSign = prev[prev.length - 1];
      if (lastSign && lastSign.text.toLowerCase() === result.gesture.toLowerCase()) {
        return prev;
      }

      const newSign: DetectedSign = {
        id: `sign-${Date.now()}-${Math.random()}`,
        text: result.gesture.replace('asl_', '').toUpperCase(),
        timestamp: result.timestamp || Date.now(),
      };

      return [...prev, newSign];
    });
  }, []);

  // Handle text result (full sentence/phrase)
  const handleTextResult = useCallback((result: SignToTextResult) => {
    console.log('Text result:', result.text);

    const newSign: DetectedSign = {
      id: `text-${Date.now()}-${Math.random()}`,
      text: result.text,
      timestamp: result.timestamp,
    };

    setDetectedSigns(prev => [...prev, newSign]);
  }, []);

  // Handle errors
  const handleError = useCallback((error: Error) => {
    console.error('Sign detection error:', error);
  }, []);

  const toggleDetection = useCallback(() => {
    setIsDetecting(prev => !prev);
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
    setDetectedSigns([]);
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


  const accessibleFontSize = getAccessibleFontSize(settings.fontSize);

  return (
    <SafeAreaView style={[styles.safeArea, settings.highContrast && styles.safeAreaHighContrast]}>
      <View style={[styles.container, settings.highContrast && styles.containerHighContrast]}>
        {/* ── Header ── */}
        <View style={[styles.header, settings.highContrast && styles.headerHighContrast]}>
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
            <CameraCapture
              isActive={isDetecting}
              backendUrl={SIGN_BACKEND_URL}
              signLanguage="ASL"
              confidenceThreshold={0.7}
              onSignDetected={handleSignDetected}
              onTextResult={handleTextResult}
              onError={handleError}
            />
          </View>

          {/* Detection Toggle */}
          <View style={styles.cameraControlsBar}>
            <Pressable
              style={({ pressed }) => [
                styles.toggleDetectBtn,
                isDetecting && styles.toggleDetectBtnActive,
                pressed && styles.toggleDetectBtnPressed,
              ]}
              onPress={toggleDetection}
            >
              <ThemedText style={styles.toggleDetectBtnIcon}>
                {isDetecting ? '⏸' : '▶'}
              </ThemedText>
              <ThemedText style={[styles.toggleDetectBtnText, isDetecting && styles.toggleDetectBtnTextActive]}>
                {isDetecting ? 'Stop Detection' : 'Start Detection'}
              </ThemedText>
            </Pressable>
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
                  highContrast={settings.highContrast}
                  fontSize={accessibleFontSize}
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

            <Pressable
              style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
              onPress={() => setShowSettings(!showSettings)}
              accessibilityLabel={showSettings ? "Close settings" : "Open accessibility settings"}
              accessibilityRole="button"
            >
              <ThemedText style={styles.settingsBtnIcon}>⚙</ThemedText>
            </Pressable>
          </View>
        </View>

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

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  safeAreaHighContrast: { backgroundColor: '#000000' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  containerHighContrast: { backgroundColor: '#000000' },

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
  headerHighContrast: { backgroundColor: '#111111', borderBottomColor: '#333333' },
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
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cameraWrapper: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },

  // Camera controls bar
  cameraControlsBar: {
    marginTop: 12,
    marginBottom: 4,
  },
  toggleDetectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleDetectBtnActive: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  toggleDetectBtnPressed: {
    opacity: 0.9,
  },
  toggleDetectBtnIcon: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  toggleDetectBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  toggleDetectBtnTextActive: {
    color: '#FFFFFF',
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
  detectedItemHighContrast: {
    backgroundColor: '#1A1A1A',
    borderColor: '#333333',
  },
  highContrastText: {
    color: '#FFFFFF',
  },
  highContrastMuted: {
    color: '#AAAAAA',
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
    flex: 2,
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
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnPressed: { backgroundColor: '#E2E8F0' },
  clearBtnText: { fontSize: 15, fontWeight: '600', color: '#64748B' },

  settingsBtn: {
    width: 48,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#64748B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnPressed: { backgroundColor: '#475569' },
  settingsBtnIcon: { fontSize: 20, color: '#FFFFFF' },


  // Settings Modal
  settingsModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 100,
  },
  settingsBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  settingsContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  settingsCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsCloseBtnText: {
    fontSize: 20,
    color: '#64748B',
    fontWeight: '600',
  },
  settingsScroll: {
    padding: 24,
  },
});
