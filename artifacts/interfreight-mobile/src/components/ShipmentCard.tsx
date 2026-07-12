import React from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import type { Shipment } from "../types";
import { appPalette } from "../theme";

function shipmentIdentifier(shipment: Shipment) {
  const type = String(shipment.type || "").toUpperCase();
  if (type === "FCL") return shipment.containerNumber || shipment.ifsRef || "N/A";
  return shipment.blNumber || shipment.manifestNumber || shipment.ifsRef || "N/A";
}

function statusSection(shipment: Shipment) {
  const sourceSection = shipment.extraFields?.["Source Section"] || shipment.extraFields?.sourceSection;
  if (sourceSection) return sourceSection;
  return shipment.status || "Active";
}

export function ShipmentCard({
  shipment,
  onPress,
}: {
  shipment: Shipment;
  onPress?: () => void;
}) {
  const palette = appPalette(useColorScheme() === "dark");

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.eyebrow, { color: palette.accentSoft }]}>{String(shipment.type || "Shipment").toUpperCase()}</Text>
        <View style={[styles.statusPill, { backgroundColor: palette.accentTint }]}>
          <Text style={[styles.statusText, { color: palette.accentSoft }]}>{shipment.status || "N/A"}</Text>
        </View>
      </View>
      <Text style={[styles.identifier, { color: palette.text }]}>{shipmentIdentifier(shipment)}</Text>
      <Text style={[styles.section, { color: palette.textSoft }]}>{statusSection(shipment)}</Text>
      <View style={styles.grid}>
        <Info label="IFS Ref" value={shipment.ifsRef} palette={palette} />
        <Info label="MRA Ref" value={shipment.mraRef} palette={palette} />
        <Info label="Consignee" value={shipment.consignee} palette={palette} />
        <Info label="Shipper" value={shipment.shipper} palette={palette} />
        <Info label="Description" value={shipment.cargoDescription} palette={palette} />
        <Info label="Invoice" value={shipment.invoiceNo} palette={palette} />
      </View>
    </Pressable>
  );
}

function Info({ label, value, palette }: { label: string; value?: string | null; palette: ReturnType<typeof appPalette> }) {
  return (
    <View style={[styles.infoBox, { backgroundColor: palette.background, borderColor: palette.borderMuted }]}>
      <Text style={[styles.infoLabel, { color: palette.textSoft }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: palette.text }]}>{value && value.trim() ? value : "N/A"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#121a21",
    borderColor: "#22303d",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  eyebrow: {
    color: "#fb923c",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  statusPill: {
    backgroundColor: "rgba(249,115,22,0.18)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusText: {
    color: "#fdba74",
    fontSize: 12,
    fontWeight: "700",
  },
  identifier: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "800",
  },
  section: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  grid: {
    gap: 10,
  },
  infoBox: {
    backgroundColor: "#0f1419",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#1d2833",
  },
  infoLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
});
