import { REACTION_EMOJI_MAP, ReactionType } from "@/types/feed";
import { StyleSheet, Text, View } from "react-native";

interface ReactionSummaryProps {
  reactionSummary: Record<string, number>;
  totalCount: number;
  mutedColor: string;
}

export function ReactionSummary({
  reactionSummary,
  totalCount,
  mutedColor,
}: ReactionSummaryProps) {
  if (totalCount === 0) return null;

  // Sort reactions by count, take top 3
  const sorted = Object.entries(reactionSummary)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sorted.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.emojis}>
        {sorted.map(([type]) => {
          const mapping = REACTION_EMOJI_MAP[type as ReactionType];
          if (!mapping) return null;
          return (
            <Text key={type} style={styles.emoji}>
              {mapping.emoji}
            </Text>
          );
        })}
      </View>
      <Text style={[styles.count, { color: mutedColor }]}>{totalCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  emojis: {
    flexDirection: "row",
    gap: 2,
  },
  emoji: {
    fontSize: 14,
  },
  count: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 2,
  },
});
