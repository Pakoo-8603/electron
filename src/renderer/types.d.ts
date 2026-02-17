declare global {
  interface Window {
    gatewayApi: {
      getState: () => Promise<any>;
      upsertDevice: (device: any) => Promise<any>;
      testDevice: (deviceId: string) => Promise<any>;
    };
  }
}

export {};
