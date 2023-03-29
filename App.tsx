/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {
  Camera,
  FrameProcessorPlugins,
  useCameraDevices,
  useFrameProcessor,
} from 'react-native-vision-camera';

function App(): JSX.Element {
  const device = useCameraDevices().back;

  const [foo, setFoo] = useState({});
  useEffect(() => {
    const interval = setInterval(() => setFoo({}), 10);
    return () => clearInterval(interval);
  }, []);

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
    },
    // the frame processor is re-created on every change of `foo`.
    [foo],
  );

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
