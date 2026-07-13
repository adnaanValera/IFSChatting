import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";

const fullLogo = require("../../assets/ifs-app-premium.png");

type AppSplashProps = {
  appReady: boolean;
  onFinish: () => void;
};

export function AppSplash({ appReady, onFinish }: AppSplashProps) {
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [minDurationElapsed, setMinDurationElapsed] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.96)).current;
  const wipeX = useRef(new Animated.Value(-240)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduceMotion);
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setMinDurationElapsed(true), reduceMotion ? 500 : 1400);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      wipeX.setValue(240);
      return;
    }

    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(wipeX, {
        toValue: 240,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, logoScale, reduceMotion, wipeX]);

  useEffect(() => {
    if (!appReady || !visible || !minDurationElapsed) return;

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

    const timer = setTimeout(startExit, reduceMotion ? 150 : 450);
    return () => clearTimeout(timer);
  }, [appReady, minDurationElapsed, onFinish, opacity, reduceMotion, visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <View style={styles.stage}>
        <View style={styles.logoWrap}>
          <Animated.Image
            source={fullLogo}
            resizeMode="contain"
            style={{
              width: Math.min(width * 0.78, 340),
              height: Math.min(width * 0.78, 340),
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            }}
          />
          {!reduceMotion && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.wipe,
                { transform: [{ translateX: wipeX }, { rotate: "-18deg" }] },
              ]}
            />
          )}
        </View>
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
  logoWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  wipe: {
    position: "absolute",
    width: 112,
    height: "130%",
    backgroundColor: "rgba(255,255,255,0.24)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.32,
    shadowRadius: 20,
  },
});
