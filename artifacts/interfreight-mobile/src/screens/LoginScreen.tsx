import React, { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { LogoSpinner } from "../components/LogoSpinner";

const miniLogo = require("../assets/ifs-mini-logo.png");

export function LoginScreen() {
  const { signIn, loading } = useAuth();
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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.container}>
          <View style={styles.hero}>
            <Image source={miniLogo} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>InterFreightSolutions</Text>
            <Text style={styles.subtitle}>Secure customer tracking, built for quick mobile updates.</Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@company.com"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
              placeholderTextColor="#64748b"
              style={styles.input}
            />

            <Pressable style={styles.button} onPress={handleLogin} disabled={submitting || loading}>
              {submitting || loading ? <LogoSpinner size={20} /> : <Text style={styles.buttonText}>Sign In</Text>}
            </Pressable>

            <Text style={styles.note}>The app keeps customers signed in on their own device so they can check updates quickly.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1419" },
  fill: { flex: 1 },
  container: { flex: 1, justifyContent: "center", padding: 20, gap: 20 },
  hero: { alignItems: "center", gap: 10, marginBottom: 8 },
  logo: { width: 88, height: 88 },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#94a3b8", fontSize: 14, textAlign: "center", maxWidth: 280 },
  panel: {
    backgroundColor: "#121a21",
    borderColor: "#22303d",
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  label: { color: "#cbd5e1", fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: "#0b1116",
    color: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  button: {
    marginTop: 8,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  note: { color: "#94a3b8", fontSize: 12, lineHeight: 18, marginTop: 6 },
});
