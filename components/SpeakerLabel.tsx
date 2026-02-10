/**
 * SpeakerLabel - Speaker Identification Component
 * Person 1: Core UI and Real-Time Transcript Management
 *
 * Displays speaker identification with color coding and speaking indicator.
 * Integrates with real-time captions to show who is speaking.
 */

import React from "react";
import { Animated, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import type { SpeakerLabelProps } from "@/types";

export function SpeakerLabel({
  speaker,
  size = "medium",
  showAvatar = true,
}: SpeakerLabelProps) {
  // Get size styles
  const sizeStyles = getSizeStyles(size);

  // Get initials from speaker name
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View style={styles.container}>
      {/* Avatar / Color indicator */}
      {showAvatar && (
        <View
          style={[
            styles.avatar,
            sizeStyles.avatar,
            { backgroundColor: speaker.color },
          ]}
        >
          <ThemedText style={[styles.initials, sizeStyles.initials]}>
            {getInitials(speaker.name)}
          </ThemedText>

          {/* Speaking Indicator */}
          {speaker.isCurrentlySpeaking && (
            <SpeakingIndicator color={speaker.color} />
          )}
        </View>
      )}

      {/* Speaker Name */}
      <View style={styles.nameContainer}>
        <ThemedText
          style={[styles.name, sizeStyles.name, { color: speaker.color }]}
        >
          {speaker.name}
        </ThemedText>

        {/* Speaking status text */}
        {speaker.isCurrentlySpeaking && (
          <ThemedText style={styles.speakingText}>speaking...</ThemedText>
        )}
      </View>
    </View>
  );
}

// Animated speaking indicator
function SpeakingIndicator({ color }: { color: string }) {
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.speakingIndicator,
        {
          borderColor: color,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    />
  );
}

// Get size-specific styles
function getSizeStyles(size: "small" | "medium" | "large") {
  switch (size) {
    case "small":
      return {
        avatar: { width: 24, height: 24, borderRadius: 12 },
        initials: { fontSize: 10 },
        name: { fontSize: 12 },
      };
    case "large":
      return {
        avatar: { width: 48, height: 48, borderRadius: 24 },
        initials: { fontSize: 18 },
        name: { fontSize: 18 },
      };
    case "medium":
    default:
      return {
        avatar: { width: 32, height: 32, borderRadius: 16 },
        initials: { fontSize: 12 },
        name: { fontSize: 14 },
      };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    position: "relative",
  },
  initials: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  speakingIndicator: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 50,
    borderWidth: 2,
    opacity: 0.5,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    fontWeight: "600",
  },
  speakingText: {
    fontSize: 10,
    opacity: 0.6,
    marginLeft: 8,
    fontStyle: "italic",
  },
});
