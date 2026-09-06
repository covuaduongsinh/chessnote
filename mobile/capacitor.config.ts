import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chessnote.app',
  appName: 'ChessNote',
  webDir: '../client_bundle/client/.client',
  server: {
    androidScheme: 'https',
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1e293b",
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1e293b'
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK'
    }
  }
};

export default config;
