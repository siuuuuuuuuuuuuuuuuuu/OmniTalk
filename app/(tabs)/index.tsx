import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { FontAwesome5 } from '@expo/vector-icons';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* Greeting */}
        <View style={styles.greetingArea}>
          <ThemedText style={styles.appName}>Welcome to</ThemedText>
          <ThemedText style={styles.appName}>OmniTalk</ThemedText>
          <ThemedText style={styles.subtitle}>
            Choose how you want to communicate
          </ThemedText>
        </View>

        {/* Mode cards */}
        <View style={styles.cardsRow}>
          <Pressable
            style={({ pressed }) => [styles.card, styles.cardBlue, pressed && styles.cardPressed]}
            onPress={() => router.navigate('/(tabs)/captions')}
          >
            <View style={styles.cardIconWrap}>
              <MaterialIcons name="mic" size={32} color="#2563EB" />
            </View>
            <ThemedText style={styles.cardTitle}>Speech{'\n'}to Text</ThemedText>
            <ThemedText style={styles.cardSub}>Live captions</ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.card, styles.cardYellow, pressed && styles.cardPressed]}
            onPress={() => router.navigate('/(tabs)/sign-language')}
          >
            <View style={styles.cardIconWrap}>
              <FontAwesome5 name="sign-language" size={28} color="#D97706" />
            </View>
            <ThemedText style={styles.cardTitle}>Sign{'\n'}to Speech</ThemedText>
            <ThemedText style={styles.cardSub}>Camera translate</ThemedText>
          </Pressable>
        </View>

        {/* Settings shortcut */}
        <Pressable
          style={({ pressed }) => [styles.settingsCard, pressed && styles.settingsCardPressed]}
          onPress={() => router.navigate('/(tabs)/settings')}
        >
          <View style={styles.settingsIconWrap}>
            <MaterialIcons name="settings" size={24} color="#6366F1" />
          </View>
          <View style={styles.settingsInfo}>
            <ThemedText style={styles.settingsTitle}>Accessibility Settings</ThemedText>
            <ThemedText style={styles.settingsSub}>
              Customize font size, contrast, TTS, and more
            </ThemedText>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 28,
    paddingTop: 30,
  },

  // Greeting
  greetingArea: {
    paddingTop: 12,
    paddingBottom: 32,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    color: '#0F172A',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '400',
    marginTop: 8,
  },

  // Cards
  cardsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  card: {
    flex: 1,
    borderRadius: 24,
    padding: 22,
    paddingTop: 28,
    paddingBottom: 24,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  cardBlue: {
    backgroundColor: '#EFF6FF',
  },
  cardYellow: {
    backgroundColor: '#FFF8E1',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 26,
  },
  cardSub: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 4,
  },

  // Settings shortcut
  settingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#F5F3FF',
    gap: 14,
  },
  settingsCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  settingsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsInfo: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingsSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '400',
    marginTop: 2,
  },
});
