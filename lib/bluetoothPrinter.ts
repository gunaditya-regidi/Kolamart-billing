/// <reference path="../types/web-bluetooth.d.ts" />

let device: BluetoothDevice | null = null;
let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
const deviceChangeListeners = new Set<(d: BluetoothDevice | null) => void>();

const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

export function isWebBluetoothAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    'bluetooth' in navigator &&
    (window as any).isSecureContext !== false
  );
}

function ensureBrowser() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    throw new Error('Bluetooth functions can only be used in the browser');
  }
  if (!('bluetooth' in navigator)) {
    throw new Error('Web Bluetooth API is not available in this browser');
  }
  if (!(window as any).isSecureContext) {
    throw new Error('Secure context required (https or localhost) for Web Bluetooth');
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

  const CHUNK = 20;
  const DELAY_MS = 30;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    await characteristic.writeValue(chunk as BufferSource);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

export function buildReceipt(order: any) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const LINE_WIDTH = 32;

  const padRight = (text: string, length: number) =>
    text.length > length ? text.slice(0, length) : text + ' '.repeat(length - text.length);

  const padLeft = (text: string, length: number) =>
    text.length > length ? text.slice(0, length) : ' '.repeat(length - text.length) + text;

  const divider = '-'.repeat(LINE_WIDTH);

  const companyName = (order.companyName || 'KOLAMART').toString();
  const gstNumber = (order.gstNumber || '<GST_NUMBER>').toString();
  const customerName = (order.customerName || '').toString();
  const customerPhone = (order.customerPhone || '').toString();
  const itemName = (order.item || '').toString();
  const quantity = (order.quantity ?? '').toString();
  const price = (order.price ?? '').toString();
  const total = (order.total ?? '').toString();
  const paymentMode = (order.paymentMode || '').toString();

  // Table column widths for 32-char line: 1+16+1+3+1+9+1 = 32
  const COL_ITEM = 16;
  const COL_QTY = 3;
  const COL_PRICE = 9;

  const headerBorder =
    '+' + '-'.repeat(COL_ITEM) + '+' + '-'.repeat(COL_QTY) + '+' + '-'.repeat(COL_PRICE) + '+';

  const tableHeader =
    '|' +
    padRight('ITEM', COL_ITEM) +
    '|' +
    padRight('QTY', COL_QTY) +
    '|' +
    padRight('PRICE', COL_PRICE) +
    '|';

  const itemRow =
    '|' +
    padRight(itemName, COL_ITEM) +
    '|' +
    padRight(quantity, COL_QTY) +
    '|' +
    padLeft(`₹${price}`, COL_PRICE) +
    '|';

  let receipt = '';

  // Initialize & header (center, double size for company name)
  receipt += ESC + '@';
  receipt += ESC + 'a' + '1'; // center
  receipt += GS + '!' + String.fromCharCode(17); // double height & width
  receipt += companyName + '\n';

  // Normal size but keep header center-aligned
  receipt += GS + '!' + '\x00';
  receipt += `GST No:  37AALCK4778K1ZQ\n`;
  receipt +=
    '9-2-18, Pithapuram Colony, Maddilapalem, Visakhapatnam, Andhra Pradesh 530013\n';
  receipt += 'Customer Care: 9848418582, 8374522989\n';
  receipt += divider + '\n';

  // Customer details (left)
  receipt += ESC + 'a' + '0';
  receipt += `Customer Name: ${customerName}\n`;
  receipt += `Phone        : ${customerPhone}\n`;
  receipt += divider + '\n';

  // Item table (box format)
  receipt += headerBorder + '\n';
  receipt += tableHeader + '\n';
  receipt += headerBorder + '\n';
  receipt += itemRow + '\n';
  receipt += headerBorder + '\n';

  // Total section (bold)
  receipt += ESC + 'E' + '\x01';
  receipt += `TOTAL AMOUNT: ₹${total}\n`;
  receipt += ESC + 'E' + '\x00';

  // Payment details
  receipt += `Payment Mode: ${paymentMode}\n`;
  receipt += divider + '\n';

  // Savings & footer (center)
  receipt += ESC + 'a' + '1';
  receipt += 'You saved ₹201/- per rice bag\n';
  receipt += 'Thank you\n';
  receipt += 'Visit Again 🙏\n\n';

  // Full cut
  receipt += GS + 'V' + '\x01';

  return receipt;
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

export async function requestPrinterWithFallback(): Promise<BluetoothDevice> {
  ensureBrowser();
  try {
    const d = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID],
    });
    await connectGattForDevice(d);
    return d;
  } catch (e: any) {
    // Fallback: accept all devices, then try to connect
    const d = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    });
    await connectGattForDevice(d);
    return d;
  }
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

export async function reconnectPrinter(): Promise<BluetoothDevice | null> {
  try {
    ensureBrowser();
    // If we still have a reference, try reconnecting
    if (device && device.gatt) {
      if (!device.gatt.connected) {
        await device.gatt.connect();
        await connectGattForDevice(device);
      }
      return device;
    }

    // Otherwise, try permitted devices (if supported)
    const list = await getPermittedDevices();
    if (list && list[0]) {
      await connectGattForDevice(list[0]);
      return list[0];
    }
  } catch {
    // swallow to allow client-side handling
  }
  return null;
}
