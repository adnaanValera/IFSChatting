import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShipmentCard } from "../components/ShipmentCard";
import { appPalette } from "../theme";

export function ShipmentDetailScreen({ navigation, route }: any) {
  const shipment = route.params?.shipment;
  const palette = appPalette(useColorScheme() === "dark");

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.backText, { color: palette.textMuted }]}>Back</Text>
        </Pressable>
        <Text style={[styles.heading, { color: palette.text }]}>Shipment Details</Text>
        <Text style={[styles.subheading, { color: palette.textSoft }]}>A mobile-friendly view of the same tracking information your customer already sees on the website.</Text>
        <ShipmentCard shipment={shipment} />
        <View style={[styles.note, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.noteTitle, { color: palette.accentSoft }]}>Next step</Text>
          <Text style={[styles.noteText, { color: palette.textMuted }]}>
            We can wire in PDF download, announcements, and status-change notifications once you are ready for the next app pass.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1419" },
  content: { padding: 16, gap: 14 },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#18222c",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  backText: { color: "#e2e8f0", fontWeight: "700" },
  heading: { color: "#f8fafc", fontSize: 24, fontWeight: "800" },
  subheading: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  note: {
    backgroundColor: "#121a21",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#22303d",
    padding: 16,
  },
  noteTitle: { color: "#fb923c", fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 },
  noteText: { color: "#cbd5e1", fontSize: 14, lineHeight: 20 },
});
