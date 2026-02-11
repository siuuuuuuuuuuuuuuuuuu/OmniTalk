/**
 * AccessibilityControls - Accessibility Settings Panel
 * Person 2: Accessibility and Visual Customization
 *
 * UI elements for adjusting accessibility preferences including
 * text size, captions, high contrast, TTS settings, and quick
 * presets for different user accessibility modes.
 */

import Slider from "@react-native-community/slider";
import React, { useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  UIManager,
  Platform,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type {
  AccessibilityControlsProps,
  AccessibilitySettings,
  UserAccessibilityMode,
} from "@/types";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FontSize = AccessibilitySettings["fontSize"];

const FONT_SIZE_MAP: Record<FontSize, number> = {
  small: 13,
  medium: 16,
  large: 20,
  "extra-large": 24,
};

// Accessibility presets for quick setup
const ACCESSIBILITY_PRESETS: {
  mode: UserAccessibilityMode;
  label: string;
  icon: string;
  description: string;
  settings: Partial<AccessibilitySettings>;
}[] = [
  {
    mode: "deaf",
    label: "Deaf",
    icon: "\uD83D\uDC42",
    description: "Captions on, large text, high contrast",
    settings: {
      fontSize: "large",
      highContrast: true,
      captionsEnabled: true,
      ttsEnabled: false,
      signLanguageEnabled: false,
      hapticFeedback: true,
    },
  },
  {
    mode: "mute",
    label: "Mute",
    icon: "\uD83E\uDD10",
    description: "Sign language on, text input ready",
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
    mode: "blind",
    label: "Blind",
    icon: "\uD83D\uDC41",
    description: "TTS on, extra-large text, haptic feedback",
    settings: {
      fontSize: "extra-large",
      highContrast: true,
      captionsEnabled: false,
      ttsEnabled: true,
      ttsSpeed: 1.0,
      signLanguageEnabled: false,
      hapticFeedback: true,
    },
  },
  {
    mode: "standard",
    label: "Standard",
    icon: "\uD83D\uDC64",
    description: "Default settings for all features",
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

export function AccessibilityControls({
  settings,
  onSettingsChange,
}: AccessibilityControlsProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "presets",
  );
  const [activePreset, setActivePreset] = useState<UserAccessibilityMode | null>(null);

  const toggleSection = (section: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSection(expandedSection === section ? null : section);
  };

  const applyPreset = (preset: typeof ACCESSIBILITY_PRESETS[0]) => {
    setActivePreset(preset.mode);
    onSettingsChange(preset.settings);
  };

  const fontSizeOptions: { label: string; value: FontSize; sampleSize: number }[] = [
    { label: "S", value: "small", sampleSize: 13 },
    { label: "M", value: "medium", sampleSize: 16 },
    { label: "L", value: "large", sampleSize: 20 },
    { label: "XL", value: "extra-large", sampleSize: 24 },
  ];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Quick Presets */}
      <SettingsSection
        title="Quick Setup"
        icon="\u26A1"
        isExpanded={expandedSection === "presets"}
        onToggle={() => toggleSection("presets")}
      >
        <ThemedText style={styles.presetHint}>
          Choose your accessibility profile
        </ThemedText>
        <View style={styles.presetGrid}>
          {ACCESSIBILITY_PRESETS.map((preset) => (
            <Pressable
              key={preset.mode}
              style={({ pressed }) => [
                styles.presetCard,
                activePreset === preset.mode && styles.presetCardActive,
                pressed && styles.presetCardPressed,
              ]}
              onPress={() => applyPreset(preset)}
              accessibilityLabel={`${preset.label} preset: ${preset.description}`}
              accessibilityRole="button"
            >
              <ThemedText style={styles.presetIcon}>{preset.icon}</ThemedText>
              <ThemedText
                style={[
                  styles.presetLabel,
                  activePreset === preset.mode && styles.presetLabelActive,
                ]}
              >
                {preset.label}
              </ThemedText>
              <ThemedText style={styles.presetDescription}>
                {preset.description}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </SettingsSection>

      {/* Display Settings */}
      <SettingsSection
        title="Display"
        icon="\uD83D\uDC41"
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
                  setActivePreset(null);
                  onSettingsChange({ fontSize: option.value });
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

        {/* Live Font Preview */}
        <View style={styles.fontPreview}>
          <ThemedText style={styles.fontPreviewLabel}>Preview</ThemedText>
          <View
            style={[
              styles.fontPreviewBox,
              settings.highContrast && styles.fontPreviewBoxHighContrast,
            ]}
          >
            <ThemedText
              style={[
                styles.fontPreviewText,
                { fontSize: FONT_SIZE_MAP[settings.fontSize] },
                settings.highContrast && styles.fontPreviewTextHighContrast,
              ]}
            >
              The quick brown fox jumps over the lazy dog
            </ThemedText>
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
            onValueChange={(value) => {
              setActivePreset(null);
              onSettingsChange({ highContrast: value });
            }}
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.highContrast ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle high contrast mode"
          />
        </View>
      </SettingsSection>

      {/* Captions Settings */}
      <SettingsSection
        title="Captions"
        icon="\uD83D\uDCAC"
        isExpanded={expandedSection === "captions"}
        onToggle={() => toggleSection("captions")}
      >
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Show Captions</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Display real-time text transcription
            </ThemedText>
          </View>
          <Switch
            value={settings.captionsEnabled}
            onValueChange={(value) => {
              setActivePreset(null);
              onSettingsChange({ captionsEnabled: value });
            }}
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.captionsEnabled ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle captions"
          />
        </View>
      </SettingsSection>

      {/* Text-to-Speech Settings */}
      <SettingsSection
        title="Text-to-Speech"
        icon="\uD83D\uDD0A"
        isExpanded={expandedSection === "tts"}
        onToggle={() => toggleSection("tts")}
      >
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Enable TTS</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Read transcribed text aloud
            </ThemedText>
          </View>
          <Switch
            value={settings.ttsEnabled}
            onValueChange={(value) => {
              setActivePreset(null);
              onSettingsChange({ ttsEnabled: value });
            }}
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
              <ThemedText style={styles.sliderLabel}>0.5x Slow</ThemedText>
              <ThemedText style={styles.sliderLabel}>2.0x Fast</ThemedText>
            </View>
          </View>
        )}
      </SettingsSection>

      {/* Sign Language Settings */}
      <SettingsSection
        title="Sign Language"
        icon="\uD83E\uDD1F"
        isExpanded={expandedSection === "sign"}
        onToggle={() => toggleSection("sign")}
      >
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Sign Detection</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Enable camera for sign language input
            </ThemedText>
          </View>
          <Switch
            value={settings.signLanguageEnabled}
            onValueChange={(value) => {
              setActivePreset(null);
              onSettingsChange({ signLanguageEnabled: value });
            }}
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.signLanguageEnabled ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle sign language detection"
          />
        </View>
      </SettingsSection>

      {/* Feedback Settings */}
      <SettingsSection
        title="Feedback"
        icon="\uD83D\uDCF3"
        isExpanded={expandedSection === "feedback"}
        onToggle={() => toggleSection("feedback")}
      >
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <ThemedText style={styles.settingLabel}>Haptic Feedback</ThemedText>
            <ThemedText style={styles.settingDescription}>
              Vibrate on new messages
            </ThemedText>
          </View>
          <Switch
            value={settings.hapticFeedback}
            onValueChange={(value) => {
              setActivePreset(null);
              onSettingsChange({ hapticFeedback: value });
            }}
            trackColor={{ false: "#767577", true: "#4A90D9" }}
            thumbColor={settings.hapticFeedback ? "#FFFFFF" : "#f4f3f4"}
            accessibilityLabel="Toggle haptic feedback"
          />
        </View>
      </SettingsSection>

      {/* Active Settings Summary */}
      <View style={styles.summarySection}>
        <ThemedText style={styles.summaryTitle}>Current Settings</ThemedText>
        <View style={styles.summaryChips}>
          <SettingChip
            label={`Font: ${settings.fontSize}`}
            active={true}
          />
          {settings.highContrast && (
            <SettingChip label="High Contrast" active={true} />
          )}
          {settings.captionsEnabled && (
            <SettingChip label="Captions" active={true} />
          )}
          {settings.ttsEnabled && (
            <SettingChip
              label={`TTS ${settings.ttsSpeed.toFixed(1)}x`}
              active={true}
            />
          )}
          {settings.signLanguageEnabled && (
            <SettingChip label="Sign Language" active={true} />
          )}
          {settings.hapticFeedback && (
            <SettingChip label="Haptic" active={true} />
          )}
        </View>
      </View>

      {/* Reset Button */}
      <Pressable
        style={({ pressed }) => [
          styles.resetButton,
          pressed && styles.resetButtonPressed,
        ]}
        onPress={() => {
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
        <ThemedText style={styles.resetButtonText}>
          Reset to Defaults
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

// Setting Chip for summary
function SettingChip({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={[styles.chip, active && styles.chipActive]}>
      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </ThemedText>
    </View>
  );
}

// Collapsible Settings Section with animated expand/collapse
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
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <ThemedView style={styles.section}>
      <Pressable
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && styles.sectionHeaderPressed,
        ]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${title} settings, ${isExpanded ? "expanded" : "collapsed"}`}
        accessibilityState={{ expanded: isExpanded }}
      >
        <ThemedText style={styles.sectionIcon}>{icon}</ThemedText>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ThemedText style={styles.expandIcon}>{"\u25B6"}</ThemedText>
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
    fontSize: 13,
    opacity: 0.6,
    marginBottom: 12,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  presetCard: {
    width: "48%",
    flexBasis: "47%",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "rgba(128, 128, 128, 0.06)",
    borderWidth: 2,
    borderColor: "transparent",
  },
  presetCardActive: {
    borderColor: "#4A90D9",
    backgroundColor: "rgba(74, 144, 217, 0.08)",
  },
  presetCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  presetIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  presetLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  presetLabelActive: {
    color: "#4A90D9",
  },
  presetDescription: {
    fontSize: 11,
    opacity: 0.6,
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
  sectionHeaderPressed: {
    opacity: 0.7,
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

  // Settings
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

  // Font Size
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

  // Font Preview
  fontPreview: {
    marginTop: 12,
    marginBottom: 4,
  },
  fontPreviewLabel: {
    fontSize: 11,
    opacity: 0.5,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fontPreviewBox: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: "rgba(128, 128, 128, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(128, 128, 128, 0.1)",
  },
  fontPreviewBoxHighContrast: {
    backgroundColor: "#000000",
    borderColor: "#FFFFFF",
  },
  fontPreviewText: {
    lineHeight: 28,
  },
  fontPreviewTextHighContrast: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  // Slider
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

  // Summary
  summarySection: {
    marginTop: 8,
    padding: 16,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.5,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  chipActive: {
    backgroundColor: "rgba(74, 144, 217, 0.12)",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.6,
  },
  chipTextActive: {
    color: "#4A90D9",
    opacity: 1,
  },

  // Reset
  resetButton: {
    marginTop: 16,
    marginBottom: 32,
    padding: 16,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 107, 0.1)",
  },
  resetButtonPressed: {
    opacity: 0.7,
  },
  resetButtonText: {
    color: "#FF6B6B",
    fontWeight: "600",
  },
});
