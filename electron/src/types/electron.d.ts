export interface ElectronUpdaterBridge {
  onStatus: (callback: (data: any) => void) => () => void;
  restartAndInstall: () => void;
  checkForUpdates: () => void;
  getInfo: () => Promise<{ version: string; isPackaged: boolean; isPortable: boolean }>;
}

export interface ElectronNotifierBridge {
  sendNotification: (payload: { title: string; body: string }) => void;
}

export interface ElectronEnvBridge {
  platform: string;
  isPackaged: () => Promise<boolean>;
  getAuthToken?: () => Promise<string>;
  flaskPort?: number;
}

declare global {
  interface Window {
    electronUpdater?: ElectronUpdaterBridge;
    electronNotifier?: ElectronNotifierBridge;
    electronEnv?: ElectronEnvBridge;
  }
}
