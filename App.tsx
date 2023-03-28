/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import {View} from 'react-native';
import {
  Camera,
  FrameProcessorPlugins,
  useCameraDevices,
  useFrameProcessor,
} from 'react-native-vision-camera';

function App(): JSX.Element {
  const device = useCameraDevices().back;

  const frameProcessor = useFrameProcessor(frame => {
    'worklet';
    console.info(FrameProcessorPlugins);
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
    </View>
  );
}

export default App;
