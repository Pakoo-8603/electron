import type { GatewayApi } from './api';

declare global {
  interface Window {
    gatewayApi?: GatewayApi;
  }
}

export {};
