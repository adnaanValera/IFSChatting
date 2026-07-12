import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from "react-native";

const fullLogo = require("../../assets/interfreight-full-logo.png");

type AppSplashProps = {
  appReady: boolean;
  onFinish: () => void;
};

export function AppSplash({ appReady, onFinish }: AppSplashProps) {
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduceMotion);
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    if (!appReady || !visible) return;

    const startExit = () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduceMotion ? 180 : 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        onFinish();
      });
    };

    const timer = setTimeout(startExit, reduceMotion ? 150 : 900);
    return () => clearTimeout(timer);
  }, [appReady, onFinish, opacity, reduceMotion, visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <View style={styles.stage}>
        <Image
          source={fullLogo}
          resizeMode="contain"
          style={{ width: Math.min(width * 0.76, 360), height: Math.min(width * 0.2, 96) }}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    zIndex: 99,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
});
