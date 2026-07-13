import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config";
import type { Shipment } from "../types";
import { ShipmentCard } from "../components/ShipmentCard";
import { appPalette } from "../theme";

const topLogo = require("../assets/ifs-app-premium.png");

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
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introScale = useRef(new Animated.Value(1.14)).current;
  const introTranslateX = useRef(new Animated.Value(88)).current;
  const introTranslateY = useRef(new Animated.Value(188)).current;
  const wipeX = useRef(new Animated.Value(-120)).current;
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(introOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(introScale, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(wipeX, {
          toValue: 120,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(introTranslateX, {
          toValue: 0,
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(introTranslateY, {
          toValue: 0,
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(introScale, {
          toValue: 0.28,
          duration: 820,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(introOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => setShowIntro(false));
  }, [introOpacity, introScale, introTranslateX, introTranslateY, wipeX]);

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
      {showIntro && (
        <Animated.View pointerEvents="none" style={[styles.introOverlay, { opacity: introOpacity }]}>
          <View style={styles.introStage}>
            <Animated.Image
              source={topLogo}
              resizeMode="cover"
              style={[
                styles.introLogo,
                {
                  transform: [
                    { translateX: introTranslateX },
                    { translateY: introTranslateY },
                    { scale: introScale },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.introWipe,
                { transform: [{ translateX: wipeX }, { rotate: "-16deg" }] },
              ]}
            />
          </View>
        </Animated.View>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={palette.accent} />}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.brandRow}>
                <View style={styles.logoSlot}>
                  <Image source={topLogo} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eyebrow, { color: palette.accentSoft }]}>My Tracking</Text>
                  <Text style={[styles.heading, { color: palette.text }]}>Welcome, {user?.companyName || user?.fullName || "Customer"}</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={signOut} style={[styles.logout, { backgroundColor: palette.surfaceMuted }]}>
                  <Text style={[styles.logoutText, { color: palette.textMuted }]}>Log out</Text>
                </Pressable>
              </View>
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
  introOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    backgroundColor: "#ffffff",
  },
  introStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  introLogo: {
    width: 180,
    height: 180,
    borderRadius: 34,
  },
  introWipe: {
    position: "absolute",
    width: 96,
    height: 260,
    backgroundColor: "rgba(255,255,255,0.24)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  header: { gap: 12, marginBottom: 16 },
  brandRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  logoSlot: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(213,219,225,0.95)",
    backgroundColor: "#ffffff",
  },
  headerActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  eyebrow: { color: "#c2410c", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  heading: { color: "#111827", fontSize: 20, fontWeight: "800", lineHeight: 26 },
  logout: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: "#18222c" },
  logoutText: { color: "#e2e8f0", fontWeight: "700" },
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
  loadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 8 },
  loadingText: { color: "#64748b", fontSize: 14 },
  emptyWrap: { backgroundColor: "#ffffff", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#d5dbe1", marginBottom: 8 },
  emptyTitle: { color: "#111827", fontSize: 18, fontWeight: "800", marginBottom: 4 },
  emptyText: { color: "#64748b", fontSize: 14 },
});
