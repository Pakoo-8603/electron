import keytar from 'keytar';

const SERVICE = 'hikvision-gateway';

export const saveDevicePassword = async (deviceId: string, password: string) => {
  await keytar.setPassword(SERVICE, deviceId, password);
};

export const getDevicePassword = async (deviceId: string) => keytar.getPassword(SERVICE, deviceId);

export const deleteDevicePassword = async (deviceId: string) => {
  await keytar.deletePassword(SERVICE, deviceId);
};
