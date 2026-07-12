import React, { useMemo, useState } from "react";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { AppSplash } from "./src/components/AppSplash";
import { LoginScreen } from "./src/screens/LoginScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ShipmentDetailScreen } from "./src/screens/ShipmentDetailScreen";

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient();

function AppNavigator() {
  const { token, loading } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!loading && token ? (
        <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="ShipmentDetail" component={ShipmentDetailScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

function AppShell() {
  const colorScheme = useColorScheme();
  const { loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  const isDark = colorScheme === "dark";

  const theme = useMemo(() => {
    const baseTheme = isDark ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: isDark ? "#0f1419" : "#f4f6f8",
        card: isDark ? "#121a21" : "#ffffff",
        text: isDark ? "#f5f7fa" : "#111827",
        border: isDark ? "#22303d" : "#d5dbe1",
        primary: "#f97316",
        notification: "#f97316",
      },
    };
  }, [isDark]);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={theme}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <AppNavigator />
      </NavigationContainer>
      {!splashDone ? <AppSplash appReady={!loading} onFinish={() => setSplashDone(true)} /> : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
