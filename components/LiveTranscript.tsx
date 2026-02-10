/**
 * LiveTranscript - Real-time Caption Display
 * Person 1: Core UI and Real-Time Transcript Management
 *
 * Displays real-time captions for deaf users with speaker labels.
 * Supports auto-scrolling, speaker identification, and accessibility customization.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";

import { SpeakerLabel } from "@/components/SpeakerLabel";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAccessibility } from "@/state/AppContext";
import type {
    LiveTranscriptProps,
    SpeakerInfo,
    TranscriptSegment,
} from "@/types";

export function LiveTranscript({
  segments,
  speakers,
  autoScroll = true,
  maxSegments = 100,
}: LiveTranscriptProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const { settings } = useAccessibility();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Limit displayed segments for performance
  const displayedSegments = useMemo(() => {
    return segments.slice(-maxSegments);
  }, [segments, maxSegments]);

  // Group consecutive segments by speaker
  const groupedSegments = useMemo(() => {
    const groups: Array<{
      speakerId: string;
      segments: TranscriptSegment[];
    }> = [];

    displayedSegments.forEach((segment) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.speakerId === segment.speakerId) {
        lastGroup.segments.push(segment);
      } else {
        groups.push({
          speakerId: segment.speakerId,
          segments: [segment],
        });
      }
    });

    return groups;
  }, [displayedSegments]);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (autoScroll && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [segments.length, autoScroll]);

  // Fade in animation for new segments
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [segments.length, fadeAnim]);

  // Get font size based on accessibility settings
  const getFontSize = (): number => {
    switch (settings.fontSize) {
      case "small":
        return 14;
      case "medium":
        return 18;
      case "large":
        return 22;
      case "extra-large":
        return 28;
      default:
        return 18;
    }
  };

  // Get speaker info with fallback
  const getSpeakerInfo = (speakerId: string): SpeakerInfo => {
    return (
      speakers.get(speakerId) || {
        id: speakerId,
        name: `Speaker`,
        color: "#808080",
        isCurrentlySpeaking: false,
      }
    );
  };

  // Get source indicator icon
  const getSourceIcon = (source: TranscriptSegment["source"]): string => {
    switch (source) {
      case "speech":
        return "🎤";
      case "sign":
        return "🤟";
      case "text":
        return "⌨️";
      default:
        return "";
    }
  };

  if (displayedSegments.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyText}>
            Waiting for speech or sign language...
          </ThemedText>
          <ThemedText style={styles.emptySubtext}>
            Tap the record button to start capturing audio
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={[styles.container, settings.highContrast && styles.highContrast]}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {groupedSegments.map((group, groupIndex) => {
          const speaker = getSpeakerInfo(group.speakerId);
          const isLatestGroup = groupIndex === groupedSegments.length - 1;

          return (
            <Animated.View
              key={`${group.speakerId}-${groupIndex}`}
              style={[
                styles.segmentGroup,
                isLatestGroup && { opacity: fadeAnim },
              ]}
            >
              {/* Speaker Label */}
              <SpeakerLabel
                speaker={speaker}
                size={settings.fontSize === "extra-large" ? "large" : "medium"}
                showAvatar={true}
              />

              {/* Transcript Text */}
              <View style={styles.textContainer}>
                {group.segments.map((segment, segmentIndex) => (
                  <View key={segment.id} style={styles.segmentRow}>
                    {/* Source indicator */}
                    <ThemedText style={styles.sourceIcon}>
                      {getSourceIcon(segment.source)}
                    </ThemedText>

                    {/* Transcript text */}
                    <ThemedText
                      style={[
                        styles.transcriptText,
                        { fontSize: getFontSize() },
                        !segment.isFinal && styles.interimText,
                        settings.highContrast && styles.highContrastText,
                      ]}
                    >
                      {segment.text}
                    </ThemedText>

                    {/* Confidence indicator for non-final segments */}
                    {!segment.isFinal && (
                      <View style={styles.confidenceBar}>
                        <View
                          style={[
                            styles.confidenceFill,
                            { width: `${segment.confidence * 100}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* Timestamp */}
              <ThemedText style={styles.timestamp}>
                {formatTimestamp(group.segments[0].timestamp)}
              </ThemedText>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Live indicator */}
      {segments.some((s) => !s.isFinal) && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <ThemedText style={styles.liveText}>LIVE</ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

// Format timestamp to readable time
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  highContrast: {
    backgroundColor: "#000000",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
  },
  segmentGroup: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
  },
  textContainer: {
    marginTop: 8,
    marginLeft: 40, // Align with speaker label
  },
  segmentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  sourceIcon: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 2,
  },
  transcriptText: {
    flex: 1,
    lineHeight: 28,
  },
  interimText: {
    opacity: 0.7,
    fontStyle: "italic",
  },
  highContrastText: {
    color: "#FFFFFF",
  },
  confidenceBar: {
    width: 50,
    height: 4,
    backgroundColor: "rgba(128, 128, 128, 0.3)",
    borderRadius: 2,
    marginLeft: 8,
    marginTop: 8,
  },
  confidenceFill: {
    height: "100%",
    backgroundColor: "#50C878",
    borderRadius: 2,
  },
  timestamp: {
    fontSize: 10,
    opacity: 0.5,
    marginTop: 4,
    marginLeft: 40,
  },
  liveIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF0000",
    marginRight: 6,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#FF0000",
  },
});
