import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
} from "react-native";

const fullLogo = require("../../assets/interfreight-full-logo.png");
const darkIcon = require("../../assets/ifs-mini-logo.png");
const lightIcon = require("../../assets/ifs-white-logo.png");

const ICON_BASE_SIZE = 1024;
const FULL_FADE_MS = 300;
const FULL_HOLD_MS = 500;
const MORPH_MS = 1200;
const MAP_FADE_MS = 500;
const VEHICLE_MS = 800;
const BLACK_TRANSITION_MS = 800;
const EXIT_MS = 400;
const SPIN_DURATION_MS = 1500;
const INITIAL_SPIN_HOLD_MS = 1500;
const SHINE_LOOP_MS = 3000;

type AppSplashProps = {
  appReady: boolean;
  onFinish: () => void;
};

type CropBoxProps = {
  source: ImageSourcePropType;
  frame: { x: number; y: number; width: number; height: number };
  size: number;
  imageStyle?: StyleProp<ImageStyle>;
};

function CropBox({ source, frame, size, imageStyle }: CropBoxProps) {
  const scale = size / ICON_BASE_SIZE;
  return (
    <View
      style={[
        styles.cropFrame,
        {
          left: frame.x * scale,
          top: frame.y * scale,
          width: frame.width * scale,
          height: frame.height * scale,
        },
      ]}
    >
      <Animated.Image
        source={source}
        resizeMode="stretch"
        style={[
          {
            position: "absolute",
            left: -frame.x * scale,
            top: -frame.y * scale,
            width: size,
            height: size,
          },
          imageStyle,
        ]}
      />
    </View>
  );
}

