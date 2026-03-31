import { ThemedText } from "@/components/themed-text";
import { StyleSheet, View } from "react-native";

interface TasteDNAProps {
  genreDistribution: Record<string, number>;
  mutedColor: string;
  primaryColor: string;
}

const GENRE_COLORS = [
  "#7996A5", // primary blue
  "#9DBBBC", // accent teal
  "#E53E3E", // red
  "#F59E0B", // amber
  "#33D772", // green
  "#805AD5", // purple
  "#ED64A6", // pink
  "#38B2AC", // teal
  "#DD6B20", // orange
  "#3182CE", // blue
];

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function TasteDNA({ genreDistribution, mutedColor, primaryColor }: TasteDNAProps) {
  const entries = Object.entries(genreDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.title}>Music DNA</ThemedText>
        <ThemedText style={[styles.emptyText, { color: mutedColor }]}>
          Share more music to build your taste profile
        </ThemedText>
      </View>
    );
  }

  const maxValue = entries[0][1];

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>Music DNA</ThemedText>
      <View style={styles.barsContainer}>
        {entries.map(([genre, value], index) => {
          const color = GENRE_COLORS[index % GENRE_COLORS.length];
          const widthPercent = Math.max((value / maxValue) * 100, 15);
          const displayPercent = Math.round(value * 100);

          return (
            <View key={genre} style={styles.barRow}>
              <ThemedText style={[styles.genreLabel, { color: mutedColor }]} numberOfLines={1}>
                {capitalizeFirst(genre)}
              </ThemedText>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${widthPercent}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
              <ThemedText style={[styles.percentLabel, { color: mutedColor }]}>
                {displayPercent}%
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  barsContainer: {
    gap: 10,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  genreLabel: {
    width: 80,
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(150, 150, 150, 0.1)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  percentLabel: {
    width: 35,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
  },
});
