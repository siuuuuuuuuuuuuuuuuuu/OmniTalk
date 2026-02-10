/**
 * AccessibilityControls - Accessibility Settings Panel
 * Person 2: Accessibility and Visual Customization
 *
 * UI elements for adjusting accessibility preferences including
 * text size, captions, high contrast, and TTS settings.
 */

import Slider from "@react-native-community/slider";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type {
    AccessibilityControlsProps,
    AccessibilitySettings,
} from "@/types";

type FontSize = AccessibilitySettings["fontSize"];

export function AccessibilityControls({
  settings,
  onSettingsChange,
}: AccessibilityControlsProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "display",
  );

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const fontSizeOptions: { label: string; value: FontSize }[] = [
    { label: "S", value: "small" },
    { label: "M", value: "medium" },
    { label: "L", value: "large" },
    { label: "XL", value: "extra-large" },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Display Settings */}
      <SettingsSection
        title="Display"
        icon="👁"
        isExpanded={expandedSection === "display"}
        onToggle={() => toggleSection("display")}
      >
        {/* Font Size */}
        <View style={styles.settingRow}>
          <ThemedText style={styles.settingLabel}>Font Size</ThemedText>
          <View style={styles.fontSizeSelector}>
            {fontSizeOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.fontSizeButton,
                  settings.fontSize === option.value &&
                    styles.fontSizeButtonActive,
                ]}
                onPress={() => onSettingsChange({ fontSize: option.value })}
                accessibilityLabel={`Font size ${option.label}`}
                accessibilityRole="button"
              >
                <ThemedText
                  style={[
                    styles.fontSizeButtonText,
                    settings.fontSize === option.value &&
                      styles.fontSizeButtonTextActive,
                  ]}
                >
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* High Contrast */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>High Contrast</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Increases text visibility
            </ThemedText>
          </View>
          <Switch
            value={settings.highContrast}
            onValueChange={(value) => onSettingsChange({ highContrast: value })}
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.highContrast ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle high contrast mode"
          />
        </View>
      </SettingsSection>

      {/* Captions Settings */}
      <SettingsSection
        title="Captions"
        icon="💬"
        isExpanded={expandedSection === "captions"}
        onToggle={() => toggleSection("captions")}
      >
        {/* Enable Captions */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Show Captions</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Display real-time text transcription
            </ThemedText>
          </View>
          <Switch
            value={settings.captionsEnabled}
            onValueChange={(value) =>
              onSettingsChange({ captionsEnabled: value })
            }
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.captionsEnabled ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle captions"
          />
        </View>
      </SettingsSection>

      {/* Text-to-Speech Settings */}
      <SettingsSection
        title="Text-to-Speech"
        icon="🔊"
        isExpanded={expandedSection === "tts"}
        onToggle={() => toggleSection("tts")}
      >
        {/* Enable TTS */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Enable TTS</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Read transcribed text aloud
            </ThemedText>
          </View>
          <Switch
            value={settings.ttsEnabled}
            onValueChange={(value) => onSettingsChange({ ttsEnabled: value })}
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.ttsEnabled ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle text-to-speech"
          />
        </View>

        {/* TTS Speed */}
        {settings.ttsEnabled && (
          <View style={styles.sliderRow}>
            <View style={styles.sliderHeader}>
              <ThemedText style={styles.settingLabel}>Speed</ThemedText>
              <ThemedText style={styles.sliderValue}>
                {settings.ttsSpeed.toFixed(1)}x
              </ThemedText>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={2.0}
              step={0.1}
              value={settings.ttsSpeed}
              onValueChange={(value) => onSettingsChange({ ttsSpeed: value })}
              minimumTrackTintColor="#4A90D9"
              maximumTrackTintColor="rgba(128, 128, 128, 0.3)"
              thumbTintColor="#4A90D9"
              accessibilityLabel={`TTS speed ${settings.ttsSpeed}`}
            />
            <View style={styles.sliderLabels}>
              <ThemedText style={styles.sliderLabel}>Slow</ThemedText>
              <ThemedText style={styles.sliderLabel}>Fast</ThemedText>
            </View>
          </View>
        )}
      </SettingsSection>

      {/* Sign Language Settings */}
      <SettingsSection
        title="Sign Language"
        icon="🤟"
        isExpanded={expandedSection === "sign"}
        onToggle={() => toggleSection("sign")}
      >
        {/* Enable Sign Language */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Sign Detection</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Enable camera for sign language input
            </ThemedText>
          </View>
          <Switch
            value={settings.signLanguageEnabled}
            onValueChange={(value) =>
              onSettingsChange({ signLanguageEnabled: value })
            }
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.signLanguageEnabled ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle sign language detection"
          />
        </View>
      </SettingsSection>

      {/* Feedback Settings */}
      <SettingsSection
        title="Feedback"
        icon="📳"
        isExpanded={expandedSection === "feedback"}
        onToggle={() => toggleSection("feedback")}
      >
        {/* Haptic Feedback */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Haptic Feedback</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Vibrate on new messages
            </ThemedText>
          </View>
          <Switch
            value={settings.hapticFeedback}
            onValueChange={(value) =>
              onSettingsChange({ hapticFeedback: value })
            }
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.hapticFeedback ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle haptic feedback"
          />
        </View>
      </SettingsSection>

      {/* Reset Button */}
      <Pressable
        style={styles.resetButton}
        onPress={() => {
          onSettingsChange({
            fontSize: "medium",
            highContrast: false,
            captionsEnabled: true,
            ttsEnabled: false,
            ttsSpeed: 1.0,
            signLanguageEnabled: false,
            hapticFeedback: true,
          });
        }}
        accessibilityLabel="Reset to default settings"
        accessibilityRole="button"
      >
        <ThemedText style={styles.resetButtonText}>
          Reset to Defaults
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

// Collapsible Settings Section
interface SettingsSectionProps {
  title: string;
  icon: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function SettingsSection({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: SettingsSectionProps) {
  return (
    <ThemedView style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${title} settings, ${isExpanded ? "expanded" : "collapsed"}`}
      >
        <ThemedText style={styles.sectionIcon}>{icon}</ThemedText>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        <ThemedText style={styles.expandIcon}>
          {isExpanded ? "▼" : "▶"}
        </ThemedText>
      </Pressable>
      {isExpanded && <View style={styles.sectionContent}>{children}</View>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  sectionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  expandIcon: {
    fontSize: 12,
    opacity: 0.5,
  },
  sectionContent: {
    padding: 16,
    paddingTop: 0,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  settingDescription: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  fontSizeSelector: {
    flexDirection: "row",
    gap: 8,
  },
  fontSizeButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  fontSizeButtonActive: {
    backgroundColor: "#4A90D9",
  },
  fontSizeButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  fontSizeButtonTextActive: {
    color: "#FFFFFF",
  },
  sliderRow: {
    paddingVertical: 12,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4A90D9",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderLabel: {
    fontSize: 10,
    opacity: 0.5,
  },
  resetButton: {
    marginTop: 16,
    padding: 16,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 107, 0.1)",
  },
  resetButtonText: {
    color: "#FF6B6B",
    fontWeight: "600",
  },
});
