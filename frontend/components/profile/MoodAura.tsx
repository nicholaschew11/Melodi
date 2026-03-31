import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";

interface MoodAuraProps {
  valence: number | null; // -1 to 1
  arousal: number | null; // -1 to 1
  style?: ViewStyle;
  children: React.ReactNode;
}

// Map valence/arousal to a color with smooth interpolation
function getMoodColors(valence: number, arousal: number): { primary: string; secondary: string } {
  // Normalize to 0-1 range
  const v = (valence + 1) / 2; // 0 = negative, 1 = positive
  const a = (arousal + 1) / 2; // 0 = calm, 1 = energetic

  // Four quadrant colors
  const energeticHappy = { r: 255, g: 140, b: 0 };   // #FF8C00 warm orange
  const peacefulHappy = { r: 72, g: 187, b: 120 };    // #48BB78 soft green
  const intenseSad = { r: 128, g: 90, b: 213 };       // #805AD5 deep purple
  const melancholicSad = { r: 45, g: 55, b: 72 };     // #2D3748 dark blue-gray

  // Bilinear interpolation between quadrants
  const topColor = {
    r: peacefulHappy.r + (energeticHappy.r - peacefulHappy.r) * a,
    g: peacefulHappy.g + (energeticHappy.g - peacefulHappy.g) * a,
    b: peacefulHappy.b + (energeticHappy.b - peacefulHappy.b) * a,
  };

  const bottomColor = {
    r: melancholicSad.r + (intenseSad.r - melancholicSad.r) * a,
    g: melancholicSad.g + (intenseSad.g - melancholicSad.g) * a,
    b: melancholicSad.b + (intenseSad.b - melancholicSad.b) * a,
  };

  const primary = {
    r: Math.round(bottomColor.r + (topColor.r - bottomColor.r) * v),
    g: Math.round(bottomColor.g + (topColor.g - bottomColor.g) * v),
    b: Math.round(bottomColor.b + (topColor.b - bottomColor.b) * v),
  };

  // Secondary is a lighter/shifted variant
  const secondary = {
    r: Math.min(255, primary.r + 40),
    g: Math.min(255, primary.g + 30),
    b: Math.min(255, primary.b + 50),
  };

  return {
    primary: `rgb(${primary.r}, ${primary.g}, ${primary.b})`,
    secondary: `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`,
  };
}

export function MoodAura({ valence, arousal, style, children }: MoodAuraProps) {
  const pulseAnim = useSharedValue(0);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sine) }),
      -1,
      true
    );
  }, []);

  const animatedGlow = useAnimatedStyle(() => {
    const opacity = interpolate(pulseAnim.value, [0, 1], [0.08, 0.15]);
    return { opacity };
  });

  if (valence === null || arousal === null) {
    return <View style={style}>{children}</View>;
  }

  const colors = getMoodColors(valence, arousal);

  return (
    <View style={[styles.wrapper, style]}>
      {/* Top glow */}
      <Animated.View
        style={[
          styles.glowTop,
          { backgroundColor: colors.primary },
          animatedGlow,
        ]}
      />
      {/* Bottom glow */}
      <Animated.View
        style={[
          styles.glowBottom,
          { backgroundColor: colors.secondary },
          animatedGlow,
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    overflow: "hidden",
  },
  glowTop: {
    position: "absolute",
    top: -20,
    left: -20,
    right: -20,
    height: 160,
    borderRadius: 80,
  },
  glowBottom: {
    position: "absolute",
    bottom: -20,
    left: -20,
    right: -20,
    height: 120,
    borderRadius: 60,
  },
});
