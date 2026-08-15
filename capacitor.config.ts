import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chomu.app',
  appName: 'ChoMU',
  webDir: 'dist',
  plugins: {
    // Routes fetch()/XHR-equivalent native calls through platform HTTP
    // libraries instead of the WebView, which is what lets ChoMU call
    // NVIDIA's API directly from the device without hitting browser CORS.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
