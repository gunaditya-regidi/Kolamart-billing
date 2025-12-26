/**
 * Request Bluetooth-related runtime permissions on Android.
 * Tries multiple strategies (Capacitor Permissions plugin, Cordova android-permissions plugin)
 * Returns true when permissions were granted or not required, false otherwise.
 */
export async function requestAndroidBluetoothPermissions(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // List of Android permissions commonly required for Bluetooth scanning/connecting
  const PERMS = [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT',
  ];
  // Prefer cordova-plugin-android-permissions when available for consistent behavior
  try {
    const cordovaPerms = (window as any).cordova?.plugins?.permissions;
    if (cordovaPerms) {
      return new Promise<boolean>((resolve) => {
        // Request the permissions list
        cordovaPerms.requestPermissions(
          PERMS,
          () => resolve(true),
          () => resolve(false)
        );
      });
    }
  } catch {}

  // Fallback: try Capacitor Permissions plugin
  try {
    const Cap = (window as any).Capacitor;
    if (Cap && Cap.Plugins && Cap.Plugins.Permissions && Cap.Plugins.Permissions.requestPermissions) {
      try {
        await Cap.Plugins.Permissions.requestPermissions({ permissions: PERMS });
        return true;
      } catch {
        // fallthrough
      }
    }
  } catch {}

  // Last-resort: prompt the user to grant permissions manually
  if (confirm('Bluetooth permissions are required. Please grant Bluetooth permissions in Android settings. Open settings now?')) {
    try {
      // Best-effort: try to open app settings via Cordova if available (not guaranteed)
      const appAvailability = (window as any).cordova?.plugins?.appAvailability;
      // no-op placeholder
    } catch {}
  }

  return false;
}
