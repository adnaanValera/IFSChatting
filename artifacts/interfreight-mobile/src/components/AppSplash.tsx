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
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const wipeTranslate = useRef(new Animated.Value(-1)).current;
  const logoGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduceMotion);
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      wipeTranslate.setValue(1);
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
        duration: 360,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(logoGlow, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(logoGlow, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    ]).start();

    Animated.timing(wipeTranslate, {
      toValue: 1,
      duration: 1200,
      delay: 420,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [logoGlow, logoOpacity, logoScale, reduceMotion, wipeTranslate]);

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

    const timer = setTimeout(startExit, reduceMotion ? 150 : 3000);
    return () => clearTimeout(timer);
  }, [appReady, onFinish, opacity, reduceMotion, visible]);

  if (!visible) return null;

  const wipeTranslateX = wipeTranslate.interpolate({
    inputRange: [-1, 1],
    outputRange: [-width * 1.2, width * 1.2],
  });
  const logoShadowOpacity = logoGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.34],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <View style={styles.stage}>
        <View style={styles.logoFrame}>
          <Animated.Image
            source={fullLogo}
            resizeMode="contain"
            style={{
              width: Math.min(width * 0.76, 360),
              height: Math.min(width * 0.2, 96),
              opacity: logoOpacity,
              shadowColor: "#ffffff",
              shadowOpacity: logoShadowOpacity,
              shadowRadius: 18,
              transform: [{ scale: logoScale }],
            }}
          />
          {!reduceMotion ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.wipe,
                {
                  transform: [{ translateX: wipeTranslateX }, { rotate: "-8deg" }],
                },
              ]}
            />
          ) : null}
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
  logoFrame: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  wipe: {
    position: "absolute",
    top: -10,
    bottom: -10,
    width: 72,
    backgroundColor: "rgba(255,255,255,0.72)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
});
