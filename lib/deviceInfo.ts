export function getClientSource(): string {
  try {
    if (typeof window === 'undefined') return 'server';
    const w: any = window;
    const native = typeof w.bluetoothSerial !== 'undefined';
    if (native) return 'android-native';
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry/i.test(ua);
    if (mobile) return 'web-mobile';
    return 'web-desktop';
  } catch {
    return 'web-unknown';
  }
}
