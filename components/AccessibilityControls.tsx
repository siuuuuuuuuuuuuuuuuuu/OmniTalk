/**
 * AccessibilityControls - Accessibility Settings Panel
 * Person 2: Accessibility and Visual Customization
 *
 * UI elements for adjusting accessibility preferences including
 * text size, captions, high contrast, TTS settings, and user mode presets.
 *
 * Features:
 * - One-tap accessibility presets (Deaf, Blind, Mute, Standard)
 * - Font size selector with live preview text
 * - High contrast toggle
 * - Captions toggle
 * - TTS toggle with speed and pitch sliders
 * - Sign language detection toggle
 * - Haptic feedback toggle
 * - Animated collapsible sections
 * - Reset to defaults
 */

import * as Haptics from "expo-haptics";
import Slider from "@react-native-community/slider";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type {
  AccessibilityControlsProps,
  AccessibilitySettings,
} from "@/types";

type FontSize = AccessibilitySettings["fontSize"];

interface AccessibilityPreset {
  id: string;
  label: string;
  icon: string;
  description: string;
  settings: Partial<AccessibilitySettings>;
}

const PRESETS: AccessibilityPreset[] = [
  {
    id: "deaf",
    label: "Deaf",
    icon: "👁",
    description: "Large text, captions on, high contrast",
    settings: {
      fontSize: "large",
      highContrast: true,
      captionsEnabled: true,
      ttsEnabled: false,
      signLanguageEnabled: true,
      hapticFeedback: true,
    },
  },
  {
    id: "blind",
    label: "Blind",
    icon: "🔊",
    description: "Haptic feedback enabled",
    settings: {
      fontSize: "medium",
      highContrast: false,
      captionsEnabled: false,
      ttsEnabled: false,
      ttsSpeed: 1.0,
      signLanguageEnabled: false,
      hapticFeedback: true,
    },
  },
  {
    id: "mute",
    label: "Mute",
    icon: "🤟",
    description: "Sign language on, captions on",
    settings: {
      fontSize: "medium",
      highContrast: false,
      captionsEnabled: true,
      ttsEnabled: false,
      signLanguageEnabled: true,
      hapticFeedback: true,
    },
  },
  {
    id: "standard",
    label: "Standard",
    icon: "👤",
    description: "Default balanced settings",
    settings: {
      fontSize: "medium",
      highContrast: false,
      captionsEnabled: true,
      ttsEnabled: false,
      ttsSpeed: 1.0,
      signLanguageEnabled: false,
      hapticFeedback: true,
    },
  },
];

const FONT_SIZE_MAP: Record<FontSize, number> = {
  small: 14,
  medium: 18,
  large: 22,
  "extra-large": 28,
};

