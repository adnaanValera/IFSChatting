import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  const palette = appPalette();
  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? { onPress, style: [styles.card, { backgroundColor: palette.surface, borderColor: palette.border }] as const }
    : { style: [styles.card, { backgroundColor: palette.surface, borderColor: palette.border }] as const };

  return (
    <Wrapper {...wrapperProps}>
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
    </Wrapper>
  );
}

function Info({ label, value, palette, wide = false }: { label: string; value?: string | null; palette: ReturnType<typeof appPalette>; wide?: boolean }) {
  return (
    <View style={[styles.infoBox, wide ? styles.infoBoxWide : styles.infoBoxHalf, { backgroundColor: palette.background, borderColor: palette.borderMuted }]}>
      <Text style={[styles.infoLabel, { color: palette.textSoft }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.infoValue, { color: palette.text }]}>{value && value.trim() ? value : "N/A"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#d5dbe1",
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    gap: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  eyebrow: {
    color: "#c2410c",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    flexShrink: 1,
  },
  statusPill: {
    backgroundColor: "rgba(234,88,12,0.12)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: "54%",
  },
  statusText: {
    color: "#c2410c",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  identifier: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  section: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  infoBox: {
    backgroundColor: "#f4f6f8",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoBoxHalf: {
    width: "48.5%",
  },
  infoBoxWide: {
    width: "100%",
  },
  infoLabel: {
    color: "#64748b",
    fontSize: 8,
    fontWeight: "700",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
});
