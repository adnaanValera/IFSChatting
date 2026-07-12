import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  useWindowDimensions,
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
const SPIN_HOLD_MS = 1500;
const DARK_TRANSITION_MS = 800;
const EXIT_MS = 400;
const SPIN_DURATION_MS = 1500;
const SHINE_LOOP_MS = 3000;

const FRAMES = {
  map: { x: 46, y: 44, width: 934, height: 486 },
  letters: { x: 172, y: 242, width: 692, height: 530 },
  redArc: { x: 62, y: 108, width: 892, height: 270 },
  silverArc: { x: 102, y: 708, width: 820, height: 216 },
  ship: { x: 26, y: 642, width: 400, height: 290 },
  truck: { x: 612, y: 632, width: 350, height: 318 },
};

type AppSplashProps = {
  appReady: boolean;
  onFinish: () => void;
};

type Frame = { x: number; y: number; width: number; height: number };

type CropBoxProps = {
  source: ImageSourcePropType;
  frame: Frame;
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

function IconLayerSet({
  source,
  size,
  includeMap,
  includeVehicles,
  vehicleOpacity,
  shipTransform,
  truckTransform,
  lettersOpacity,
}: {
  source: ImageSourcePropType;
  size: number;
  includeMap: boolean;
  includeVehicles: boolean;
  vehicleOpacity?: Animated.AnimatedInterpolation<number> | Animated.Value;
  shipTransform?: StyleProp<any>;
  truckTransform?: StyleProp<any>;
  lettersOpacity?: Animated.AnimatedInterpolation<number> | Animated.Value;
}) {
  return (
    <>
      {includeMap ? (
        <CropBox source={source} size={size} frame={FRAMES.map} imageStyle={{ opacity: 0.98 }} />
      ) : null}

      {includeVehicles ? (
        <>
          <Animated.View style={[styles.iconLayer, { opacity: vehicleOpacity }, shipTransform]}>
            <CropBox source={source} size={size} frame={FRAMES.ship} />
          </Animated.View>
          <Animated.View style={[styles.iconLayer, { opacity: vehicleOpacity }, truckTransform]}>
            <CropBox source={source} size={size} frame={FRAMES.truck} />
          </Animated.View>
        </>
      ) : null}

      <Animated.View style={[styles.iconLayer, { opacity: lettersOpacity ?? 1 }]}>
        <CropBox source={source} size={size} frame={FRAMES.letters} />
      </Animated.View>
    </>
  );
}

export function AppSplash({ appReady, onFinish }: AppSplashProps) {
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [allowExit, setAllowExit] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const fullOpacity = useRef(new Animated.Value(0)).current;
  const fullScale = useRef(new Animated.Value(0.95)).current;
  const fullFadeOut = useRef(new Animated.Value(1)).current;
  const fullShrink = useRef(new Animated.Value(1)).current;
  const whiteOpacity = useRef(new Animated.Value(0)).current;
  const whiteScale = useRef(new Animated.Value(0.88)).current;
  const mapOpacity = useRef(new Animated.Value(0)).current;
  const vehicleOpacity = useRef(new Animated.Value(0)).current;
  const shipX = useRef(new Animated.Value(-72)).current;
  const shipY = useRef(new Animated.Value(26)).current;
  const truckX = useRef(new Animated.Value(86)).current;
  const truckY = useRef(new Animated.Value(18)).current;
  const darkOpacity = useRef(new Animated.Value(0)).current;
  const stageOpacity = useRef(new Animated.Value(1)).current;
  const orbitSpin = useRef(new Animated.Value(0)).current;
  const shineProgress = useRef(new Animated.Value(0)).current;
  const redGlow = useRef(new Animated.Value(0.72)).current;

  const logoSize = Math.min(width * 0.74, 340);
  const fullLogoWidth = Math.min(width * 0.78, 360);
  const fullLogoHeight = fullLogoWidth * 0.23;

  const shipTransform = useMemo(
    () => ({
      transform: [{ translateX: shipX }, { translateY: shipY }],
    }),
    [shipX, shipY],
  );

  const truckTransform = useMemo(
    () => ({
      transform: [{ translateX: truckX }, { translateY: truckY }],
    }),
    [truckX, truckY],
  );

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
      }).start(() => setAllowExit(true));
      return;
    }

    const orbitLoop = Animated.loop(
      Animated.timing(orbitSpin, {
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
        Animated.delay(SHINE_LOOP_MS - 650),
        Animated.timing(shineProgress, {
          toValue: 1,
          duration: 650,
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

    orbitLoop.start();
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
        Animated.timing(fullFadeOut, {
          toValue: 0,
          duration: MORPH_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(fullShrink, {
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
        Animated.timing(vehicleOpacity, {
          toValue: 1,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(shipX, {
          toValue: 0,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(shipY, {
          toValue: 0,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(truckX, {
          toValue: 0,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(truckY, {
          toValue: 0,
          duration: VEHICLE_MS,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(SPIN_HOLD_MS),
      Animated.timing(darkOpacity, {
        toValue: 1,
        duration: DARK_TRANSITION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => setAllowExit(true));

    return () => {
      orbitLoop.stop();
      glowLoop.stop();
      shineLoop.stop();
    };
  }, [
    darkOpacity,
    fullFadeOut,
    fullOpacity,
    fullScale,
    fullShrink,
    isVisible,
    mapOpacity,
    orbitSpin,
    reduceMotion,
    redGlow,
    shipX,
    shipY,
    shineProgress,
    truckX,
    truckY,
    vehicleOpacity,
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

  const fullLogoOpacity = Animated.multiply(fullOpacity, fullFadeOut);
  const fullLogoScale = Animated.multiply(fullScale, fullShrink);

  const whiteLayerOpacity = Animated.multiply(whiteOpacity, Animated.subtract(1, darkOpacity));
  const rotation = orbitSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const shineTranslate = shineProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-logoSize * 0.92, logoSize * 0.92],
  });
  const shineOpacity = shineProgress.interpolate({
    inputRange: [0, 0.12, 0.5, 0.88, 1],
    outputRange: [0, 0.18, 0.34, 0.18, 0],
  });
  const redGlowOpacity = redGlow.interpolate({
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
              opacity: fullLogoOpacity,
              transform: [{ scale: fullLogoScale }],
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
          <Animated.View style={[styles.iconLayer, { opacity: Animated.multiply(mapOpacity, Animated.subtract(1, darkOpacity)) }]}>
            <CropBox source={lightIcon} size={logoSize} frame={FRAMES.map} imageStyle={{ opacity: 0.98 }} />
          </Animated.View>

          <Animated.View style={styles.iconLayer}>
            <IconLayerSet
              source={lightIcon}
              size={logoSize}
              includeMap={false}
              includeVehicles
              vehicleOpacity={vehicleOpacity}
              shipTransform={shipTransform}
              truckTransform={truckTransform}
              lettersOpacity={whiteLayerOpacity}
            />
          </Animated.View>

          <Animated.View style={[styles.iconLayer, { opacity: darkOpacity }]}>
            <IconLayerSet
              source={darkIcon}
              size={logoSize}
              includeMap
              includeVehicles
              vehicleOpacity={vehicleOpacity}
              shipTransform={shipTransform}
              truckTransform={truckTransform}
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
            <Animated.View style={{ opacity: redGlowOpacity }}>
              <CropBox
                source={darkIcon}
                size={logoSize}
                frame={FRAMES.redArc}
                imageStyle={styles.redArcShadow}
              />
            </Animated.View>
            <CropBox
              source={darkIcon}
              size={logoSize}
              frame={FRAMES.silverArc}
              imageStyle={styles.silverArcShadow}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.shine,
              {
                width: logoSize * 0.28,
                height: logoSize * 1.08,
                opacity: shineOpacity,
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
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  silverArcShadow: {
    shadowColor: "#d8dee5",
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  shine: {
    position: "absolute",
    top: -12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.62)",
  },
});
