import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Shipment } from "../types";

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
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.eyebrow}>{String(shipment.type || "Shipment").toUpperCase()}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{shipment.status || "N/A"}</Text>
        </View>
      </View>
      <Text style={styles.identifier}>{shipmentIdentifier(shipment)}</Text>
      <Text style={styles.section}>{statusSection(shipment)}</Text>
      <View style={styles.grid}>
        <Info label="IFS Ref" value={shipment.ifsRef} />
        <Info label="MRA Ref" value={shipment.mraRef} />
        <Info label="Consignee" value={shipment.consignee} />
        <Info label="Shipper" value={shipment.shipper} />
        <Info label="Description" value={shipment.cargoDescription} />
        <Info label="Invoice" value={shipment.invoiceNo} />
      </View>
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value && value.trim() ? value : "N/A"}</Text>
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
