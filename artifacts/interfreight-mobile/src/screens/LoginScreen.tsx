import React, { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { APP_UPDATE_URL } from "../config";
import { LogoSpinner } from "../components/LogoSpinner";
import { appPalette } from "../theme";

const miniLogo = require("../assets/ifs-mini-logo.png");

export function LoginScreen() {
  const { signIn, loading } = useAuth();
  const palette = appPalette();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing details", "Please enter your email and password.");
      return;
    }
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert("Login failed", result.error || "Please try again.");
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Image source={miniLogo} style={styles.logo} resizeMode="contain" />
            <Text style={[styles.title, { color: palette.text }]}>InterFreightSolutions</Text>
            <Text style={[styles.subtitle, { color: palette.textSoft }]}>Secure customer tracking, built for quick mobile updates.</Text>
          </View>

          <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.label, { color: palette.textMuted }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@company.com"
              placeholderTextColor={palette.textSoft}
              style={[styles.input, { backgroundColor: palette.background, color: palette.text, borderColor: palette.borderMuted }]}
            />
            <Text style={[styles.label, { color: palette.textMuted }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
              placeholderTextColor={palette.textSoft}
              style={[styles.input, { backgroundColor: palette.background, color: palette.text, borderColor: palette.borderMuted }]}
            />

            <Pressable style={[styles.button, { backgroundColor: palette.accent }]} onPress={handleLogin} disabled={submitting || loading}>
              {submitting || loading ? <LogoSpinner size={20} /> : <Text style={styles.buttonText}>Sign In</Text>}
            </Pressable>

            <Pressable
              style={[styles.updateButton, { borderColor: palette.borderMuted, backgroundColor: palette.background }]}
              onPress={() => Linking.openURL(APP_UPDATE_URL)}
            >
              <Text style={[styles.updateButtonText, { color: palette.text }]}>Update App</Text>
            </Pressable>

            <Text style={[styles.note, { color: palette.textSoft }]}>The app keeps customers signed in on their own device so they can check updates quickly.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1419" },
  fill: { flex: 1 },
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 18, paddingVertical: 20, gap: 18 },
  hero: { alignItems: "center", gap: 8, marginBottom: 6 },
  logo: { width: 86, height: 86 },
  title: { color: "#111827", fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#64748b", fontSize: 13, lineHeight: 18, textAlign: "center", maxWidth: 300 },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d5dbe1",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  label: { color: "#475569", fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: "#f4f6f8",
    color: "#111827",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  updateButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  updateButtonText: { fontSize: 14, fontWeight: "800" },
  note: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: "center" },
});
