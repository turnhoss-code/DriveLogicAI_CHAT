import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.DriveLogicAI_chat',
  appName: 'DriveLogic AI',
  webDir: 'dist',
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email", "https://www.googleapis.com/auth/drive"],
      serverClientId: "1052327499631-0panjl4ntatouhfvnf1b94880a4j4gpg.apps.googleusercontent.com",
      forceCodeForRefreshToken: true
    }
  }
};

export default config;
