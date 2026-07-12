export function appPalette(isDark: boolean) {
  return {
    background: isDark ? "#0f1419" : "#f4f6f8",
    surface: isDark ? "#121a21" : "#ffffff",
    surfaceMuted: isDark ? "#18222c" : "#eef2f6",
    border: isDark ? "#22303d" : "#d5dbe1",
    borderMuted: isDark ? "#1d2833" : "#e2e8f0",
    text: isDark ? "#f8fafc" : "#111827",
    textSoft: isDark ? "#94a3b8" : "#64748b",
    textMuted: isDark ? "#cbd5e1" : "#475569",
    accent: "#ea580c",
    accentSoft: isDark ? "#fb923c" : "#c2410c",
    accentTint: isDark ? "rgba(249,115,22,0.18)" : "rgba(234,88,12,0.12)",
  };
}
