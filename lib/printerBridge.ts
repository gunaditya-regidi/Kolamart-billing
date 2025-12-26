import * as webPrinter from './bluetoothPrinter';
import { requestAndroidBluetoothPermissions } from './permissionHelper';

type NativeDevice = { id?: string; name?: string; mac?: string } | null;

const deviceChangeListeners = new Set<(d: any) => void>();

let nativeDevice: NativeDevice = null;

function notifyDeviceChange(d: any) {
  for (const cb of deviceChangeListeners) cb(d);
}

function isNativeAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as any).bluetoothSerial !== 'undefined';
}

export function isWebBluetoothAvailable(): boolean {
  return webPrinter.isWebBluetoothAvailable();
}

export function isNativeAndroidAvailable(): boolean {
  return isNativeAvailable();
}

async function nativeList(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const bs = (window as any).bluetoothSerial;
    if (!bs || !bs.list) return resolve([]);
    bs.list(
      (devices: any[]) => resolve(devices || []),
      (err: any) => reject(err)
    );
  });
}

async function nativeConnect(macOrId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const bs = (window as any).bluetoothSerial;
    if (!bs || !bs.connect) return reject(new Error('Native bluetoothSerial not available'));
    // connect expects mac address / id
    bs.connect(
      macOrId,
      () => {
        nativeDevice = { mac: macOrId, id: macOrId, name: macOrId };
        notifyDeviceChange(nativeDevice);
        resolve(nativeDevice);
      },
      (err: any) => {
        reject(err);
      }
    );
  });
}

async function nativeDisconnect(): Promise<void> {
  return new Promise((resolve, reject) => {
    const bs = (window as any).bluetoothSerial;
    if (!bs || !bs.disconnect) {
      nativeDevice = null;
      notifyDeviceChange(null);
      return resolve();
    }
    bs.disconnect(
      () => {
        nativeDevice = null;
        notifyDeviceChange(null);
        resolve();
      },
      (err: any) => {
        // still clear device
        nativeDevice = null;
        notifyDeviceChange(null);
        resolve();
      }
    );
  });
}

async function nativeWrite(data: Uint8Array | string): Promise<void> {
  return new Promise((resolve, reject) => {
    const bs = (window as any).bluetoothSerial;
    if (!bs || !bs.write) return reject(new Error('Native bluetoothSerial not available'));

    // The plugin accepts ArrayBuffer or string. If Uint8Array, pass its buffer.
    const payload: any = typeof data === 'string' ? data : (data as Uint8Array).buffer;
    bs.write(
      payload,
      () => resolve(),
      (err: any) => reject(err)
    );
  });
}

/* Public bridge API - keep same names as existing web module so page.tsx needn't change */
export async function requestPrinterWithFallback(): Promise<any> {
  if (isNativeAvailable()) {
    try {
      // Ensure runtime permissions on Android
      try {
        await requestAndroidBluetoothPermissions();
      } catch {}
      const list = await nativeList();
      // If there's an obvious match choose it (printer names often include ST- or Printer)
      const match = list.find((d: any) => /st[-_ ]?58|printer|pos|scantech/i.test(String(d.name || d.id || '')));
      if (match) {
        await nativeConnect(match.id || match.address || match.mac || match.name);
        return nativeDevice;
      }

      // If not found, ask user for MAC or choose first if only one paired device
      if (list.length === 1) {
        const d = list[0];
        await nativeConnect(d.id || d.address || d.mac || d.name);
        return nativeDevice;
      }

      // As a fallback prompt user for MAC/address (simple UX for now)
      const ask = typeof window !== 'undefined' ? window.prompt('Enter printer MAC/address (or cancel)') : null;
      if (!ask) throw new Error('No printer selected');
      await nativeConnect(ask.trim());
      return nativeDevice;
    } catch (e) {
      throw e;
    }
  }
  return webPrinter.requestPrinterWithFallback();
}

export async function requestAndSelectPrinter(): Promise<any> {
  return requestPrinterWithFallback();
}

export async function getPermittedDevices(): Promise<any[]> {
  if (isNativeAvailable()) {
    try {
      const list = await nativeList();
      return list;
    } catch {
      return [];
    }
  }
  return webPrinter.getPermittedDevices();
}

export function onDeviceChange(cb: (d: any) => void) {
  deviceChangeListeners.add(cb);
  // immediate call with current device
  try {
    if (isNativeAvailable()) cb(nativeDevice);
    else cb(webPrinter.getConnectedDevice());
  } catch {
    cb(null as any);
  }
  return () => deviceChangeListeners.delete(cb);
}

export function getConnectedDevice(): any {
  if (isNativeAvailable()) return nativeDevice;
  return webPrinter.getConnectedDevice();
}

export async function reconnectPrinter(): Promise<any | null> {
  if (isNativeAvailable()) {
    if (nativeDevice && nativeDevice.mac) {
      try {
        await nativeConnect(nativeDevice.mac);
        return nativeDevice;
      } catch {
        return null;
      }
    }
    try {
      const list = await nativeList();
      if (list && list[0]) {
        await nativeConnect(list[0].id || list[0].address || list[0].mac || list[0].name);
        return nativeDevice;
      }
    } catch {
      return null;
    }
    return null;
  }
  return webPrinter.reconnectPrinter();
}

export async function disconnectPrinter(): Promise<void> {
  if (isNativeAvailable()) {
    return nativeDisconnect();
  }
  return webPrinter.disconnectPrinter();
}

export async function printReceipt(text: string): Promise<void> {
  if (isNativeAvailable()) {
    // Convert text to bytes (ESC/POS sequences included)
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    await nativeWrite(data);
    return;
  }
  return webPrinter.printReceipt(text);
}

export { buildReceipt, buildBillReceipt, buildOrderReceipt } from './bluetoothPrinter';

/* Keep small helper for browser detection in existing code */
export { isWebBluetoothAvailable as checkWebBluetooth };
