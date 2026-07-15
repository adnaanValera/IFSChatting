import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ShipmentCard } from "../components/ShipmentCard";
import { appPalette } from "../theme";

export function ShipmentDetailScreen({ navigation, route }: any) {
  const shipment = route.params?.shipment;
  const palette = appPalette();

  if (!shipment || typeof shipment !== "object") {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <View style={styles.content}>
          <Pressable onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: palette.surfaceMuted }]}>
            <Text style={[styles.backText, { color: palette.textMuted }]}>Back</Text>
          </Pressable>
          <View style={[styles.note, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.heading, { color: palette.text }]}>Shipment unavailable</Text>
            <Text style={[styles.noteText, { color: palette.textMuted }]}>
              This shipment could not be opened. Please go back and try again.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
  content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24, gap: 14 },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2f6",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  backText: { color: "#475569", fontWeight: "700" },
  heading: { color: "#111827", fontSize: 22, fontWeight: "800" },
  subheading: { color: "#64748b", fontSize: 13, lineHeight: 19 },
  note: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d5dbe1",
    padding: 16,
  },
  noteTitle: { color: "#c2410c", fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 6 },
  noteText: { color: "#475569", fontSize: 14, lineHeight: 20 },
});
