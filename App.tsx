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
  runAsync,
  runAtTargetFps,
  useCameraDevices,
  useFrameProcessor,
} from 'react-native-vision-camera';
import {} from 'react-native-worklets';
import {ContextType, useSharedValue} from 'react-native-worklets/src';

function App(): JSX.Element {
  const device = useCameraDevices().back;

  const [trackedFaces, setTrackedFaces] = useState<
    (Face & {
      animatedXY: Animated.ValueXY;
      animatdWH: Animated.ValueXY;
      tIdentified: Animated.Value;
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
              tIdentified: new Animated.Value(0),
            };
          }
        });
      });
    },
    [windowDimensions],
  );

  const confirmBillieEilish = useRunInJSCallback(
    (trackingId: number) => {
      const tIdentified = trackedFaces.find(
        i => i.trackingId === trackingId,
      )?.tIdentified;

      if (tIdentified) {
        Animated.spring(tIdentified, {
          toValue: 1,
          useNativeDriver: false,
        }).start();
      }
    },
    [trackedFaces],
  );
  const lastRecognizedAts = useSharedValue<Record<number, number>>({});

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';

      // `runAsync` doesn't work. why?
      // runAsync(frame, () =>

      const scannedFaces = FrameProcessorPlugins.scanFaces(frame) as Face[];
      handleScan({width: frame.width, height: frame.height}, scannedFaces);

      runAtTargetFps(1, () => {
        scannedFaces.sort((x, y) => {
          const xLastRecognizedAt = lastRecognizedAts.value[x.trackingId] ?? 0;
          const yLastRecognizedAt = lastRecognizedAts.value[y.trackingId] ?? 0;
          return xLastRecognizedAt - yLastRecognizedAt;
        });

        const now = Date.now();
        const facesToRecognize = scannedFaces.slice(0, recognitionBatchSize);
        if (facesToRecognize.length) {
          const embeddings = FrameProcessorPlugins.recognizeFaces(
            frame,
            facesToRecognize,
          ) as (number[] | null)[];

          for (const i of facesToRecognize) {
            lastRecognizedAts.value[i.trackingId] = now;
          }

          for (let index in embeddings) {
            const i = embeddings[index];
            if (!i) {
              continue;
            }

            const simliarity = cosineSimilarity(
              i,
              billieEiliishEmbeddingVector,
            );

            if (simliarity > identityThreshold) {
              confirmBillieEilish(facesToRecognize[index].trackingId);
            }
          }
        }
      });
    },
    [confirmBillieEilish],
  );

  return (
    <View style={{flex: 1}}>
      {device && (
        <Camera
          device={device}
          isActive
          frameProcessor={frameProcessor}
          style={StyleSheet.absoluteFill}
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
                  borderRadius: Animated.multiply(i.tIdentified, i.animatdWH.x),
                  borderColor: i.tIdentified.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['white', 'aquamarine'],
                  }),
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
  trackingId: number;
};

type Dimensions = {width: number; height: number};

const styles = StyleSheet.create({
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'white',
  },
});

const recognitionBatchSize = 3;
const identityThreshold = 0.65;

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

export const cosineSimilarity = (a: number[], b: number[]) => {
  'worklet';
  const dotProduct = a.reduce((acc, v, i) => acc + v * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
  const magnitudeB = Math.sqrt(b.reduce((acc, v) => acc + v * v, 0));
  return dotProduct / (magnitudeA * magnitudeB);
};

const billieEiliishEmbeddingVector = [
  -0.122785285115242, 0.7323654890060425, 1.8186454772949219,
  -0.07405339181423187, -0.3502454161643982, -1.780210018157959,
  0.8717036247253418, -1.884954571723938, -1.7255927324295044,
  2.0584425926208496, -0.7738637328147888, 1.1890373229980469,
  1.166603446006775, -1.3932439088821411, 1.305847406387329, 0.4761335849761963,
  0.09943726658821106, -0.3084028363227844, -0.6130689978599548,
  -0.6310731172561646, 0.9490154981613159, -0.9457316398620605,
  -0.8719262480735779, -0.9026984572410583, -2.324829339981079,
  0.127885103225708, -1.118138074874878, 0.9905142784118652, 1.004217505455017,
  0.47017624974250793, -0.4234074354171753, -1.2492942810058594,
  -1.06820547580719, 0.6659597158432007, 1.9769102334976196,
  -0.7030637860298157, -0.6566656231880188, 0.39719483256340027,
  1.8092820644378662, -0.1992103010416031, -0.2708507478237152,
  0.9472083449363708, -0.2978895604610443, 0.2879272401332855,
  -0.8607699275016785, 0.32106608152389526, 1.5187302827835083,
  0.7621185779571533, -0.3696380853652954, -1.3020375967025757,
  -0.911195695400238, 1.9465521574020386, -2.393951654434204,
  0.32454079389572144, 0.14078249037265778, 0.6260706186294556,
  1.0584450960159302, 1.5324469804763794, -0.7614163160324097,
  1.1575661897659302, -0.24295639991760254, -1.0850156545639038,
  -1.7587847709655762, 0.1364952176809311, 0.7820348739624023,
  1.728595495223999, 0.04822452738881111, 0.5885817408561707,
  1.5397584438323975, 0.5865169167518616, 0.6029133200645447,
  -0.5459648370742798, 0.31517818570137024, 0.46945273876190186,
  2.0141215324401855, 1.5584863424301147, -0.6106868982315063,
  -1.040252923965454, -0.7856086492538452, -0.9750537872314453,
  0.5637681484222412, -1.0849616527557373, 1.1120538711547852,
  -0.22211265563964844, -0.061015330255031586, -0.4100870192050934,
  -0.03349483013153076, 0.05382139980792999, -1.4485208988189697,
  0.9683917760848999, -1.6895525455474854, 1.0636826753616333,
  2.2565364837646484, -0.9515143632888794, 0.6745602488517761,
  1.031302809715271, -0.6008768677711487, 0.7470009326934814,
  0.6582226753234863, -0.5559025406837463, -1.2269936800003052,
  0.7124868035316467, -2.626443386077881, 0.3175358176231384,
  1.1533002853393555, 0.7394042015075684, 0.6745284795761108,
  0.02064351737499237, 0.2157362699508667, -0.16667073965072632,
  -0.06461776793003082, 1.381809115409851, -1.4644176959991455,
  -1.2403502464294434, 0.38398560881614685, 1.5654250383377075,
  -0.36807069182395935, 0.7851900458335876, 0.4979412257671356,
  -0.15520919859409332, 1.13584303855896, -0.7528394460678101,
  -0.02106676995754242, -0.7061430811882019, -0.0568288192152977,
  -0.06267081201076508, -0.6188294291496277, 0.2046029418706894,
];
