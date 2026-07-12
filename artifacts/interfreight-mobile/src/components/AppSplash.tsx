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
    ]).start();

    Animated.timing(wipeTranslate, {
      toValue: 1,
      duration: 1200,
      delay: 420,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [logoOpacity, logoScale, reduceMotion, wipeTranslate]);

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
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  wipe: {
    position: "absolute",
    top: -16,
    bottom: -16,
    width: 120,
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: "#ffffff",
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
});
