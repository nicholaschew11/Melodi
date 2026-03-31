import { SpotifyEmbed } from "@/components/feed/SpotifyEmbed";
import { ThemedText } from "@/components/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

interface DiscoveryPost {
  post_id: number;
  user_id: string;
  content: string;
  like_count: number;
  created_at: string;
  reaction_summary?: Record<string, number>;
  users: {
    id: string;
    username: string;
    display_name: string | null;
  };
  songs: {
    song_id: string;
    spotify_id: string;
    song_name: string;
    artist_name: string;
    album_name: string | null;
    cover_art_url: string | null;
  } | null;
  connectedVia: {
    id: string;
    username: string;
  } | null;
}

interface DiscoveryCardProps {
  post: DiscoveryPost;
  onSave: (postId: number) => void;
  onDismiss: (postId: number) => void;
}

const SWIPE_THRESHOLD = 120;

export function DiscoveryCard({ post, onSave, onDismiss }: DiscoveryCardProps) {
  const primaryColor = useThemeColor({}, "primary");
  const surfaceColor = useThemeColor({}, "surface");
  const mutedColor = useThemeColor({}, "textMuted");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "border");
  const successColor = "#33D772";
  const dangerColor = "#EF4444";

  const translateX = useSharedValue(0);
  const cardOpacity = useSharedValue(1);

  const handleSave = () => {
    onSave(post.post_id);
  };

  const handleDismiss = () => {
    onDismiss(post.post_id);
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        // Swipe right = save
        translateX.value = withTiming(400, { duration: 200 });
        cardOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(handleSave)();
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        // Swipe left = dismiss
        translateX.value = withTiming(-400, { duration: 200 });
        cardOpacity.value = withTiming(0, { duration: 200 });
        runOnJS(handleDismiss)();
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${interpolate(translateX.value, [-300, 0, 300], [-15, 0, 15])}deg` },
    ],
    opacity: cardOpacity.value,
  }));

  const saveIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1]),
  }));

  const dismissIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1]),
  }));

  return (
    <View style={styles.wrapper}>
      {/* Save indicator (right swipe) */}
      <Animated.View style={[styles.indicator, styles.saveIndicator, saveIndicatorStyle]}>
        <IconSymbol name="heart.fill" size={32} color={successColor} />
        <ThemedText style={[styles.indicatorText, { color: successColor }]}>SAVE</ThemedText>
      </Animated.View>

      {/* Dismiss indicator (left swipe) */}
      <Animated.View style={[styles.indicator, styles.dismissIndicator, dismissIndicatorStyle]}>
        <IconSymbol name="xmark" size={32} color={dangerColor} />
        <ThemedText style={[styles.indicatorText, { color: dangerColor }]}>SKIP</ThemedText>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: surfaceColor, borderColor },
            cardStyle,
          ]}
        >
          {/* Attribution */}
          {post.connectedVia && (
            <View style={styles.attribution}>
              <IconSymbol name="link" size={14} color={primaryColor} />
              <ThemedText style={[styles.attributionText, { color: mutedColor }]}>
                Connected through{" "}
                <ThemedText
                  style={[styles.attributionUsername, { color: primaryColor }]}
                  onPress={() => router.push(`/profile/${post.connectedVia!.id}`)}
                >
                  @{post.connectedVia.username}
                </ThemedText>
              </ThemedText>
            </View>
          )}

          {/* Poster info */}
          <TouchableOpacity
            style={styles.posterInfo}
            onPress={() => router.push(`/profile/${post.users.id}`)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatar, { backgroundColor: primaryColor + "20" }]}>
              <IconSymbol name="person.fill" size={20} color={primaryColor} />
            </View>
            <View>
              <ThemedText style={styles.posterName}>
                {post.users.display_name || post.users.username}
              </ThemedText>
              <ThemedText style={[styles.posterUsername, { color: mutedColor }]}>
                @{post.users.username}
              </ThemedText>
            </View>
          </TouchableOpacity>

          {/* Song embed */}
          {post.songs?.spotify_id && (
            <SpotifyEmbed trackId={post.songs.spotify_id} />
          )}

          {/* Content */}
          {post.content && (
            <ThemedText style={styles.content} numberOfLines={3}>
              {post.content}
            </ThemedText>
          )}

          {/* Swipe hint */}
          <View style={styles.swipeHint}>
            <ThemedText style={[styles.swipeHintText, { color: mutedColor }]}>
              Swipe right to save, left to skip
            </ThemedText>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  indicator: {
    position: "absolute",
    alignItems: "center",
    gap: 4,
    zIndex: 0,
  },
  saveIndicator: {
    right: 40,
  },
  dismissIndicator: {
    left: 40,
  },
  indicatorText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
  },
  card: {
    width: "90%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 1,
  },
  attribution: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  attributionText: {
    fontSize: 13,
  },
  attributionUsername: {
    fontWeight: "600",
  },
  posterInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  posterName: {
    fontSize: 16,
    fontWeight: "600",
  },
  posterUsername: {
    fontSize: 13,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  swipeHint: {
    marginTop: 20,
    alignItems: "center",
  },
  swipeHintText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
