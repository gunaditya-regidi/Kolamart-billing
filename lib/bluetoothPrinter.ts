/// <reference path="../types/web-bluetooth.d.ts" />

let device: BluetoothDevice | null = null;
let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
const deviceChangeListeners = new Set<(d: BluetoothDevice | null) => void>();

const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

function ensureBrowser() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    throw new Error('Bluetooth functions can only be used in the browser');
  }
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth API is not available in this browser');
  }
}

export async function connectPrinter() {
  ensureBrowser();
  // keep backwards compatible: request device and connect
  const d = await (navigator as any).bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID],
  });

  await connectGattForDevice(d);
}

async function connectGattForDevice(d: BluetoothDevice) {
  const server = await d.gatt!.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  characteristic = await service.getCharacteristic(CHAR_UUID);

  // listen for disconnects
  d.addEventListener && d.addEventListener('gattserverdisconnected', () => {
    if (device && device === d) {
      characteristic = null;
      device = null;
      notifyDeviceChange();
    }
  });

  device = d;
  notifyDeviceChange();
}

export async function disconnectPrinter() {
  if (device && device.gatt && device.gatt.connected) {
    device.gatt.disconnect();
  }
  device = null;
  characteristic = null;
  notifyDeviceChange();
}

export async function printReceipt(text: string) {
  ensureBrowser();
  if (!characteristic) throw new Error('Printer not connected');

  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  for (let i = 0; i < data.length; i += 20) {
    const chunk = data.slice(i, i + 20);
    await characteristic.writeValue(chunk as BufferSource);
    await new Promise((r) => setTimeout(r, 30));
  }
}

export function buildReceipt(order: any) {
  const ESC = '\x1B';
  const GS = '\x1D';

  return `${ESC}@${ESC}a1${GS}!17\nKOLAMART\n${GS}!0\n-----------------------------\nOrder: ${order.orderId}\nSME: ${order.workerId}\n-----------------------------\n${order.item}\n${order.quantity} x ${order.price}\n-----------------------------\nTOTAL: ₹${order.total}\nPayment: ${order.paymentMode}\n\nThank you!\nVisit Again\n\n${GS}V1`;
}

function notifyDeviceChange() {
  for (const cb of deviceChangeListeners) cb(device);
}

export function onDeviceChange(cb: (d: BluetoothDevice | null) => void) {
  deviceChangeListeners.add(cb);
  // immediately call with current device
  cb(device);
  return () => deviceChangeListeners.delete(cb);
}

export function getConnectedDevice(): BluetoothDevice | null {
  return device;
}

export async function requestAndSelectPrinter(): Promise<BluetoothDevice> {
  ensureBrowser();
  const d = await (navigator as any).bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID],
  });
  await connectGattForDevice(d);
  return d;
}

export async function getPermittedDevices(): Promise<BluetoothDevice[]> {
  ensureBrowser();
  if ((navigator as any).bluetooth.getDevices) {
    try {
      const devices: BluetoothDevice[] = await (navigator as any).bluetooth.getDevices();
      return devices;
    } catch {
      return device ? [device] : [];
    }
  }
  return device ? [device] : [];
}
