// Minimal Web Bluetooth type declarations for build environments
// These cover the members used in this project and avoid needing external @types packages.
interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(charUuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  writeValue(data: BufferSource): Promise<void>;
}

interface BluetoothDevice {
  id: string;
  name?: string | null;
  gatt?: BluetoothRemoteGATTServer | null;
  addEventListener?: (type: string, listener: EventListener) => void;
}

interface Navigator {
  bluetooth?: any;
}

export {};
