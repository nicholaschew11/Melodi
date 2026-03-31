import { REACTION_EMOJI_MAP, ReactionType } from "@/types/feed";
import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from "react-native-reanimated";

interface ReactionPickerProps {
  visible: boolean;
  currentReaction: ReactionType | null;
  onSelect: (type: ReactionType) => void;
  onClose: () => void;
  surfaceColor: string;
  borderColor: string;
}

const REACTION_TYPES = Object.keys(REACTION_EMOJI_MAP) as ReactionType[];

export function ReactionPicker({
  visible,
  currentReaction,
  onSelect,
  onClose,
  surfaceColor,
  borderColor,
}: ReactionPickerProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withSpring(1, { damping: 20 });
      scale.value = withSpring(1, { damping: 15, stiffness: 200 });
    } else {
      opacity.value = withSpring(0, { damping: 20 });
      scale.value = withSpring(0, { damping: 15 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: surfaceColor, borderColor },
          animatedStyle,
        ]}
      >
        {REACTION_TYPES.map((type, index) => {
          const { emoji, label } = REACTION_EMOJI_MAP[type];
          const isActive = currentReaction === type;

          return (
            <TouchableOpacity
              key={type}
              style={[
                styles.reactionButton,
                isActive && styles.activeReaction,
              ]}
              onPress={() => onSelect(type)}
              activeOpacity={0.7}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              <Text style={[styles.label, isActive && styles.activeLabel]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  container: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  reactionButton: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  activeReaction: {
    backgroundColor: "rgba(121, 150, 165, 0.2)",
  },
  emoji: {
    fontSize: 26,
  },
  label: {
    fontSize: 9,
    color: "#9CA3AF",
    marginTop: 2,
    textAlign: "center",
  },
  activeLabel: {
    color: "#7996A5",
    fontWeight: "600",
  },
});
