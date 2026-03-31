import { ThemedText } from "@/components/themed-text";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface CompatibilityBadgeProps {
  score: number; // 0-100
  size?: "small" | "large";
}

function getScoreColor(score: number): string {
  if (score >= 70) return "#33D772"; // green
  if (score >= 40) return "#F59E0B"; // yellow
  return "#EF4444"; // red
}

function getScoreLabel(score: number): string {
  if (score >= 85) return "Soulmates";
  if (score >= 70) return "Great match";
  if (score >= 55) return "Good vibes";
  if (score >= 40) return "Some overlap";
  return "Different tastes";
}

export function CompatibilityBadge({ score, size = "large" }: CompatibilityBadgeProps) {
  const animatedScore = useSharedValue(0);
  const color = getScoreColor(score);
  const isSmall = size === "small";

  useEffect(() => {
    animatedScore.value = withTiming(score, {
      duration: 1000,
      easing: Easing.out(Easing.cubic),
    });
  }, [score]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(1, { duration: 500 }),
  }));

  if (isSmall) {
    return (
      <View style={[styles.smallContainer, { borderColor: color + "60", backgroundColor: color + "15" }]}>
        <ThemedText style={[styles.smallScore, { color }]}>
          {score}%
        </ThemedText>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View
        style={[
          styles.circle,
          {
            borderColor: color + "60",
            backgroundColor: color + "10",
          },
        ]}
      >
        <ThemedText style={[styles.scoreText, { color }]}>
          {score}%
        </ThemedText>
        <ThemedText style={[styles.matchLabel, { color: color + "CC" }]}>
          match
        </ThemedText>
      </View>
      <ThemedText style={[styles.label, { color: color }]}>
        {getScoreLabel(score)}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 6,
  },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  matchLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: -2,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  smallContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  smallScore: {
    fontSize: 11,
    fontWeight: "700",
  },
});
