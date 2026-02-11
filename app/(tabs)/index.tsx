import { ThemedText } from '@/components/themed-text';
import { createRealtimeSocketService, RealtimeSocketService } from "@/services/RealtimeSocket";
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, SafeAreaView, StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  useEffect(() => { //to test WebSocket connection
    const socket: RealtimeSocketService = createRealtimeSocketService(
      {
        onConnect: () => console.log("✅ WS connected (HomeScreen)"),
        onDisconnect: (r) => console.log("❌ WS disconnected (HomeScreen):", r),
        onError: (e) => console.log("⚠️ WS error (HomeScreen):", e),
      }
    );

    socket.connect().catch((e) => console.log("WS connect failed:", e));

    return () => socket.disconnect();
  }, []);
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
            <ThemedText style={styles.cardSub}>Live translation</ThemedText>
          </Pressable>
        </View>
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

  // Logo
  logoArea: {
    alignItems: 'center',
    paddingTop: 12,
  },
  logoClip: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
  },
  logo: {
    width: 180,
    height: 180,
  },

  // Greeting
  greetingArea: {
    paddingTop: 12,
    paddingBottom: 32,
  },
  greeting: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 6,
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
});