export function AppSplash({ appReady, onFinish }: AppSplashProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [allowExit, setAllowExit] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const fullOpacity = useRef(new Animated.Value(0)).current;
  const fullScale = useRef(new Animated.Value(0.95)).current;
  const fullExitOpacity = useRef(new Animated.Value(1)).current;
  const fullExitScale = useRef(new Animated.Value(1)).current;
  const whiteOpacity = useRef(new Animated.Value(0)).current;
  const whiteScale = useRef(new Animated.Value(0.88)).current;
  const blackOpacity = useRef(new Animated.Value(0)).current;
  const blackScale = useRef(new Animated.Value(0.98)).current;
  const stageOpacity = useRef(new Animated.Value(1)).current;
  const mapOpacity = useRef(new Animated.Value(0)).current;
  const shipTranslate = useRef(new Animated.Value(62)).current;
  const shipOpacity = useRef(new Animated.Value(0)).current;
  const truckTranslate = useRef(new Animated.Value(68)).current;
  const truckOpacity = useRef(new Animated.Value(0)).current;
  const orbitRotation = useRef(new Animated.Value(0)).current;
  const shineProgress = useRef(new Animated.Value(0)).current;
  const redGlow = useRef(new Animated.Value(0.72)).current;

  const window = Dimensions.get("window");
  const logoSize = Math.min(window.width * 0.74, 340);
  const fullLogoWidth = Math.min(window.width * 0.78, 360);
  const fullLogoHeight = fullLogoWidth * 0.23;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduceMotion);
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    if (reduceMotion) {
      Animated.timing(fullOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setAllowExit(true);
      });
      return;
    }

    const spinLoop = Animated.loop(
      Animated.timing(orbitRotation, {
        toValue: 1,
        duration: SPIN_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(redGlow, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(redGlow, {
          toValue: 0.72,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(SHINE_LOOP_MS - 700),
        Animated.timing(shineProgress, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shineProgress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    spinLoop.start();
    glowLoop.start();
    shineLoop.start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(fullOpacity, {
          toValue: 1,
          duration: FULL_FADE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(fullScale, {
          toValue: 1,
          duration: FULL_FADE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(FULL_HOLD_MS),
      Animated.parallel([
        Animated.timing(fullExitOpacity, {
          toValue: 0,
          duration: MORPH_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(fullExitScale, {
          toValue: 0.84,
          duration: MORPH_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(whiteOpacity, {
          toValue: 1,
          duration: MORPH_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(whiteScale, {
          toValue: 1,
          duration: MORPH_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(mapOpacity, {
          toValue: 1,
          duration: MAP_FADE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shipOpacity, {
          toValue: 1,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(shipTranslate, {
          toValue: 0,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(truckOpacity, {
          toValue: 1,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(truckTranslate, {
          toValue: 0,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(INITIAL_SPIN_HOLD_MS),
      Animated.parallel([
        Animated.timing(blackOpacity, {
          toValue: 1,
          duration: BLACK_TRANSITION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(blackScale, {
          toValue: 1,
          duration: BLACK_TRANSITION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setAllowExit(true));

    return () => {
      spinLoop.stop();
      glowLoop.stop();
      shineLoop.stop();
    };
  }, [
    blackOpacity,
    blackScale,
    fullExitOpacity,
    fullExitScale,
    fullOpacity,
    fullScale,
    isVisible,
    mapOpacity,
    orbitRotation,
    redGlow,
    reduceMotion,
    shipOpacity,
    shipTranslate,
    shineProgress,
    truckOpacity,
    truckTranslate,
    whiteOpacity,
    whiteScale,
  ]);

  useEffect(() => {
    if (!appReady || !allowExit || !isVisible) return;
    Animated.timing(stageOpacity, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setIsVisible(false);
      onFinish();
    });
  }, [allowExit, appReady, isVisible, onFinish, stageOpacity]);

  const rotation = orbitRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const shineTranslate = shineProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-logoSize * 0.9, logoSize * 0.9],
  });

  const arcGlow = redGlow.interpolate({
    inputRange: [0.72, 1],
    outputRange: [0.72, 1],
  });

  if (!isVisible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: stageOpacity }]}>
      <View style={styles.stage}>
        <Animated.Image
          source={fullLogo}
          resizeMode="contain"
          style={[
            styles.fullLogo,
            {
              width: fullLogoWidth,
              height: fullLogoHeight,
              opacity: Animated.multiply(fullOpacity, fullExitOpacity),
              transform: [
                { scale: Animated.multiply(fullScale, fullExitScale) },
              ],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.iconStage,
            {
              width: logoSize,
              height: logoSize,
              opacity: whiteOpacity,
              transform: [{ scale: whiteScale }],
            },
          ]}
        >
          <Animated.View style={[styles.iconLayer, { opacity: mapOpacity }]}>
            <CropBox
              source={lightIcon}
              size={logoSize}
              frame={{ x: 46, y: 44, width: 934, height: 486 }}
              imageStyle={{ opacity: 0.98 }}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.iconLayer,
              {
                opacity: shipOpacity,
                transform: [{ translateX: shipTranslate }, { translateY: shipTranslate.interpolate({
                  inputRange: [0, 62],
                  outputRange: [0, 24],
                }) }],
              },
            ]}
          >
            <CropBox
              source={lightIcon}
              size={logoSize}
              frame={{ x: 26, y: 642, width: 400, height: 290 }}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.iconLayer,
              {
                opacity: truckOpacity,
                transform: [{ translateX: truckTranslate.interpolate({
                  inputRange: [0, 68],
                  outputRange: [0, -68],
                }) }, { translateY: truckTranslate.interpolate({
                  inputRange: [0, 68],
                  outputRange: [0, 18],
                }) }],
              },
            ]}
          >
            <CropBox
              source={lightIcon}
              size={logoSize}
              frame={{ x: 612, y: 632, width: 350, height: 318 }}
            />
          </Animated.View>

          <Animated.View style={[styles.iconLayer, { opacity: whiteOpacity }]}>
            <CropBox
              source={lightIcon}
              size={logoSize}
              frame={{ x: 172, y: 242, width: 692, height: 530 }}
            />
          </Animated.View>

          <Animated.View style={[styles.iconLayer, { opacity: blackOpacity, transform: [{ scale: blackScale }] }]}>
            <CropBox
              source={darkIcon}
              size={logoSize}
              frame={{ x: 46, y: 44, width: 934, height: 486 }}
              imageStyle={{ opacity: 0.98 }}
            />
            <CropBox
              source={darkIcon}
              size={logoSize}
              frame={{ x: 26, y: 642, width: 400, height: 290 }}
            />
            <CropBox
              source={darkIcon}
              size={logoSize}
              frame={{ x: 612, y: 632, width: 350, height: 318 }}
            />
            <CropBox
              source={darkIcon}
              size={logoSize}
              frame={{ x: 172, y: 242, width: 692, height: 530 }}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbitShell,
              {
                width: logoSize,
                height: logoSize,
                transform: [{ rotate: rotation }],
              },
            ]}
          >
            <Animated.View style={{ opacity: arcGlow }}>
              <CropBox
                source={darkIcon}
                size={logoSize}
                frame={{ x: 62, y: 108, width: 892, height: 270 }}
                imageStyle={styles.redArcShadow}
              />
            </Animated.View>
              <CropBox
                source={darkIcon}
                size={logoSize}
                frame={{ x: 102, y: 708, width: 820, height: 216 }}
                imageStyle={styles.silverArcShadow}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.shine,
              {
                width: logoSize * 0.32,
                height: logoSize * 1.05,
                transform: [{ translateX: shineTranslate }, { rotate: "-18deg" }],
              },
            ]}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
    backgroundColor: "#ffffff",
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  fullLogo: {
    position: "absolute",
  },
  iconStage: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orbitShell: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  cropFrame: {
    position: "absolute",
    overflow: "hidden",
  },
  redArcShadow: {
    shadowColor: "#ff2f45",
    shadowOpacity: 0.24,
    shadowRadius: 20,
  },
  silverArcShadow: {
    shadowColor: "#c9d0d8",
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  shine: {
    position: "absolute",
    top: -8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    opacity: 0.36,
  },
});
