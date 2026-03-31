/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

export const palette = {
  // Brand Colors
  brandPrimary: "#7996A5",
  brandPrimaryDark: "#124B67",
  brandSecondary: "#092838",
  brandAccent: "#9DBBBC",
  danger: "#c32323ff",
  success: "#33d772ff",
  warning: "#F59E0B",

  light: {
    background: "#fffefe", // Off-white background
    surface: "#ebebebff", // Very light gray
    surfaceElevated: "#FFFFFF", // White elevated surfaces
    text: "#111827", // Almost black for high contrast
    textMuted: "#6B7280", // Medium gray
    border: "#bcbcbcff", // Light gray border
    icon: "#9DBBBC", // Purple icons
    shadow: "rgba(0, 0, 0, 0.1)",
  },
  dark: {
    background: "#0A1420", // Deep navy blue - sleek dark
    surface: "#132030", // Slightly lighter navy
    surfaceElevated: "#1A2838", // Elevated navy blue
    text: "#E8F4F8", // Soft white with blue tint
    textMuted: "#7996A5", // Brand primary color for muted text
    border: "#1A2838", // Subtle navy border
    icon: "#9DBBBC", // Brand accent for icons
    shadow: "rgba(0, 0, 0, 0.6)",
  },
};

export const Colors = {
  light: {
    text: palette.light.text,
    textMuted: palette.light.textMuted,
    background: palette.light.background,
    surface: palette.light.surface,
    surfaceElevated: palette.light.surfaceElevated,
    border: palette.light.border,
    tint: palette.brandPrimary,
    primary: palette.brandPrimary,
    primaryMuted: "#EDE9FE",
    secondary: palette.brandSecondary,
    accent: palette.brandAccent,
    success: palette.success,
    danger: palette.danger,
    warning: palette.warning,
    icon: palette.light.icon,
    shadow: palette.light.shadow,
    inputBackground: "#F9FAFB", // Light gray
    inputBorder: "#D1D5DB", // Gray 300
    tabIconDefault: palette.light.textMuted,
    tabIconSelected: palette.brandPrimary,
  },
  dark: {
    text: "#E8F4F8", // Soft white with blue tint
    textMuted: "#7996A5", // Brand primary - muted blue
    background: "#0A1420", // Deep navy blue
    surface: "#132030", // Slightly lighter navy
    surfaceElevated: "#1A2838", // Elevated navy
    border: "#1A2838", // Subtle navy border
    tint: "#9DBBBC", // Brand accent - muted teal
    primary: "#7996A5", // Brand primary - muted blue
    primaryMuted: "#124B67", // Deeper brand blue
    secondary: "#9DBBBC", // Brand accent - muted teal
    accent: "#B8D4DE", // Lighter teal for highlights
    success: "#33d772ff",
    danger: "#c32323ff",
    warning: "#F59E0B",
    icon: "#9DBBBC", // Brand accent
    shadow: "rgba(0, 0, 0, 0.6)",
    inputBackground: "#132030", // Navy surface
    inputBorder: "#1A2838", // Subtle border
    tabIconDefault: "#7996A5", // Brand primary
    tabIconSelected: "#9DBBBC", // Brand accent
  },
};

export const API = {
  BACKEND_URL:
    process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000",
};

export const SUPABASE = {
  URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
