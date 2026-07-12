import React, { useMemo, useState } from "react";
import { FlatList, Image, Linking, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, APP_UPDATE_URL } from "../config";
import type { Shipment } from "../types";
import { LogoSpinner } from "../components/LogoSpinner";
import { ShipmentCard } from "../components/ShipmentCard";
import { appPalette } from "../theme";

const miniLogo = require("../assets/ifs-mini-logo.png");

async function fetchShipments(token: string): Promise<Shipment[]> {
  const res = await fetch(`${API_BASE_URL}/api/shipments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Could not load shipments");
  return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
}

function activeSectionCount(shipments: Shipment[], label: string) {
  return shipments.filter((shipment) => {
    const source = String(shipment.extraFields?.["Source Section"] || shipment.extraFields?.sourceSection || "").toLowerCase();
    return source.includes(label.toLowerCase());
  }).length;
}

export function DashboardScreen({ navigation }: any) {
  const { token, user, signOut } = useAuth();
  const palette = appPalette();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-shipments", token],
    queryFn: () => fetchShipments(token!),
    enabled: !!token,
  });

  const shipments = data ?? [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return shipments;
    return shipments.filter((shipment) =>
      [
        shipment.ifsRef,
        shipment.containerNumber,
        shipment.blNumber,
        shipment.manifestNumber,
        shipment.consignee,
        shipment.shipper,
        shipment.cargoDescription,
        shipment.invoiceNo,
        shipment.status,
      ].some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [search, shipments]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.accent} />}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <Image source={miniLogo} style={styles.logo} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eyebrow, { color: palette.accentSoft }]}>Customer Dashboard</Text>
                  <Text style={[styles.heading, { color: palette.text }]}>Welcome, {user?.companyName || user?.fullName || "Customer"}</Text>
                </View>
              </View>
              <Pressable onPress={() => Linking.openURL(APP_UPDATE_URL)} style={[styles.updateBanner, { backgroundColor: palette.accent }]}>
                <Text style={styles.updateBannerText}>Update App</Text>
              </Pressable>
              <View style={styles.headerActions}>
                <Pressable onPress={signOut} style={[styles.logout, { backgroundColor: palette.surfaceMuted }]}>
                  <Text style={[styles.logoutText, { color: palette.textMuted }]}>Log out</Text>
                </Pressable>
              </View>
            </View>
            
            <View style={styles.updateHintWrap}>
              <Text style={[styles.updateHint, { color: palette.textSoft }]}>
                If something looks outdated, press Update App to install the latest build.
              </Text>
            </View>

            <View style={styles.statsRow}>
              <Stat label="Total" value={String(shipments.length)} palette={palette} />
              <Stat label="On Sea" value={String(activeSectionCount(shipments, "SHIPMENTS ON SEA"))} palette={palette} />
              <Stat label="Enroute" value={String(activeSectionCount(shipments, "SHIPMENTS ENROUTE"))} palette={palette} />
              <Stat label="Malawi" value={String(activeSectionCount(shipments, "SHIPMENTS IN MALAWI"))} palette={palette} />
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search container, BL, invoice, consignee..."
              placeholderTextColor={palette.textSoft}
              style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
            />

            {isLoading ? (
              <View style={styles.loadingWrap}>
                <LogoSpinner size={56} />
                <Text style={[styles.loadingText, { color: palette.textSoft }]}>Loading your consignments...</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={[styles.emptyWrap, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.emptyTitle, { color: palette.text }]}>No matching consignments</Text>
                <Text style={[styles.emptyText, { color: palette.textSoft }]}>Try a different search, or pull down to refresh.</Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <ShipmentCard shipment={item} onPress={() => navigation.navigate("ShipmentDetail", { shipment: item })} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, palette }: { label: string; value: string; palette: ReturnType<typeof appPalette> }) {
  return (
    <View style={[styles.statCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.statLabel, { color: palette.textSoft }]}>{label}</Text>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1419" },
  content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 28 },
  header: { gap: 12, marginBottom: 16 },
  brandRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  headerActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  logo: { width: 38, height: 38, marginTop: 2 },
  eyebrow: { color: "#c2410c", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  heading: { color: "#111827", fontSize: 20, fontWeight: "800", lineHeight: 26 },
  updateBanner: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  updateBannerText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  logout: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: "#18222c" },
  logoutText: { color: "#e2e8f0", fontWeight: "700" },
  updateHintWrap: { marginTop: -4, marginBottom: 14 },
  updateHint: { fontSize: 12, lineHeight: 17 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statCard: { flexGrow: 1, minWidth: "47%", backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#d5dbe1", padding: 12 },
  statLabel: { color: "#64748b", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  statValue: { color: "#111827", fontSize: 21, fontWeight: "800", marginTop: 4 },
  search: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d5dbe1",
    color: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 16,
  },
  loadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 36, gap: 12 },
  loadingText: { color: "#64748b", fontSize: 14 },
  emptyWrap: { backgroundColor: "#ffffff", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#d5dbe1", marginBottom: 8 },
  emptyTitle: { color: "#111827", fontSize: 18, fontWeight: "800", marginBottom: 4 },
  emptyText: { color: "#64748b", fontSize: 14 },
});
