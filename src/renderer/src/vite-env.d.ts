/// <reference types="vite/client" />

declare global {
  interface Window {
    gatewayApi: {
      getSettings: () => Promise<any>;
      setSettings: (settings: any) => Promise<boolean>;
      listDevices: () => Promise<any[]>;
      saveDevice: (device: any) => Promise<boolean>;
      deleteDevice: (id: string) => Promise<boolean>;
      getStatus: () => Promise<any>;
      getRecentEvents: () => Promise<any[]>;
    };
  }
}

export {};
