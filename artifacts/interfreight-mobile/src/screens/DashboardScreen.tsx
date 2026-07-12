import React, { useMemo, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config";
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
  const isDark = useColorScheme() === "dark";
  const palette = appPalette(isDark);
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
              <Pressable onPress={signOut} style={[styles.logout, { backgroundColor: palette.surfaceMuted }]}>
                <Text style={[styles.logoutText, { color: palette.textMuted }]}>Log out</Text>
              </Pressable>
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
  content: { padding: 16, paddingBottom: 28 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  logo: { width: 42, height: 42 },
  eyebrow: { color: "#fb923c", fontSize: 11, fontWeight: "800", letterSpacing: 1.8, textTransform: "uppercase" },
  heading: { color: "#f8fafc", fontSize: 22, fontWeight: "800" },
  logout: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: "#18222c" },
  logoutText: { color: "#e2e8f0", fontWeight: "700" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: { flexGrow: 1, minWidth: "47%", backgroundColor: "#121a21", borderRadius: 18, borderWidth: 1, borderColor: "#22303d", padding: 14 },
  statLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  statValue: { color: "#f8fafc", fontSize: 24, fontWeight: "800", marginTop: 6 },
  search: {
    backgroundColor: "#121a21",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#22303d",
    color: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  loadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 36, gap: 12 },
  loadingText: { color: "#94a3b8", fontSize: 14 },
  emptyWrap: { backgroundColor: "#121a21", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#22303d", marginBottom: 8 },
  emptyTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "800", marginBottom: 4 },
  emptyText: { color: "#94a3b8", fontSize: 14 },
});
