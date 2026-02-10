import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { router } from 'expo-router';

// ─── Mode Card ───────────────────────────────────────────────────────────────
function ModeCard({
  icon,
  title,
  description,
  accentColor,
  tintBg,
  tintBorder,
  onPress,
  delay = 0,
}: {
  icon: string;
  title: string;
  description: string;
  accentColor: string;
  tintBg: string;
  tintBorder: string;
  onPress: () => void;
  delay?: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, [delay, fadeAnim, slideAnim]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Pressable
        style={({ pressed }) => [
          styles.modeCard,
          { borderColor: tintBorder },
          pressed && styles.modeCardPressed,
        ]}
        onPress={onPress}
      >
        {/* Colored accent bar */}
        <View style={[styles.modeAccent, { backgroundColor: accentColor }]} />

        <View style={styles.modeBody}>
          {/* Icon area */}
          <View style={[styles.modeIconArea, { backgroundColor: tintBg }]}>
            <ThemedText style={styles.modeIcon}>{icon}</ThemedText>
          </View>

          {/* Text content */}
          <View style={styles.modeContent}>
            <ThemedText style={[styles.modeTitle, { color: accentColor }]}>{title}</ThemedText>
            <ThemedText style={styles.modeDescription}>{description}</ThemedText>
          </View>

          {/* Arrow */}
          <View style={[styles.modeArrow, { backgroundColor: tintBg }]}>
            <ThemedText style={[styles.modeArrowText, { color: accentColor }]}>
              {'\u2192'}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Home Screen ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const brandFade = useRef(new Animated.Value(0)).current;
  const brandSlide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(brandFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(brandSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [brandFade, brandSlide]);

  return (
    <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* ── Brand Section ── */}
          <Animated.View
            style={[
              styles.brandSection,
              { opacity: brandFade, transform: [{ translateY: brandSlide }] },
            ]}
          >
            <Image
              source={require('@/assets/images/OmniTalk_logo_nobg.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </Animated.View>

          {/* ── Mode Selection ── */}
          <View style={styles.modeSection}>
            <ThemedText style={styles.sectionLabel}>Select a mode</ThemedText>

            <ModeCard
              icon={'\uD83C\uDF99\uFE0F'}
              title="Speech to Text"
              description="Live captions from speakers around you"
              accentColor="#2563EB"
              tintBg="#EFF6FF"
              tintBorder="#BFDBFE"
              onPress={() => router.navigate('/(tabs)/captions')}
              delay={200}
            />

            <ModeCard
              icon={'\uD83E\uDD1F'}
              title="Sign to Speech"
              description="Convert sign language to text and speech in real-time"
              accentColor="#f7b715"
              tintBg="#ECFDF5"
              tintBorder="#ffdb3c"
              onPress={() => router.navigate('/(tabs)/sign-language')}
              delay={350}
            />
          </View>
        </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingBottom: 40,
  },

  // Brand
  brandSection: {
    alignItems: 'center',
    paddingTop: 38,
    backgroundColor: '#FFFFFF',
  },
  logo: {
    width: 250,
    height: 250,
  },
  tagline: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 6,
  },

  // Mode selection
  modeSection: {
    paddingHorizontal: 30,
    paddingTop: 2,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 16,

  },
  modeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  modeCardPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.03,
  },
  modeAccent: {
    width: 5,
  },
  modeBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  modeIconArea: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeIcon: {
    fontSize: 28,
  },
  modeContent: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modeDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    fontWeight: '400',
  },
  modeArrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeArrowText: {
    fontSize: 18,
    fontWeight: '600',
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 40,
  },
  footerDivider: {
    width: 40,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#E2E8F0',
    marginBottom: 16,
  },
  footerText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 20,
  },
});
