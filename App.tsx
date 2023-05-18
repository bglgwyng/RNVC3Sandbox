/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useMemo, useState} from 'react';
import {Animated, StyleSheet, View, useWindowDimensions} from 'react-native';
import {
  Camera,
  Frame,
  FrameProcessorPlugins,
  useCameraDevices,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {} from 'react-native-worklets';
import {ContextType} from 'react-native-worklets/src';

function App(): JSX.Element {
  const device = useCameraDevices().front;

  const [trackedFaces, setTrackedFaces] = useState<
    (Face & {
      animatedXY: Animated.ValueXY;
      animatdWH: Animated.ValueXY;
    })[]
  >([]);

  const windowDimensions = useWindowDimensions();

  const handleScan = useRunInJSCallback(
    (frameDimensions: Dimensions, faces: Face[]) => {
      const {adjustPoint: adjustPosition, adjustSize} = ajdustToView(
        frameDimensions,
        windowDimensions,
      );

      setTrackedFaces(prevFaces => {
        return faces.map(i => {
          const face = prevFaces.find(j => j.trackingId === i.trackingId);

          const xy = adjustPosition({
            x: i.bounds.left,
            y: i.bounds.top,
          });
          const wh = adjustSize({
            x: i.bounds.width,
            y: i.bounds.height,
          });

          if (face) {
            Animated.parallel([
              Animated.spring(face.animatedXY, {
                toValue: xy,
                useNativeDriver: false,
              }),
              Animated.spring(face.animatdWH, {
                toValue: wh,
                useNativeDriver: false,
              }),
            ]).start();
            return face;
          } else {
            return {
              ...i,
              animatedXY: new Animated.ValueXY(xy),
              animatdWH: new Animated.ValueXY(wh),
            };
          }
        });
      });
    },
    [windowDimensions],
  );

  const frameProcessor = useFrameProcessor(frame => {
    'worklet';

    const scannedFaces = FrameProcessorPlugins.scanFaces(frame) as Face[];
    handleScan({width: frame.width, height: frame.height}, scannedFaces);
  }, []);

  return (
    <View style={{flex: 1}}>
      {device && (
        <Camera
          device={device}
          isActive
          frameProcessor={frameProcessor}
          style={{flex: 1}}
        />
      )}
      <View style={StyleSheet.absoluteFill}>
        {trackedFaces.map(i => {
          return (
            <Animated.View
              key={i.trackingId}
              style={[
                styles.boundingBox,
                {
                  top: i.animatedXY.y,
                  left: i.animatedXY.x,
                  width: i.animatdWH.x,
                  height: i.animatdWH.y,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export default App;

type Vec2D = {
  x: number;
  y: number;
};

type Face = {
  rollAngle: number;
  pitchAngle: number;
  yawAngle: number;
  bounds: {
    top: number;
    left: number;
    height: number;
    width: number;
  };
  trackingId?: number;
};

type Dimensions = {width: number; height: number};

const styles = StyleSheet.create({
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'white',
  },
});
const useRunInJSCallback = <C extends ContextType, T, A extends Array<unknown>>(
  fn: (this: C, ...args: A) => T,
  deps: unknown[],
): ((...args: A) => Promise<T>) =>
  useMemo(() => Worklets.createRunInJsFn(fn), deps);

const ajdustToView = (
  frameDimensions: Dimensions,
  viewDimensions: Dimensions,
) => {
  'worklet';
  const {width: viewWidth, height: viewHeight} = viewDimensions;

  const aspectRatio = viewWidth / viewHeight;

  const frameWidth = frameDimensions.width;
  const frameHeight = frameDimensions.height;

  const frameAspectRatio = frameWidth / frameHeight;

  let widthRatio: number;
  let heightRatio: number;
  let offsetX = 0;
  let offsetY = 0;
  if (frameAspectRatio < aspectRatio) {
    widthRatio = viewWidth / frameWidth;
    const croppedFrameHeight = frameWidth / aspectRatio;
    offsetY = (frameHeight - croppedFrameHeight) / 2;
    heightRatio = viewHeight / croppedFrameHeight;
  } else {
    heightRatio = viewHeight / frameHeight;
    const croppedFrameWidth = aspectRatio * frameHeight;
    offsetX = (frameWidth - croppedFrameWidth) / 2;
    widthRatio = viewWidth / croppedFrameWidth;
  }

  return {
    adjustPoint: (point: Vec2D): Vec2D => {
      let y = (point.y - offsetY) * heightRatio;

      return {
        x: (point.x - offsetX) * widthRatio,
        y,
      };
    },
    adjustSize: (size: Vec2D): Vec2D => {
      return {
        x: size.x * widthRatio,
        y: size.y * heightRatio,
      };
    },
  };
};
