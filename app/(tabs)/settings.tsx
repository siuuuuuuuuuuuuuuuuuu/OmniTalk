/**
 * Settings Screen
 * Person 2: Accessibility and Visual Customization
 *
 * Provides access to accessibility settings via the AccessibilityControls
 * component, wired to the global AppContext for persistent state.
 */

import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';

import { AccessibilityControls } from '@/components/AccessibilityControls';
import { ThemedText } from '@/components/themed-text';
import { useAccessibility } from '@/state/AppContext';

export default function SettingsScreen() {
  const { settings, updateSettings } = useAccessibility();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.headerTitle}>Settings</ThemedText>
            <ThemedText style={styles.headerSub}>
              Customize your experience
            </ThemedText>
          </View>
        </View>

        {/* Accessibility Controls connected to global state */}
        <View style={styles.content}>
          <AccessibilityControls
            settings={settings}
            onSettingsChange={updateSettings}
          />
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
    backgroundColor: '#F8FAFC',
  },
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