export function AccessibilityControls({
  settings,
  onSettingsChange,
}: AccessibilityControlsProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "presets",
  );
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const toggleSection = useCallback(
    (section: string) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setExpandedSection(expandedSection === section ? null : section);
    },
    [expandedSection],
  );

  const applyPreset = useCallback(
    (preset: AccessibilityPreset) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setActivePreset(preset.id);
      onSettingsChange(preset.settings);
    },
    [onSettingsChange],
  );

  const handleSettingsChange = useCallback(
    (changes: Partial<AccessibilitySettings>) => {
      setActivePreset(null); // Clear preset when manually changing
      onSettingsChange(changes);
    },
    [onSettingsChange],
  );

  const fontSizeOptions: { label: string; value: FontSize }[] = [
    { label: "S", value: "small" },
    { label: "M", value: "medium" },
    { label: "L", value: "large" },
    { label: "XL", value: "extra-large" },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Accessibility Presets */}
      <SettingsSection
        title="Quick Presets"
        icon="⚡"
        isExpanded={expandedSection === "presets"}
        onToggle={() => toggleSection("presets")}
      >
        <ThemedText style={styles.presetHint}>
          One-tap profiles optimized for different accessibility needs
        </ThemedText>
        <View style={styles.presetsGrid}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              style={[
                styles.presetCard,
                activePreset === preset.id && styles.presetCardActive,
              ]}
              onPress={() => applyPreset(preset)}
              accessibilityLabel={`${preset.label} preset: ${preset.description}`}
              accessibilityRole="button"
            >
              <ThemedText style={styles.presetIcon}>{preset.icon}</ThemedText>
              <ThemedText
                style={[
                  styles.presetLabel,
                  activePreset === preset.id && styles.presetLabelActive,
                ]}
              >
                {preset.label}
              </ThemedText>
              <ThemedText style={styles.presetDescription} numberOfLines={2}>
                {preset.description}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </SettingsSection>

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
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.selectionAsync();
                  }
                  handleSettingsChange({ fontSize: option.value });
                }}
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

        {/* Font Size Preview */}
        <View style={styles.fontPreview}>
          <ThemedText
            style={[
              styles.fontPreviewText,
              { fontSize: FONT_SIZE_MAP[settings.fontSize] },
              settings.highContrast && styles.fontPreviewHighContrast,
            ]}
          >
            The quick brown fox jumps over the lazy dog
          </ThemedText>
          <ThemedText style={styles.fontPreviewLabel}>
            Preview ({settings.fontSize})
          </ThemedText>
        </View>

        {/* High Contrast */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>High Contrast</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Increases text visibility with stronger colors
            </ThemedText>
          </View>
          <Switch
            value={settings.highContrast}
            onValueChange={(value) =>
              handleSettingsChange({ highContrast: value })
            }
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.highContrast ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle high contrast mode"
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
              Vibrate on new messages and interactions
            </ThemedText>
          </View>
          <Switch
            value={settings.hapticFeedback}
            onValueChange={(value) => {
              handleSettingsChange({ hapticFeedback: value });
              if (value && Platform.OS !== "web") {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              }
            }}
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.hapticFeedback ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle haptic feedback"
          />
        </View>
      </SettingsSection>

      {/* Current Settings Summary */}
      <View style={styles.summaryCard}>
        <ThemedText style={styles.summaryTitle}>Active Settings</ThemedText>
        <View style={styles.summaryTags}>
          <SettingTag
            label={`Font: ${settings.fontSize}`}
            active={settings.fontSize !== "medium"}
          />
          {settings.highContrast && (
            <SettingTag label="High Contrast" active={true} />
          )}
          {settings.hapticFeedback && (
            <SettingTag label="Haptics" active={false} />
          )}
        </View>
      </View>

      {/* Reset Button */}
      <Pressable
        style={styles.resetButton}
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          setActivePreset(null);
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
        <ThemedText style={styles.resetButtonIcon}>↺</ThemedText>
        <ThemedText style={styles.resetButtonText}>
          Reset to Defaults
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

// Setting Tag Component for summary
function SettingTag({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <View style={[styles.tag, active && styles.tagActive]}>
      <ThemedText style={[styles.tagText, active && styles.tagTextActive]}>
        {label}
      </ThemedText>
    </View>
  );
}

// Collapsible Settings Section with animation
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
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isExpanded, rotateAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <ThemedView style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${title} settings, ${isExpanded ? "expanded" : "collapsed"}`}
        accessibilityState={{ expanded: isExpanded }}
      >
        <ThemedText style={styles.sectionIcon}>{icon}</ThemedText>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <ThemedText style={styles.expandIcon}>▶</ThemedText>
        </Animated.View>
      </Pressable>
      {isExpanded && <View style={styles.sectionContent}>{children}</View>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Presets
  presetHint: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 12,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  presetCard: {
    width: "47%",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(128, 128, 128, 0.06)",
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
  },
  presetCardActive: {
    borderColor: "#4A90D9",
    backgroundColor: "#F0F9FF",
  },
  presetIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  presetLabelActive: {
    color: "#4A90D9",
  },
  presetDescription: {
    fontSize: 11,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 15,
  },
  // Sections
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
  // Settings rows
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
  // Font size selector
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
  // Font preview
  fontPreview: {
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 10,
    backgroundColor: "rgba(128, 128, 128, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.1)",
  },
  fontPreviewText: {
    lineHeight: 32,
    color: "#1E293B",
  },
  fontPreviewHighContrast: {
    color: "#FFFFFF",
    backgroundColor: "#000000",
  },
  fontPreviewLabel: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Sliders
  sliderRow: {
    paddingVertical: 12,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sliderValueBadge: {
    backgroundColor: "#4A90D9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sliderValueText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
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
  // Speed presets
  speedPresets: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  speedPresetButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(128, 128, 128, 0.08)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  speedPresetButtonActive: {
    backgroundColor: "#F0F9FF",
    borderColor: "#4A90D9",
  },
  speedPresetText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  speedPresetTextActive: {
    color: "#4A90D9",
    fontWeight: "700",
  },
  // Info box
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    padding: 12,
    backgroundColor: "#F0F9FF",
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#4A90D9",
    gap: 8,
  },
  infoBoxIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
  },
  // Summary
  summaryCard: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(128, 128, 128, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.1)",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "rgba(128, 128, 128, 0.08)",
  },
  tagActive: {
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#4A90D9",
  },
  tagText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
  tagTextActive: {
    color: "#4A90D9",
    fontWeight: "600",
  },
  // Reset
  resetButton: {
    marginTop: 16,
    marginBottom: 24,
    padding: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 107, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.2)",
  },
  resetButtonIcon: {
    fontSize: 18,
    color: "#FF6B6B",
  },
  resetButtonText: {
    color: "#FF6B6B",
    fontWeight: "600",
    fontSize: 14,
  },
});
